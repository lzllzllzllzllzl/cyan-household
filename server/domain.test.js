import test from 'node:test';
import assert from 'node:assert/strict';
import { daysLeft, eligibleItems, validateRecipe, itemSchema, itemStatus, today, ruleRecipes } from './domain.js';
import { recipeImage } from '../recipe-catalog.js';

const profile = { household_name: 'Test', household_size: 1, diet: 'Balanced', goal: 'Everyday wellbeing', allergies: [], dislikes: '', timezone: 'Asia/Hong_Kong' };
const item = (extra = {}) => ({ id: '22222222-2222-4222-8222-222222222222', name: 'Baby spinach', category: 'Vegetables', quantity: 200, unit: 'g', location: 'Fridge', expiry_date: today(), date_type: 'Best before', allergens: [], safety_status: 'Normal', notes: '', ...extra });
const recipe = extra => ({ title: 'Spinach plate', description: 'Test', minutes: 10, servings: 1, ingredients: [{ item_id: item().id, quantity: 100, unit: 'g' }], steps: ['Prepare according to trusted instructions.'], health_note: 'General inspiration.', tags: [], ...extra });
test('Date boundaries are calendar based, with today eligible and yesterday excluded', () => {
  const now = '2026-11-09';
  assert.equal(daysLeft(item({ expiry_date: '2026-11-09' }), now), 0);
  assert.equal(itemStatus(item({ expiry_date: '2026-11-12' }), now), 'Use first');
  assert.equal(itemStatus(item({ expiry_date: '2026-11-13' }), now), 'In date');
  assert.equal(eligibleItems([item({ expiry_date: '2026-11-08' })], profile, now).length, 0);
});
test('Unknown dates, flagged condition and empty quantities never enter a plan', () => {
  assert.equal(eligibleItems([item({ expiry_date: null }), item({ safety_status: 'Check needed' }), item({ quantity: 0 })], profile).length, 0);
});
test('Allergen labels and conservative name matches are enforced independently of AI', () => {
  assert.equal(eligibleItems([item({ name: 'Greek yogurt', allergens: [] })], { ...profile, allergies: ['Milk'] }).length, 0);
  assert.equal(eligibleItems([item({ allergens: ['Sesame'] })], { ...profile, allergies: ['Sesame'] }).length, 0);
});
test('Vegetarian preference and comma-separated dislikes exclude matching ingredients', () => {
  assert.equal(eligibleItems([item({ name: 'Chicken breast', category: 'Protein' })], { ...profile, diet: 'Vegetarian' }).length, 0);
  assert.equal(eligibleItems([item()], { ...profile, dislikes: 'olives, spinach' }).length, 0);
});
test('Cook-time validation rejects stale inventory, duplicate ingredient IDs and unit changes', () => {
  assert.throws(() => validateRecipe(recipe(), [item({ quantity: 50 })], profile));
  assert.throws(() => validateRecipe(recipe({ ingredients: [{ item_id: item().id, quantity: 1, unit: 'kg' }] }), [item()], profile));
  assert.throws(() => validateRecipe(recipe({ ingredients: [{ item_id: item().id, quantity: 100, unit: 'g' }, { item_id: item().id, quantity: 100, unit: 'g' }] }), [item()], profile));
  assert.throws(() => validateRecipe(recipe(), [item({ safety_status: 'Check needed' })], profile));
  assert.equal(validateRecipe(recipe(), [item()], profile).title, 'Spinach plate');
});
test('Input validation rejects impossible dates and negative stock', () => {
  assert.throws(() => itemSchema.parse(item({ expiry_date: '2026-02-30' })));
  assert.throws(() => itemSchema.parse(item({ quantity: -1 })));
});
test('Undated food requires explicit review, which never creates an expiry or bypasses flags', () => {
  const fresh = item({ expiry_date: null, condition_reviewed: true });
  assert.equal(eligibleItems([fresh], profile).length, 1);
  assert.equal(itemStatus(fresh), 'Date unknown');
  assert.equal(daysLeft(fresh), null);
  assert.equal(eligibleItems([{ ...fresh, safety_status: 'Check needed' }], profile).length, 0);
  assert.equal(eligibleItems([item({ expiry_date: '2000-01-01', condition_reviewed: true })], profile).length, 0);
  assert.equal(itemSchema.parse(item({ expiry_date: null })).condition_reviewed, false);
});
test('Dish matching requires core ingredients and quantities retain inventory units', () => {
  const tomato = item({ name: 'Tomatoes', quantity: 0.2, unit: 'kg' });
  const pasta = item({ id: '33333333-3333-4333-8333-333333333333', name: 'Penne pasta', category: 'Pantry', quantity: 0.05, unit: 'kg' });
  assert.equal(ruleRecipes([tomato], profile).length, 0);
  const plans = ruleRecipes([tomato, pasta], profile);
  assert.equal(plans.length, 1);
  assert.equal(plans[0].template_id, 'tomato-pasta');
  assert.equal(plans[0].image_url, '/recipes/tomato-pasta.webp');
  assert.equal(plans[0].ingredients.find(x => x.item_id === pasta.id).quantity, 0.05);
  assert.equal(ruleRecipes([tomato, pasta], { ...profile, allergies: ['Wheat'] }).length, 0);
});
test('Images require both preparation and ingredients; arbitrary image URLs are discarded', () => {
  const r = recipe({ title: 'Spinach soup', template_id: 'egg-skillet', image_url: 'https://example.com/evil' });
  assert.equal(recipeImage(r, [item()]).image_key, 'kitchen-ingredients');
  assert.equal(validateRecipe(r, [item()], profile).image_url, '/recipes/kitchen-ingredients.webp');
  assert.equal(ruleRecipes([item({ name: 'Bananas', category: 'Fruit', unit: 'pcs', quantity: 1 })], profile)[0].image_key, 'fruit-plate');
});
test('Current dietary preferences invalidate an earlier plan at cook time', () => {
  const chicken = item({ name: 'Chicken breast', category: 'Protein' });
  assert.throws(() => validateRecipe(recipe(), [chicken], { ...profile, diet: 'Vegetarian' }));
  assert.throws(() => validateRecipe(recipe(), [chicken], { ...profile, diet: 'Pescatarian' }));
});
