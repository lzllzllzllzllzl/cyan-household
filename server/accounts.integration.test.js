import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

test('Register, use, sign out, sign in again, and isolate two Neon accounts', {
  skip: process.env.RUN_ACCOUNT_INTEGRATION !== '1',
  timeout: 60000,
}, async () => {
  const { pool, transaction } = await import('./db.js');
  const base = process.env.ACCOUNT_TEST_URL || 'http://127.0.0.1:3001/api';
  const created = [];
  const householdIds = [];
  function client() {
    let cookie = '';
    return {
      get cookie() { return cookie; },
      async request(route, body, method = body === undefined ? 'GET' : 'POST') {
        const response = await fetch(base + route, {
          method,
          headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          signal: AbortSignal.timeout(15000),
        });
        const setCookie = response.headers.get('set-cookie');
        if (setCookie) cookie = setCookie.split(';')[0];
        return { status: response.status, data: await response.json(), setCookie };
      },
    };
  }
  const a = client(), b = client(), outsider = client();
  const suffix = randomUUID().slice(0, 8);
  const nameA = `account-a-${suffix}@example.test`, nameB = `account-b-${suffix}`;
  try {
    assert.equal((await outsider.request('/state')).status, 401);
    assert.equal((await outsider.request('/items', { confirmed: true, items: [] })).status, 401);
    assert.equal((await outsider.request('/recognize', { text: 'tomatoes' })).status, 401);
    const registeredA = await a.request('/auth/register', { username: nameA, password: '1' });
    assert.equal(registeredA.status, 201);
    created.push(registeredA.data.account.id);
    assert.match(registeredA.setCookie, /HttpOnly/i);
    assert.match(registeredA.setCookie, /SameSite=Lax/i);
    const registeredB = await b.request('/auth/register', { username: nameB, password: '2' });
    assert.equal(registeredB.status, 201);
    created.push(registeredB.data.account.id);
    householdIds.push(...(await pool.query('SELECT household_id FROM cyan_users WHERE id=ANY($1::uuid[])', [created])).rows.map(r => r.household_id));
    assert.equal(new Set(householdIds).size, 2);
    assert.equal((await outsider.request('/auth/register', { username: nameA.toUpperCase(), password: '1' })).status, 409);
    assert.equal((await outsider.request('/auth/login', { username: nameA, password: 'wrong' })).status, 401);
    let stateA = (await a.request('/state')).data;
    let stateB = (await b.request('/state')).data;
    assert.equal(stateA.items.length, 0);
    assert.equal(stateB.items.length, 0);
    assert.equal(stateA.account.username, nameA);
    assert.equal(stateB.account.username, nameB);
    assert.ok(!JSON.stringify(stateA).includes('password_hash'));

    const food = { name: 'Account A bananas', category: 'Fruit', quantity: 3, unit: 'pcs', location: 'Counter', expiry_date: stateA.today, date_type: 'Best before', allergens: [], safety_status: 'Normal', notes: 'Private account A note' };
    const addedA = await a.request('/items', { confirmed: true, items: [food] });
    assert.equal(addedA.status, 201);
    const itemA = addedA.data.ids[0];
    stateA = (await a.request('/state')).data;
    const householdA = (await pool.query('SELECT household_id FROM cyan_users WHERE id=$1', [created[0]])).rows[0].household_id;
    const householdB = (await pool.query('SELECT household_id FROM cyan_users WHERE id=$1', [created[1]])).rows[0].household_id;
    const addedB = await b.request('/items', { confirmed: true, household_id: householdA, items: [{ ...food, name: 'Account B lemons', notes: 'Private account B note' }] });
    assert.equal(addedB.status, 201);
    assert.equal((await pool.query('SELECT household_id FROM cyan_items WHERE id=$1', [addedB.data.ids[0]])).rows[0].household_id, householdB);
    stateB = (await b.request('/state')).data;
    assert.deepEqual(stateB.items.map(i => i.name), ['Account B lemons']);
    assert.equal((await b.request(`/items/${itemA}`, { ...food, quantity: 90 }, 'PATCH')).status, 404);
    assert.equal((await b.request(`/items/${itemA}/adjust`, { quantity: 1, reason: 'Used' })).status, 409);
    assert.equal((await a.request('/state')).data.items[0].quantity, 3);
    await a.request('/profile', { ...stateA.profile, household_name: 'Account A kitchen', diet: 'Vegetarian', household_id: householdB }, 'PUT');
    assert.equal((await a.request('/state')).data.profile.household_name, 'Account A kitchen');
    assert.equal((await b.request('/state')).data.profile.household_name, 'Your household');
    assert.equal((await b.request('/state')).data.profile.diet, 'Balanced');
    await a.request('/feedback', { category: 'Other', message: 'Account A private feedback' });

    const recipe = { title: 'Account A banana snack', description: 'Account fixture', minutes: 2, servings: 1, ingredients: [{ item_id: itemA, quantity: 1, unit: 'pcs' }], steps: ['Peel and serve after checking condition.'], health_note: 'General snack idea', tags: [] };
    const recipeId = (await pool.query('INSERT INTO cyan_recipes (household_id,data,source) VALUES ($1,$2,$3) RETURNING id', [householdA, JSON.stringify(recipe), 'Account test'])).rows[0].id;
    await pool.query("INSERT INTO cyan_messages (household_id,role,content) VALUES ($1,'user',$2)", [householdA, 'Account A private message']);
    stateB = (await b.request('/state')).data;
    assert.equal(stateB.recipes.length, 0);
    assert.equal(stateB.messages.length, 0);
    assert.equal(stateB.feedback.length, 0);
    assert.ok(!JSON.stringify(stateB).includes('Private account A'));
    assert.ok(!stateB.activity.some(event => event.detail.includes('Account A')));
    assert.equal((await b.request(`/recipes/${recipeId}/cook`, { confirmed: true })).status, 409);
    assert.equal((await a.request(`/recipes/${recipeId}/cook`, { confirmed: true })).status, 200);
    assert.equal((await a.request('/state')).data.items[0].quantity, 2);
    assert.equal((await b.request('/state')).data.items[0].quantity, 3);
    const staleCookie = a.cookie;
    assert.equal((await a.request('/auth/logout', {})).status, 200);
    assert.equal((await a.request('/state')).status, 401);
    const staleResponse = await fetch(base + '/state', { headers: { Cookie: staleCookie } });
    assert.equal(staleResponse.status, 401);
    assert.equal((await a.request('/auth/login', { username: nameA.toUpperCase(), password: '1' })).status, 200);
    const restored = (await a.request('/state')).data;
    assert.equal(restored.items[0].quantity, 2);
    assert.equal(restored.profile.household_name, 'Account A kitchen');
    assert.equal(restored.messages[0].content, 'Account A private message');
    assert.equal(restored.feedback.length, 1);
    assert.equal((await b.request('/auth/me')).data.account.username, nameB);
    const sampleOwner = (await pool.query('SELECT id FROM cyan_users WHERE household_id=$1', ['11111111-1111-4111-8111-111111111111'])).rows[0];
    if (sampleOwner) {
      const demo = client();
      const opened = await demo.request('/auth/demo', { user_id: created[1], household_id: householdB });
      assert.equal(opened.status, 200);
      assert.equal(opened.data.account.id, sampleOwner.id);
      assert.equal((await demo.request('/state')).data.demo, true);
      await demo.request('/auth/logout', {});
    }
    await a.request('/auth/logout', {});
    await b.request('/auth/logout', {});
  } finally {
    // Remove only the exact accounts and fixture data created by this test.
    if (created.length) {
      await transaction(async db => {
        const ids = (await db.query('SELECT household_id FROM cyan_users WHERE id=ANY($1::uuid[])', [created])).rows.map(r => r.household_id);
        for (const table of ['cyan_items', 'cyan_recipes', 'cyan_activity', 'cyan_messages', 'cyan_feedback']) {
          await db.query(`DELETE FROM ${table} WHERE household_id=ANY($1::uuid[])`, [ids]);
        }
        await db.query('DELETE FROM cyan_users WHERE id=ANY($1::uuid[])', [created]);
        await db.query('DELETE FROM cyan_households WHERE id=ANY($1::uuid[])', [ids]);
      });
    }
    await pool.end();
  }
});
