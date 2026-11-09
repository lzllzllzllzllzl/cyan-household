import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRecipes, recognize } from './ai.js';
import { ruleRecipes } from './domain.js';

const profile = { diet: 'Balanced', goal: 'Everyday wellbeing', allergies: [], dislikes: '', timezone: 'Asia/Hong_Kong' };
const banana = { id: '22222222-2222-4222-8222-222222222222', name: 'Bananas', category: 'Fruit', quantity: 2, unit: 'pcs', location: 'Counter', expiry_date: null, date_type: 'Unknown', condition_reviewed: true, allergens: [], safety_status: 'Normal', notes: '' };
test('Model output is constrained to candidates, duplicates are removed, invalid stock falls back and recognition cannot grant review', async () => {
  const previousKey = process.env.AI_API_KEY;
  const original = globalThis.fetch;
  process.env.AI_API_KEY = 'fictional-test-key';
  let output;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(output) } }] }) });
  try {
    const candidate = ruleRecipes([banana], profile)[0];
    output = { recipes: [{ ...candidate, description: 'Adjusted by the model' }, candidate] };
    let result = await makeRecipes([banana], profile);
    assert.equal(result.source, 'AI + inventory recipe rules');
    assert.equal(result.recipes.length, 1);
    assert.equal(result.recipes[0].description, 'Adjusted by the model');
    const apple = { ...banana, id: '33333333-3333-4333-8333-333333333333', name: 'Apples' };
    output = { recipes: [{ ...candidate, ingredients: [...candidate.ingredients, { item_id: apple.id, quantity: 1, unit: 'pcs' }] }] };
    result = await makeRecipes([banana, apple], profile);
    assert.equal(result.source, 'AI + inventory recipe rules');
    assert.equal(result.recipes[0].ingredients.length, 2);
    output = { recipes: [{ ...candidate, ingredients: [{ item_id: apple.id, quantity: 1, unit: 'pcs' }] }] };
    assert.match((await makeRecipes([banana, apple], profile)).source, /AI unavailable/);
    output = { recipes: [{ ...candidate, ingredients: [{ item_id: banana.id, quantity: 3, unit: 'pcs' }] }] };
    result = await makeRecipes([banana], profile);
    assert.match(result.source, /AI unavailable or response not validated/);
    assert.equal(result.recipes[0].ingredients[0].quantity, 1);
    output = { recipes: [{ ...candidate, template_id: 'salmon-rice', image_url: 'https://example.test/fake' }] };
    result = await makeRecipes([banana], profile);
    assert.equal(result.recipes[0].image_key, 'fruit-plate');
    output = { items: [banana] };
    assert.equal((await recognize(undefined, 'two bananas')).items[0].condition_reviewed, false);
    globalThis.fetch = async () => { throw new Error('Provider offline'); };
    assert.equal((await makeRecipes([banana], profile)).recipes.length, 1);
    assert.equal((await makeRecipes([{ ...banana, condition_reviewed: false }], profile)).recipes.length, 0);
  } finally {
    globalThis.fetch = original;
    if (previousKey === undefined) delete process.env.AI_API_KEY; else process.env.AI_API_KEY = previousKey;
  }
});
