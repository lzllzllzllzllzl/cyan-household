import { randomUUID } from 'node:crypto';
import { pool, initialize, legacyHousehold, transaction, log } from './db.js';
import { hashPassword, usernameKey } from './auth.js';

// Public credentials for the editable course sample, not a personal account.
const username = 'demo@cyan.example';
const password = 'demo';
try {
  await initialize();
  const passwordHash = await hashPassword(password);
  const result = await transaction(async db => {
    await db.query('SELECT id FROM cyan_households WHERE id=$1 FOR UPDATE', [legacyHousehold]);
    const owner = (await db.query('SELECT username FROM cyan_users WHERE household_id=$1', [legacyHousehold])).rows[0];
    if (owner) return { created: false, username: owner.username };
    const collision = (await db.query('SELECT id FROM cyan_users WHERE username_key=$1', [usernameKey(username)])).rowCount;
    if (collision) throw new Error('The demo username belongs to another account. No account or sample data was changed.');
    await db.query('INSERT INTO cyan_users (id,username,username_key,password_hash,household_id) VALUES ($1,$2,$3,$4,$5)', [
      randomUUID(), username, usernameKey(username), passwordHash, legacyHousehold,
    ]);
    await log(db, legacyHousehold, 'Sample account connected', 'The existing course sample kitchen can now be opened and edited from its own login.', 'System');
    return { created: true, username };
  });
  const items = (await pool.query('SELECT count(*)::int AS count FROM cyan_items WHERE household_id=$1 AND quantity>0', [legacyHousehold])).rows[0].count;
  console.log(JSON.stringify({ ...result, ...(result.created ? { password } : {}), activeSampleItems: items, note: result.created ? 'Existing sample data linked; no food records were copied or reset.' : 'Existing owner and password preserved.' }, null, 2));
} finally { await pool.end(); }
