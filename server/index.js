import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z, ZodError } from 'zod';
import { pool, legacyHousehold, initialize, transaction, log, getItems, getProfile } from './db.js';
import { authRouter, requireAccount } from './auth.js';
import { itemSchema, profileSchema, itemStatus, today, validateRecipe, effectiveAllergens } from './domain.js';
import { aiEnabled, recognize, makeRecipes, chat } from './ai.js';

const app = express();
if (process.env.VERCEL) app.set('trust proxy', 1);
let ready;
app.use('/api', async (req, res, next) => {
  try {
    ready ??= initialize().catch(error => { ready = undefined; throw error; });
    await ready;
    next();
  } catch (error) { next(error); }
});
app.use(express.json({ limit: '9mb' }));
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && !req.is('application/json')) return res.status(415).json({ error: 'Use a JSON request.' });
  const origin = req.headers.origin;
  const allowedOrigins = [`${req.protocol}://${req.get('host')}`];
  if (!process.env.VERCEL) allowedOrigins.push('http://127.0.0.1:5173', 'http://localhost:5173', 'http://127.0.0.1:3001', 'http://localhost:3001');
  if (origin && !allowedOrigins.includes(origin)) return res.status(403).json({ error: 'Cyan only accepts requests from its own origin.' });
  next();
});
app.use('/api/auth', authRouter);
app.use('/api', requireAccount);
app.get('/api/state', async (req, res) => {
  const household = req.account.household_id;
  const profile = await getProfile(household);
  const currentDate = today(profile.timezone);
  const items = (await getItems(household)).map(i => ({ ...i, allergens: effectiveAllergens(i), status: itemStatus(i, currentDate) }));
  const recipes = (await pool.query('SELECT * FROM cyan_recipes WHERE household_id=$1 AND cooked_at IS NULL ORDER BY created_at DESC LIMIT 3', [household])).rows;
  const activity = (await pool.query('SELECT * FROM cyan_activity WHERE household_id=$1 ORDER BY created_at DESC LIMIT 50', [household])).rows;
  const messages = (await pool.query('SELECT * FROM (SELECT * FROM cyan_messages WHERE household_id=$1 ORDER BY created_at DESC LIMIT 30) recent ORDER BY created_at', [household])).rows;
  const feedback = (await pool.query('SELECT * FROM cyan_feedback WHERE household_id=$1 ORDER BY created_at DESC LIMIT 20', [household])).rows;
  res.json({ account: { id: req.account.id, username: req.account.username }, profile, items, recipes, activity, messages, feedback, today: currentDate, connection: { database: 'Neon PostgreSQL', connected: true, ai: aiEnabled(), model: aiEnabled() ? (process.env.AI_MODEL || 'gpt-4o-mini') : null }, demo: household === legacyHousehold });
});
app.post('/api/items', async (req, res) => {
  const household = req.account.household_id;
  const input = z.object({ confirmed: z.literal(true), source: z.enum(['Manual', 'AI detection', 'Demo simulation']).default('Manual'), items: z.array(itemSchema).min(1).max(20) }).parse(req.body);
  const ids = await transaction(async client => {
    const ids = [];
    for (const item of input.items) {
      const result = await client.query(`INSERT INTO cyan_items (household_id,name,category,quantity,unit,location,expiry_date,date_type,allergens,safety_status,notes,source)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`, [
        household, item.name, item.category, item.quantity, item.unit, item.location, item.expiry_date,
        item.date_type, JSON.stringify(effectiveAllergens(item)), item.safety_status, item.notes, input.source,
      ]);
      ids.push(result.rows[0].id);
    }
    await log(client, household, 'Items confirmed & added', input.items.map(i => `${i.name} (${i.quantity} ${i.unit})`).join(', '), 'You · D1 approval');
    return ids;
  });
  res.status(201).json({ ids });
});
app.patch('/api/items/:id', async (req, res) => {
  const household = req.account.household_id;
  z.string().uuid().parse(req.params.id);
  const item = itemSchema.parse(req.body);
  await transaction(async client => {
    const existing = await client.query('SELECT * FROM cyan_items WHERE id=$1 AND household_id=$2 FOR UPDATE', [req.params.id, household]);
    if (!existing.rowCount) return res.status(404).json({ error: 'Item not found.' });
    if (existing.rows[0].expiry_date && (!item.expiry_date || item.expiry_date > existing.rows[0].expiry_date)) {
      const error = new Error('Cyan does not remove or extend a recorded package date. Keep the printed date; create a new batch for a new purchase.');
      error.status = 422; throw error;
    }
    await client.query(`UPDATE cyan_items SET name=$1,category=$2,quantity=$3,unit=$4,location=$5,expiry_date=$6,date_type=$7,allergens=$8,safety_status=$9,notes=$10 WHERE id=$11 AND household_id=$12`,
      [item.name, item.category, item.quantity, item.unit, item.location, item.expiry_date, item.date_type, JSON.stringify(effectiveAllergens(item)), item.safety_status, item.notes, req.params.id, household]);
    await log(client, household, 'Inventory corrected', `${item.name}: ${item.quantity} ${item.unit}; ${item.safety_status}.`);
  });
  if (!res.headersSent) res.json({ ok: true });
});
app.post('/api/items/:id/adjust', async (req, res) => {
  const household = req.account.household_id;
  z.string().uuid().parse(req.params.id);
  const input = z.object({ quantity: z.number().positive(), reason: z.enum(['Used', 'Discarded']) }).parse(req.body);
  await transaction(async client => {
    const item = (await client.query('SELECT * FROM cyan_items WHERE id=$1 AND household_id=$2 FOR UPDATE', [req.params.id, household])).rows[0];
    if (!item || Number(item.quantity) < input.quantity) { const e = new Error('There is not enough stock for this update.'); e.status = 409; throw e; }
    await client.query('UPDATE cyan_items SET quantity=quantity-$1 WHERE id=$2 AND household_id=$3', [input.quantity, item.id, household]);
    await log(client, household, `Food ${input.reason.toLowerCase()}`, `${input.quantity} ${item.unit} of ${item.name}.`);
  });
  res.json({ ok: true });
});
app.post('/api/recognize', async (req, res) => {
  const input = z.object({ image: z.string().max(8000000).regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/).optional(), text: z.string().max(2000).optional() }).refine(x => x.image || x.text, 'Upload a photo or enter a description.').parse(req.body);
  res.json(await recognize(input.image, input.text));
});
app.post('/api/recipes/generate', async (req, res) => {
  const household = req.account.household_id;
  const profile = await getProfile(household);
  const output = await makeRecipes(await getItems(household), profile);
  await transaction(async client => {
    // Old alternatives are replaced as one atomic operation.
    await client.query('DELETE FROM cyan_recipes WHERE household_id=$1 AND cooked_at IS NULL', [household]);
    for (const recipe of output.recipes) await client.query('INSERT INTO cyan_recipes (household_id,data,source) VALUES ($1,$2,$3)', [household, JSON.stringify(recipe), output.source]);
    await log(client, household, 'Meal ideas prepared', `${output.recipes.length} draft plans; inventory is unchanged until you confirm cooking.`, 'Agent B · Seizing');
  });
  res.json({ count: output.recipes.length, source: output.source });
});
app.post('/api/recipes/:id/cook', async (req, res) => {
  const household = req.account.household_id;
  z.string().uuid().parse(req.params.id);
  z.object({ confirmed: z.literal(true) }).parse(req.body);
  await transaction(async client => {
    const recipe = (await client.query('SELECT * FROM cyan_recipes WHERE id=$1 AND household_id=$2 FOR UPDATE', [req.params.id, household])).rows[0];
    if (!recipe || recipe.cooked_at) { const e = new Error('This meal has already been recorded or replaced.'); e.status = 409; throw e; }
    const items = await getItems(household, client, true);
    const profile = await getProfile(household, client);
    validateRecipe(recipe.data, items, profile);
    for (const i of recipe.data.ingredients) await client.query('UPDATE cyan_items SET quantity=quantity-$1 WHERE id=$2 AND household_id=$3', [i.quantity, i.item_id, household]);
    await client.query('UPDATE cyan_recipes SET cooked_at=now() WHERE id=$1 AND household_id=$2', [recipe.id, household]);
    await log(client, household, 'Meal cooked & stock updated', recipe.data.title, 'You · D2 approval');
  });
  res.json({ ok: true });
});
app.put('/api/profile', async (req, res) => {
  const household = req.account.household_id;
  const profile = profileSchema.parse(req.body);
  await transaction(async client => {
    await client.query('UPDATE cyan_households SET profile=$1 WHERE id=$2', [JSON.stringify(profile), household]);
    await log(client, household, 'Preferences approved', `Diet: ${profile.diet}; goal: ${profile.goal}; ${profile.allergies.length} allergen exclusions.`, 'You · D2 approval');
  });
  res.json({ ok: true });
});
app.post('/api/chat', async (req, res) => {
  const household = req.account.household_id;
  const { message } = z.object({ message: z.string().trim().min(1).max(2000) }).parse(req.body);
  const history = (await pool.query('SELECT * FROM (SELECT * FROM cyan_messages WHERE household_id=$1 ORDER BY created_at DESC LIMIT 10) recent ORDER BY created_at', [household])).rows;
  const output = await chat(message, history, await getItems(household), await getProfile(household));
  await transaction(async client => {
    await client.query("INSERT INTO cyan_messages (household_id,role,content) VALUES ($1,'user',$2)", [household, message]);
    await client.query("INSERT INTO cyan_messages (household_id,role,content) VALUES ($1,'assistant',$2)", [household, output.reply]);
  });
  res.json(output);
});
app.post('/api/feedback', async (req, res) => {
  const household = req.account.household_id;
  const input = z.object({ category: z.enum(['Recognition correction', 'Meal suggestion', 'Workflow improvement', 'Other']), message: z.string().trim().min(3).max(2000) }).parse(req.body);
  await transaction(async client => {
    await client.query('INSERT INTO cyan_feedback (household_id,category,message) VALUES ($1,$2,$3)', [household, input.category, input.message]);
    await log(client, household, 'Feedback queued for review', input.message, 'Agent C · Reconfiguring');
  });
  res.status(201).json({ ok: true });
});
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
app.use(express.static(path.join(root, 'dist')));
app.get('/{*path}', (req, res) => res.sendFile(path.join(root, 'dist/index.html')));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = error instanceof ZodError ? 400 : (error.status || 500);
  const message = error instanceof ZodError ? error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') : error.message;
  // Never return raw database errors, which can contain connection information.
  res.status(status).json({ error: error.code || error instanceof SyntaxError ? 'The request could not be completed. Check your input and try again.' : message });
});
export default app;
if (!process.env.VERCEL) {
  ready = initialize();
  await ready;
  app.listen(Number(process.env.PORT || 3001), '127.0.0.1', () => console.log(`Cyan API ready at http://127.0.0.1:${process.env.PORT || 3001} · Neon connected · AI ${aiEnabled() ? 'enabled' : 'demo mode'}`));
}
