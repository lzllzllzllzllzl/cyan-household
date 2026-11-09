import test from 'node:test';
import assert from 'node:assert/strict';
import { daysLeft, eligibleItems, validateRecipe, itemSchema, itemStatus, today } from './domain.js';

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
