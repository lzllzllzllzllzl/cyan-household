import 'dotenv/config';
import pg from 'pg';
import { today, effectiveAllergens } from './domain.js';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing. Copy .env.example to .env and configure Neon.');
const url = new URL(process.env.DATABASE_URL);
url.searchParams.delete('sslmode');
export const pool = new pg.Pool({ connectionString: url.toString(), ssl: { rejectUnauthorized: true }, max: 5, connectionTimeoutMillis: 15000 });
pool.on('error', () => console.error('Database connection interrupted.'));
export const legacyHousehold = '11111111-1111-4111-8111-111111111111';
export const defaultProfile = () => ({
  household_name: 'Your household', household_size: 1, diet: 'Balanced',
  goal: 'Everyday wellbeing', allergies: [], dislikes: '', timezone: 'Asia/Hong_Kong',
});
export async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
export async function log(client, household, action, detail, agent = 'You') {
  await client.query('INSERT INTO cyan_activity (household_id, action, detail, agent) VALUES ($1,$2,$3,$4)', [household, action, detail, agent]);
}
export async function initialize() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cyan_households (
      id uuid PRIMARY KEY, profile jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS cyan_users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      username text NOT NULL, username_key text NOT NULL UNIQUE,
      password_hash text NOT NULL,
      household_id uuid NOT NULL UNIQUE REFERENCES cyan_households(id),
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS cyan_sessions (
      token_hash text PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES cyan_users(id) ON DELETE CASCADE,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS cyan_sessions_user_idx ON cyan_sessions(user_id);
    CREATE INDEX IF NOT EXISTS cyan_sessions_expiry_idx ON cyan_sessions(expires_at);
    CREATE TABLE IF NOT EXISTS cyan_items (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      household_id uuid NOT NULL REFERENCES cyan_households(id),
      name text NOT NULL, category text NOT NULL, quantity numeric NOT NULL CHECK (quantity >= 0),
      unit text NOT NULL, location text NOT NULL, expiry_date text, date_type text NOT NULL,
      allergens jsonb NOT NULL DEFAULT '[]', safety_status text NOT NULL DEFAULT 'Normal',
      notes text NOT NULL DEFAULT '', source text NOT NULL DEFAULT 'Manual',
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS cyan_recipes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), household_id uuid NOT NULL REFERENCES cyan_households(id),
      data jsonb NOT NULL, source text NOT NULL, cooked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS cyan_activity (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), household_id uuid NOT NULL REFERENCES cyan_households(id),
      action text NOT NULL, detail text NOT NULL, agent text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS cyan_messages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), household_id uuid NOT NULL REFERENCES cyan_households(id),
      role text NOT NULL, content text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS cyan_feedback (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), household_id uuid NOT NULL REFERENCES cyan_households(id),
      category text NOT NULL, message text NOT NULL, status text NOT NULL DEFAULT 'Pending human review',
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await transaction(async client => {
    const inserted = await client.query('INSERT INTO cyan_households (id,profile) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING id', [
      legacyHousehold, JSON.stringify({ household_name: 'The Green House', household_size: 2, diet: 'Balanced', goal: 'Everyday wellbeing', allergies: [], dislikes: '', timezone: 'Asia/Hong_Kong' }),
    ]);
    if (!inserted.rowCount) return;
    const date = offset => new Date(Date.parse(`${today()}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
    const samples = [
      ['Baby spinach', 'Vegetables', 200, 'g', 'Fridge', 1],
      ['Cherry tomatoes', 'Vegetables', 8, 'pcs', 'Fridge', 2],
      ['Bananas', 'Fruit', 4, 'pcs', 'Counter', 3],
      ['Greek yogurt', 'Dairy & eggs', 500, 'g', 'Fridge', 5],
      ['Free-range eggs', 'Dairy & eggs', 6, 'pcs', 'Fridge', 9],
      ['Chicken breast', 'Protein', 400, 'g', 'Fridge', 2],
      ['Broccoli', 'Vegetables', 2, 'pcs', 'Fridge', 4],
      ['Lemons', 'Fruit', 3, 'pcs', 'Fridge', 10],
      ['Oat milk', 'Drinks', 1000, 'ml', 'Fridge', 7],
      ['Brown rice', 'Pantry', 1000, 'g', 'Pantry', 120],
      ['Rolled oats', 'Pantry', 500, 'g', 'Pantry', 90],
      ['Orange juice', 'Drinks', 750, 'ml', 'Fridge', 6],
    ];
    for (const [name, category, quantity, unit, location, offset] of samples) {
      await client.query(`INSERT INTO cyan_items (household_id,name,category,quantity,unit,location,expiry_date,date_type,allergens,notes,source)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Demo sample')`, [
        legacyHousehold, name, category, quantity, unit, location, date(offset),
        ['Protein', 'Dairy & eggs'].includes(category) ? 'Use by' : 'Best before',
        JSON.stringify(effectiveAllergens({ name })), 'Illustrative course sample. Replace with your actual food and package date.',
      ]);
    }
    await log(client, legacyHousehold, 'Welcome to your household', '12 illustrative food entries added for the course demo. Dates and quantities are fictional.', 'System');
  });
}
export async function getProfile(household, client = pool) {
  return (await client.query(`SELECT profile FROM cyan_households WHERE id=$1 ${client === pool ? '' : 'FOR SHARE'}`, [household])).rows[0].profile;
}
export async function getItems(household, client = pool, lock = false) {
  return (await client.query(`SELECT * FROM cyan_items WHERE household_id=$1 AND quantity > 0 ORDER BY expiry_date NULLS LAST, name ${lock ? 'FOR UPDATE' : ''}`, [household])).rows.map(i => ({ ...i, quantity: Number(i.quantity) }));
}
