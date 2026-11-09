import { Router } from 'express';
import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { z } from 'zod';
import { pool, legacyHousehold, transaction, defaultProfile, log } from './db.js';

const derive = promisify(scrypt);
const COOKIE = 'cyan_session';
const SESSION_AGE = 7 * 24 * 60 * 60 * 1000;
export const credentialsSchema = z.object({
  username: z.string().trim().min(1, 'Enter an email or username.').max(254),
  password: z.string().min(1, 'Enter a password.').max(256),
});
export const usernameKey = value => value.trim().normalize('NFKC').toLowerCase();
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await derive(password, salt, 64);
  return `scrypt:${salt}:${hash.toString('hex')}`;
}
export async function verifyPassword(password, stored) {
  const [algorithm, salt, encoded] = stored.split(':');
  if (algorithm !== 'scrypt' || !salt || !/^[a-f0-9]{128}$/.test(encoded || '')) return false;
  const hash = await derive(password, salt, 64);
  return timingSafeEqual(hash, Buffer.from(encoded, 'hex'));
}
const digest = value => createHash('sha256').update(value).digest('hex');
function sessionToken(req) {
  const raw = req.headers.cookie?.split(';').map(x => x.trim()).find(x => x.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  return raw && /^[A-Za-z0-9_-]{43}$/.test(raw) ? raw : null;
}
const cookieOptions = req => ({ httpOnly: true, sameSite: 'lax', secure: req.secure, path: '/' });
async function createSession(client, userId) {
  const token = randomBytes(32).toString('base64url');
  await client.query('INSERT INTO cyan_sessions (token_hash,user_id,expires_at) VALUES ($1,$2,$3)', [digest(token), userId, new Date(Date.now() + SESSION_AGE)]);
  return token;
}
export async function currentAccount(req) {
  const token = sessionToken(req);
  if (!token) return null;
  return (await pool.query(`SELECT u.id,u.username,u.household_id
    FROM cyan_sessions s JOIN cyan_users u ON u.id=s.user_id
    WHERE s.token_hash=$1 AND s.expires_at>now()`, [digest(token)])).rows[0] || null;
}
const publicAccount = account => ({ id: account.id, username: account.username });
export async function requireAccount(req, res, next) {
  const account = await currentAccount(req);
  if (!account) return res.status(401).json({ error: 'Please sign in to open your kitchen.' });
  req.account = account;
  next();
}
export const authRouter = Router();
authRouter.get('/me', async (req, res) => {
  const account = await currentAccount(req);
  if (!account) return res.status(401).json({ error: 'Please sign in to open your kitchen.' });
  res.json({ account: publicAccount(account) });
});
authRouter.post('/register', async (req, res) => {
  const input = credentialsSchema.parse(req.body);
  const passwordHash = await hashPassword(input.password);
  let result;
  try {
    result = await transaction(async client => {
      const household = randomUUID();
      await client.query('INSERT INTO cyan_households (id,profile) VALUES ($1,$2)', [household, JSON.stringify(defaultProfile())]);
      const user = (await client.query('INSERT INTO cyan_users (username,username_key,password_hash,household_id) VALUES ($1,$2,$3,$4) RETURNING id,username', [
        input.username, usernameKey(input.username), passwordHash, household,
      ])).rows[0];
      await log(client, household, 'Your kitchen is ready', 'Account created. Add your first groceries to your personal inventory.', 'You');
      return { user, token: await createSession(client, user.id) };
    });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'That email or username is already registered. Try signing in.' });
    throw error;
  }
  res.cookie(COOKIE, result.token, { ...cookieOptions(req), maxAge: SESSION_AGE });
  res.status(201).json({ account: publicAccount(result.user) });
});
authRouter.post('/login', async (req, res) => {
  const input = credentialsSchema.parse(req.body);
  const user = (await pool.query('SELECT * FROM cyan_users WHERE username_key=$1', [usernameKey(input.username)])).rows[0];
  if (!user || !(await verifyPassword(input.password, user.password_hash))) return res.status(401).json({ error: 'The username or password is incorrect.' });
  const token = await transaction(async client => {
    const previous = sessionToken(req);
    if (previous) await client.query('DELETE FROM cyan_sessions WHERE token_hash=$1', [digest(previous)]);
    return createSession(client, user.id);
  });
  res.cookie(COOKIE, token, { ...cookieOptions(req), maxAge: SESSION_AGE });
  res.json({ account: publicAccount(user) });
});
authRouter.post('/demo', async (req, res) => {
  // This public entry can only open the designated sample kitchen.
  const user = (await pool.query('SELECT id,username FROM cyan_users WHERE household_id=$1', [legacyHousehold])).rows[0];
  if (!user) return res.status(404).json({ error: 'The sample kitchen is not ready yet. Please try again later.' });
  const token = await transaction(async client => {
    const previous = sessionToken(req);
    if (previous) await client.query('DELETE FROM cyan_sessions WHERE token_hash=$1', [digest(previous)]);
    return createSession(client, user.id);
  });
  res.cookie(COOKIE, token, { ...cookieOptions(req), maxAge: SESSION_AGE });
  res.json({ account: publicAccount(user) });
});
authRouter.post('/logout', async (req, res) => {
  const token = sessionToken(req);
  if (token) await pool.query('DELETE FROM cyan_sessions WHERE token_hash=$1', [digest(token)]);
  res.clearCookie(COOKIE, cookieOptions(req));
  res.json({ ok: true });
});
