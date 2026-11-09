import { z } from 'zod';

export const categories = ['Vegetables', 'Fruit', 'Dairy & eggs', 'Protein', 'Drinks', 'Pantry'];
export const units = ['pcs', 'g', 'kg', 'ml', 'L', 'packs'];
export const locations = ['Fridge', 'Freezer', 'Pantry', 'Counter'];
export const allergens = ['Milk', 'Eggs', 'Fish', 'Shellfish', 'Wheat', 'Soy', 'Peanuts', 'Tree nuts', 'Sesame'];
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}, 'Enter a valid date.');
export const itemSchema = z.object({
  name: z.string().trim().min(1).max(80),
  category: z.enum(categories),
  quantity: z.number().positive().max(100000),
  unit: z.enum(units),
  location: z.enum(locations),
  expiry_date: date.nullable(),
  date_type: z.enum(['Use by', 'Best before', 'Unknown']),
  allergens: z.array(z.enum(allergens)).max(9).default([]),
  safety_status: z.enum(['Normal', 'Check needed']).default('Normal'),
  notes: z.string().max(300).default(''),
}).refine(i => i.expiry_date === null || i.date_type !== 'Unknown', 'Specify the date label when entering a date.');

export const profileSchema = z.object({
  household_name: z.string().trim().min(1).max(60),
  household_size: z.number().int().min(1).max(12),
  diet: z.enum(['Balanced', 'Vegetarian', 'Vegan', 'Pescatarian']),
  goal: z.enum(['Everyday wellbeing', 'More protein', 'More vegetables', 'Lower sodium']),
  allergies: z.array(z.enum(allergens)).max(9),
  dislikes: z.string().max(200),
  timezone: z.string().refine(value => {
    try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; }
  }),
});
export function today(timezone = 'Asia/Hong_Kong') {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
export function daysLeft(item, currentDate = today()) {
  if (!item.expiry_date) return null;
  return Math.round((Date.parse(`${item.expiry_date}T00:00:00Z`) - Date.parse(`${currentDate}T00:00:00Z`)) / 86400000);
}
export function itemStatus(item, currentDate = today()) {
  if (item.safety_status === 'Check needed') return 'Check needed';
  const days = daysLeft(item, currentDate);
  if (days === null) return 'Date unknown';
  if (days < 0) return 'Past date';
  if (days <= 3) return 'Use first';
  return 'In date';
}
const knownAllergens = [
  ['Milk', /milk|yogurt|yoghurt|cheese|butter|cream/i],
  ['Eggs', /\begg/i], ['Fish', /salmon|tuna|cod|fish/i],
  ['Shellfish', /prawn|shrimp|lobster|crab|shellfish/i],
  ['Wheat', /bread|pasta|noodle|flour|couscous/i],
  ['Soy', /tofu|soy|edamame/i], ['Peanuts', /peanut/i],
  ['Tree nuts', /almond|walnut|cashew|hazelnut/i], ['Sesame', /sesame|tahini/i],
];
export function effectiveAllergens(item) {
  return [...new Set([...(item.allergens || []), ...knownAllergens.filter(([, re]) => re.test(item.name)).map(([name]) => name)])];
}
export function eligibleItems(items, profile, currentDate = today(profile.timezone)) {
  const dislikes = profile.dislikes.toLowerCase().split(',').map(x => x.trim()).filter(Boolean);
  return items.filter(i => {
    if (Number(i.quantity) <= 0 || i.safety_status !== 'Normal' || daysLeft(i, currentDate) === null || daysLeft(i, currentDate) < 0) return false;
    if (effectiveAllergens(i).some(a => profile.allergies.includes(a))) return false;
    if (dislikes.some(d => i.name.toLowerCase().includes(d))) return false;
    if (['Vegetarian', 'Vegan'].includes(profile.diet) && /chicken|beef|pork|fish|salmon|tuna|shrimp|prawn|turkey|lamb/i.test(i.name)) return false;
    if (profile.diet === 'Pescatarian' && /chicken|beef|pork|turkey|lamb/i.test(i.name)) return false;
    if (profile.diet === 'Vegan' && (i.category === 'Dairy & eggs' || /honey|milk|egg|cheese|butter|yogurt/i.test(i.name))) return false;
    return true;
  });
}
export const recipeSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(300),
  minutes: z.number().int().min(1).max(180),
  servings: z.number().int().min(1).max(12),
  ingredients: z.array(z.object({ item_id: z.string().uuid(), quantity: z.number().positive(), unit: z.enum(units) })).min(1).max(15),
  steps: z.array(z.string().min(1).max(500)).min(1).max(10),
  health_note: z.string().max(400),
  tags: z.array(z.string().max(30)).max(5),
});
export function validateRecipe(recipe, items, profile, currentDate = today(profile.timezone)) {
  const parsed = recipeSchema.parse(recipe);
  const allowed = new Map(eligibleItems(items, profile, currentDate).map(i => [i.id, i]));
  const seen = new Set();
  for (const ingredient of parsed.ingredients) {
    const item = allowed.get(ingredient.item_id);
    if (!item || seen.has(item.id) || ingredient.unit !== item.unit || ingredient.quantity > Number(item.quantity)) {
      throw new Error('This plan uses unavailable or restricted food. Review inventory and preferences.');
    }
    seen.add(item.id);
  }
  return parsed;
}
export function demoRecipes(items, profile) {
  const available = eligibleItems(items, profile).sort((a, b) => daysLeft(a) - daysLeft(b));
  const find = re => available.find(i => re.test(i.name));
  const templates = [
    { title: 'Spinach & tomato egg skillet', description: 'A bright, one-pan meal that gives your use-first vegetables a delicious second act.', match: [/spinach/i, /tomato/i, /egg/i], amounts: [100, 2, 2], minutes: 15, tags: ['Use-first pick', 'Protein source'], steps: ['Wash the spinach and tomatoes. Chop the tomatoes.', 'Add the tomatoes to a non-stick pan with a splash of water. Cook for 3 minutes.', 'Stir in the spinach until wilted. Add the beaten eggs and cook until fully set.', 'Serve immediately. Use only properly stored ingredients and follow package instructions.'] },
    { title: 'Lemon chicken & broccoli bowl', description: 'Comforting rice, tender chicken, and a generous helping of greens.', match: [/chicken/i, /broccoli/i, /rice/i, /lemon/i], amounts: [200, 1, 150, 1], minutes: 25, tags: ['Balanced plate', 'Protein source'], steps: ['Cook the rice according to the package instructions.', 'Cut the broccoli and steam until tender.', 'Cook the chicken thoroughly; use a food thermometer and follow local poultry safety guidance.', 'Combine with the rice and broccoli. Finish with fresh lemon juice.'] },
    { title: 'Banana & yogurt breakfast bowl', description: 'A simple, feel-good bowl for a slower morning or a quick afternoon snack.', match: [/banana/i, /yogurt|yoghurt/i, /oat/i], amounts: [1, 150, 40], minutes: 5, tags: ['Quick & easy', 'No cooking'], steps: ['Check the yogurt label and storage history. Wash your hands and prepare a clean bowl.', 'Slice the banana and spoon the yogurt into the bowl.', 'Top with oats suitable for eating without cooking, or prepare oats according to their package instructions.'] },
    { title: 'Garden vegetable rice bowl', description: 'Let your vegetables lead the way in a simple, satisfying bowl.', match: [/rice/i, /broccoli/i, /tomato/i], amounts: [150, 1, 2], minutes: 20, tags: ['Plant based', 'More vegetables'], steps: ['Cook the rice according to the package directions.', 'Wash, chop, and steam the broccoli.', 'Chop the tomatoes. Combine everything in a bowl and serve while warm.'] },
  ];
  const recipes = [];
  for (const t of templates) {
    const matched = t.match.map(find);
    if (matched.some(i => !i)) continue;
    const ingredients = matched.map((item, index) => ({ item_id: item.id, quantity: Math.min(t.amounts[index], Number(item.quantity)), unit: item.unit }));
    const protein = matched.some(i => /egg|chicken|yogurt|tofu|salmon|bean|lentil/i.test(i.name));
    const vegetableCount = matched.filter(i => i.category === 'Vegetables').length;
    const healthNote = profile.goal === 'Lower sodium'
      ? 'No added salt in this plan. Check packaged ingredients for sodium.'
      : profile.goal === 'More protein' && protein
        ? 'Includes a protein source from your inventory. This demo does not calculate grams of protein; adapt portions to your needs.'
        : profile.goal === 'More vegetables'
          ? `Includes ${vegetableCount} vegetable ingredients. Add variety and adapt portions to your needs.`
          : `A general meal idea for your ${profile.diet.toLowerCase()} preference. Portion sizes are illustrative; adapt them to your needs.`;
    const recipe = { ...t, ingredients, servings: 1, health_note: healthNote };
    recipes.push(validateRecipe(recipe, items, profile));
  }
  if (!recipes.length && available.length) {
    const i = available[0];
    recipes.push(validateRecipe({
      title: `Use-first plan: ${i.name}`, description: 'A simple starting point using your earliest-dated food.',
      minutes: 15, servings: 1, ingredients: [{ item_id: i.id, quantity: Number(i.quantity), unit: i.unit }],
      steps: ['Verify the label, storage history, and condition before preparation.', 'Prepare according to the package directions or a trusted recipe. This demo does not determine cooking temperatures or food safety.'],
      health_note: 'This is an inventory suggestion, not a nutritionally complete meal.', tags: ['Use first'],
    }, items, profile));
  }
  if (profile.goal === 'More vegetables') recipes.sort((a, b) => {
    const vegetables = r => r.ingredients.filter(x => available.find(i => i.id === x.item_id)?.category === 'Vegetables').length;
    return vegetables(b) - vegetables(a);
  });
  if (profile.goal === 'More protein') recipes.sort((a, b) => {
    const protein = r => r.ingredients.filter(x => /egg|chicken|yogurt|tofu|salmon|bean|lentil/i.test(available.find(i => i.id === x.item_id)?.name || '')).length;
    return protein(b) - protein(a);
  });
  return recipes.slice(0, 3);
}
