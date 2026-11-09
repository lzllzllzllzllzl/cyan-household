import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

test('Live planning persists reviewed undated food, dish images and rejects cooking after a preference change', {
  skip: process.env.RUN_ACCOUNT_INTEGRATION !== '1', timeout: 180000,
}, async () => {
  const { pool, transaction } = await import('./db.js');
  const base = process.env.ACCOUNT_TEST_URL || 'http://127.0.0.1:3001/api';
  let cookie = '', account;
  async function request(route, body, method = body === undefined ? 'GET' : 'POST') {
    const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(60000) });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
    return { status: response.status, data: await response.json() };
  }
  try {
    const registered = await request('/auth/register', { username: `recipe-${randomUUID()}@example.test`, password: 'test' });
    assert.equal(registered.status, 201); account = registered.data.account.id;
    assert.equal((await request('/recipes/generate', {})).data.count, 0);
    const food = { name: 'Bananas', category: 'Fruit', quantity: 2, unit: 'pcs', location: 'Counter', expiry_date: null, date_type: 'Unknown', allergens: [], safety_status: 'Normal', notes: '' };
    const added = await request('/items', { confirmed: true, items: [food] });
    assert.equal(added.status, 201);
    assert.equal((await request('/recipes/generate', {})).data.count, 0);
    assert.equal((await request(`/items/${added.data.ids[0]}`, { ...food, condition_reviewed: true }, 'PATCH')).status, 200);
    assert.equal((await request('/recipes/generate', {})).status, 200);
    let state = (await request('/state')).data;
    assert.equal(state.items[0].expiry_date, null);
    assert.equal(state.items[0].condition_reviewed, true);
    assert.equal(state.recipes.length, 1);
    assert.equal(state.recipes[0].data.image_key, 'fruit-plate');
    console.log(`Single-food planner: ${state.recipes[0].source}`);
    await request('/items', { confirmed: true, items: [
      { ...food, name: 'Tomatoes', category: 'Vegetables', condition_reviewed: true },
      { ...food, name: 'Penne pasta', category: 'Pantry', unit: 'g', quantity: 200, condition_reviewed: true },
    ] });
    assert.equal((await request('/recipes/generate', {})).status, 200);
    state = (await request('/state')).data;
    const pasta = state.recipes.find(r => r.data.template_id === 'tomato-pasta');
    assert.ok(pasta);
    assert.equal(pasta.data.image_url, '/recipes/tomato-pasta.webp');
    console.log(`Varied-food planner: ${pasta.source}`);
    assert.equal((await request('/profile', { ...state.profile, allergies: ['Wheat'] }, 'PUT')).status, 200);
    assert.equal((await request(`/recipes/${pasta.id}/cook`, { confirmed: true })).status, 422);
    assert.equal((await request('/state')).data.items.find(i => i.name === 'Penne pasta').quantity, 200);
    await request('/auth/logout', {});
  } finally {
    if (account) await transaction(async db => {
      const household = (await db.query('SELECT household_id FROM cyan_users WHERE id=$1', [account])).rows[0].household_id;
      for (const table of ['cyan_items', 'cyan_recipes', 'cyan_activity', 'cyan_messages', 'cyan_feedback']) await db.query(`DELETE FROM ${table} WHERE household_id=$1`, [household]);
      await db.query('DELETE FROM cyan_users WHERE id=$1', [account]);
      await db.query('DELETE FROM cyan_households WHERE id=$1', [household]);
    });
    await pool.end();
  }
});
