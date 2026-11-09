// Shared by the API and UI. Photos are illustrations, selected from ingredients
// and preparation together; model-provided image URLs are never accepted.
export const foodGroups = {
  spinach: /spinach/i, tomato: /tomato/i, egg: /\begg/i,
  chicken: /chicken/i, broccoli: /broccoli/i, rice: /\brice\b/i,
  lemon: /lemon/i, banana: /banana/i, yogurt: /yogurt|yoghurt/i,
  oats: /\boats?\b/i, pasta: /pasta|spaghetti|penne|macaroni/i,
  tofu: /tofu/i, mushroom: /mushroom/i, potato: /potato/i,
  carrot: /carrot/i, lentil: /lentil/i, beans: /beans?|chickpeas?/i,
  salmon: /salmon/i, bread: /bread|toast/i, cucumber: /cucumber/i,
  fruit: /apple|banana|orange|berries|berry|grape|pear|mango|kiwi|melon|peach/i,
};
const dish = (id, title, groups, method, minutes, steps) => ({ id, title, groups, method, minutes, steps });
export const recipeCatalog = [
  dish('egg-skillet', 'Spinach & tomato egg skillet', ['spinach', 'tomato', 'egg'], /skillet|scramble|pan|omelet/i, 15, ['Wash and chop the vegetables.', 'Soften the tomatoes in a non-stick pan with a splash of water; wilt the spinach.', 'Add beaten eggs and cook until fully set.']),
  dish('chicken-rice', 'Lemon chicken & broccoli rice bowl', ['chicken', 'broccoli', 'rice', 'lemon'], /bowl|rice/i, 30, ['Cook the rice following the package instructions.', 'Steam the broccoli and cook chicken thoroughly, using a food thermometer and local poultry guidance.', 'Combine and finish with lemon juice.']),
  dish('yogurt-bowl', 'Banana, yogurt & oat bowl', ['banana', 'yogurt', 'oats'], /bowl|breakfast/i, 5, ['Slice the banana and spoon the yogurt into a clean bowl.', 'Add oats suitable for eating without cooking, or prepare them according to the package.']),
  dish('vegetable-rice', 'Broccoli & tomato rice bowl', ['broccoli', 'tomato', 'rice'], /bowl|rice/i, 20, ['Cook rice according to its package.', 'Wash and steam broccoli, then chop tomatoes.', 'Combine in a bowl and serve warm.']),
  dish('tomato-pasta', 'Simple tomato pasta', ['tomato', 'pasta'], /pasta|spaghetti|penne/i, 20, ['Cook pasta following its package instructions.', 'Wash and chop tomatoes; simmer with a splash of water.', 'Toss the cooked pasta with the tomatoes.']),
  dish('tofu-broccoli', 'Tofu & broccoli stir-fry', ['tofu', 'broccoli'], /stir.fry|pan|skillet/i, 15, ['Prepare tofu according to its package, then cut into cubes.', 'Wash and chop broccoli. Cook in a non-stick pan with water until tender.', 'Add tofu and heat through following its package instructions.']),
  dish('mushroom-eggs', 'Mushroom scrambled eggs', ['mushroom', 'egg'], /scrambl|omelet|pan|skillet/i, 15, ['Clean and slice mushrooms and cook in a non-stick pan with a little water.', 'Add beaten eggs and cook until fully set.']),
  dish('potato-carrot', 'Roasted potatoes & carrots', ['potato', 'carrot'], /roast|bake/i, 35, ['Wash and cut potatoes and carrots into small pieces.', 'Spread on baking parchment. Roast until tender and cooked throughout.']),
  dish('lentil-tomato', 'Tomato lentil soup', ['lentil', 'tomato'], /soup|stew/i, 30, ['Rinse lentils and cook with water following their package instructions.', 'Wash and chop tomatoes, add to the lentils and simmer until tender.']),
  dish('bean-salad', 'Tomato & bean salad', ['beans', 'tomato'], /salad/i, 10, ['Use ready-to-eat beans or cook thoroughly according to the package, then cool.', 'Wash and chop tomatoes. Combine with the cooked beans.']),
  dish('salmon-rice', 'Salmon & rice bowl', ['salmon', 'rice'], /bowl|rice/i, 25, ['Cook rice according to the package.', 'Cook salmon thoroughly following local fish safety guidance.', 'Serve the salmon over the rice.']),
  dish('egg-toast', 'Eggs on toast', ['egg', 'bread'], /toast|bread/i, 10, ['Toast the bread.', 'Cook eggs until fully set in a non-stick pan; serve on toast.']),
  dish('cucumber-salad', 'Cucumber & tomato salad', ['cucumber', 'tomato'], /salad/i, 5, ['Wash the cucumber and tomatoes thoroughly.', 'Slice and combine in a clean bowl.']),
  dish('porridge', 'Warm banana oatmeal', ['banana', 'oats'], /porridge|oatmeal|warm/i, 10, ['Cook oats with water according to the package.', 'Peel and slice the banana and serve over the warm oats.']),
  dish('fruit-plate', 'Fresh fruit plate', ['fruit'], /fruit|plate|snack/i, 5, ['Wash the fruit and check its condition.', 'Peel or remove cores as needed, slice and serve on a clean plate.']),
  dish('steamed-broccoli', 'Simply steamed broccoli', ['broccoli'], /steam/i, 10, ['Wash and cut the broccoli into florets.', 'Steam with water until tender and serve warm.']),
];
export function matchesDish(dish, ingredients) {
  return dish.groups.every(group => ingredients.some(i => foodGroups[group].test(i.name)));
}
export function recipeImage(recipe, items) {
  const ingredients = recipe.ingredients.map(x => items.find(i => i.id === x.item_id)).filter(Boolean);
  const candidate = recipeCatalog.find(d => d.id === recipe.template_id && matchesDish(d, ingredients) && d.method.test(recipe.title))
    || recipeCatalog.find(d => matchesDish(d, ingredients) && d.method.test(recipe.title));
  return {
    image_key: candidate?.id || 'kitchen-ingredients',
    image_url: `/recipes/${candidate?.id || 'kitchen-ingredients'}.webp`,
    image_alt: candidate ? `Illustrative ${candidate.title.toLowerCase()}` : 'Illustrative kitchen ingredients',
    image_label: candidate ? 'Serving inspiration · illustrative photo' : 'Ingredient illustration · no matching dish photo',
  };
}
