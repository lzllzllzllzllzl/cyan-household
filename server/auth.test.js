import test from 'node:test';
import assert from 'node:assert/strict';
import { credentialsSchema, usernameKey, hashPassword, verifyPassword } from './auth.js';

test('Registration accepts a short username and one-character password without email or complexity rules', () => {
  assert.deepEqual(credentialsSchema.parse({ username: 'a', password: '1' }), { username: 'a', password: '1' });
  assert.throws(() => credentialsSchema.parse({ username: ' ', password: '1' }));
  assert.throws(() => credentialsSchema.parse({ username: 'a', password: '' }));
  assert.equal(usernameKey(' User@Example.COM '), 'user@example.com');
});
test('Passwords are salted and verified correctly, including spaces and Unicode', async () => {
  const first = await hashPassword('1'), second = await hashPassword('1');
  assert.notEqual(first, second);
  assert.ok(await verifyPassword('1', first));
  assert.equal(await verifyPassword('2', first), false);
  const unicode = await hashPassword(' 密码 ');
  assert.ok(await verifyPassword(' 密码 ', unicode));
  assert.equal(await verifyPassword('密码', unicode), false);
});
test('Malformed password hashes fail closed', async () => {
  assert.equal(await verifyPassword('1', 'plaintext'), false);
  assert.equal(await verifyPassword('1', 'scrypt:salt:invalid'), false);
});
