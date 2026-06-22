import type { Category } from '../durable-objects/HouseholdSync';
import { parsePantryWithAI, type ParsedPantryItem as AIParsedPantryItem } from './ai-pantry-parser';
import { getCachedParse, cacheParse } from './parse-cache';

const KNOWN_BRANDS = new Set([
  'swiss', 'organic', 'whole foods', 'aldi', 'woolworths', 'coles',
  'countdown', 'pams', 'mainland', 'anchor', 'fonterra', 'kelloggs',
  'nestle', 'unilever', 'heinz', 'campbells', 'maggi', 'knorr',
  'sanitarium', 'vitaweet', 'dare', 'moose', 'bega', 'tatura',
  'devondale', 'pauls', 'a2 milk', 'yoplait', 'chobani', 'gippsland',
  'bulla', 'king island', 'cape grim', 'riverine', 'tassal', 'huon',
  'petuna', 'john west', 'sirena', 'mccains', 'simplot', 'birdseye',
  'whittakers', 'cadbury', 'vogels', 'hubbard', 'champion', 'edmonds',
  'tacoma', 'watties', 'oak', 'guava', 'fresh-up', 'raro', 'pik',
  'pams', 'basix', 'ecostore', 'dettol', 'pine o cleen', 'janola',
  'jif', 'spray n wipe', 'mr muscle', ' Handy andy',
]);

const UNIT_MAP: Record<string, string> = {
  'cup': 'cup', 'cups': 'cup', 'tbsp': 'tbsp', 'tsp': 'tsp',
  'lb': 'lb', 'lbs': 'lb', 'oz': 'oz', 'kg': 'kg', 'g': 'g',
  'ml': 'ml', 'l': 'litre', 'litre': 'litre', 'litres': 'litre',
  'liter': 'litre', 'liters': 'litre',
  'piece': 'piece', 'pieces': 'piece', 'slice': 'slice', 'slices': 'slice',
  'can': 'can', 'cans': 'can', 'bag': 'bag', 'bags': 'bag',
  'box': 'box', 'boxes': 'box', 'bottle': 'bottle', 'bottles': 'bottle',
  'jar': 'jar', 'jars': 'jar', 'pack': 'pack', 'packs': 'pack',
  'dozen': 'dozen', 'bunch': 'bunch', 'bunches': 'bunch',
  'head': 'head', 'heads': 'head', 'clove': 'clove', 'cloves': 'clove',
  'stick': 'stick', 'sticks': 'stick', 'punnet': 'punnet', 'punnets': 'punnet',
  'loaf': 'loaf', 'tin': 'can', 'tins': 'can', 'packet': 'pack',
  'block': 'block', 'tub': 'tub', 'tubs': 'tub', 'tray': 'tray',
  'carton': 'carton', 'serving': 'serving', 'servings': 'serving',
  'roll': 'roll', 'rolls': 'roll', 'pkt': 'pack',
};

const QUANTITY_UNITS = new Set(Object.keys(UNIT_MAP));

type CategoryDef = {
  category: Category;
  words: string[];
  phrases: string[];
};

const CATEGORY_DEFS: CategoryDef[] = [
  {
    category: 'Produce',
    phrases: [
      'frozen mixed vegetables', 'frozen vegetables', 'frozen peas', 'frozen corn',
      'frozen chips', 'frozen fries', 'french fries', 'mixed vegetables', 'mixed veg',
      'snow peas', 'sugar snap peas', 'green beans', 'broad beans', 'baked beans',
      'bean sprouts', 'brussels sprouts', 'spring onion', 'spring onions',
      'sweet potato', 'sweet potatoes', 'bell pepper', 'bell peppers',
      'green pepper', 'green peppers', 'red pepper', 'red peppers',
      'green onion', 'green onions', 'red onion', 'red onions',
      'brown onion', 'brown onions', 'white onion', 'white onions',
      'butternut squash', 'acorn squash', 'snow pea', 'sugar snap',
      'baby spinach', 'baby carrots', 'mixed salad', 'mixed greens',
      'garden salad', 'bok choy', 'choy sum', 'pak choi',
    ],
    words: [
      'apple', 'apples', 'banana', 'bananas', 'orange', 'oranges',
      'lettuce', 'spinach', 'tomato', 'tomatoes', 'potato', 'potatoes',
      'onion', 'onions', 'garlic', 'carrot', 'carrots', 'pepper', 'peppers',
      'cucumber', 'cucumbers', 'broccoli', 'kale', 'mushroom', 'mushrooms',
      'avocado', 'avocados', 'lemon', 'lemons', 'lime', 'limes',
      'grape', 'grapes', 'mango', 'mangoes', 'peach', 'peaches',
      'pear', 'pears', 'corn', 'zucchini', 'zucchinis', 'celery',
      'ginger', 'herb', 'herbs', 'basil', 'cilantro', 'coriander', 'parsley',
      'cabbage', 'cabbages', 'pumpkin', 'squash', 'eggplant', 'eggplants',
      'radish', 'radishes', 'turnip', 'turnips', 'beet', 'beets', 'beetroot',
      'asparagus', 'artichoke', 'sprout', 'sprouts', 'bean', 'beans',
      'pea', 'peas', 'olive', 'olives', 'fig', 'figs', 'date', 'dates',
      'raisin', 'raisins', 'sultana', 'sultanas', 'prune', 'prunes',
      'apricot', 'apricots', 'cherry', 'cherries', 'plum', 'plums',
      'melon', 'melons', 'watermelon', 'watermelons', 'cantaloupe', 'honeydew',
      'kiwi', 'kiwis', 'kiwifruit', 'papaya', 'pomegranate', 'passionfruit',
      'dragonfruit', 'lychee', 'lychees', 'persimmon', 'quince',
      'berry', 'berries', 'blackberry', 'blackberries', 'raspberry', 'raspberries',
      'blueberry', 'blueberries', 'strawberry', 'strawberries', 'cranberry', 'cranberries',
      'gooseberry', 'currant', 'currants', 'mulberry', 'mulberries', 'boysenberry',
      'lemon', 'lime', 'mandarin', 'mandarins', 'tangerine', 'tangerines',
      'grapefruit', 'grapefruits', 'pomelo', 'starfruit', 'rhubarb',
      'shallot', 'shallots', 'scallion', 'scallions', 'fennel', 'endive',
      'radicchio', 'watercress', 'arugula', 'rocket', 'cress',
      'parsnip', 'parsnips', 'swede', 'swedes', 'rutabaga',
      'sweetcorn', 'capsicum', 'capsicums', 'chilli', 'chillies', 'chili', 'chilies',
      'jalapeno', 'habanero', 'habaneros', 'jalapenos',
      'mushroom', 'mushrooms', 'chestnut', 'chestnuts',
      'vegetable', 'vegetables', 'produce', 'fruit', 'fruits',
      'punnets', 'punnet',
      'coconut',
      'kumara', 'kumaras',
      'tomatillo', 'plantain', 'plantains',
      'sage', 'thyme', 'rosemary', 'dill', 'mint', 'oregano', 'tarragon',
      'chive', 'chives', 'lemongrass', 'bayleaf', 'bayleaves', 'bay leaf',
    ],
  },
  {
    category: 'Meat',
    phrases: [
      'minced beef', 'minced pork', 'minced lamb', 'minced chicken',
      'ground beef', 'ground pork', 'ground turkey', 'ground chicken',
      'chicken breast', 'chicken thighs', 'chicken drumsticks', 'chicken wings',
      'chicken pieces', 'whole chicken', 'roast chicken',
      'pork chops', 'pork loin', 'pork belly', 'pork ribs', 'pork shoulder',
      'beef mince', 'pork mince', 'lamb mince', 'chicken mince',
      'lamb chops', 'lamb rack', 'leg of lamb', 'lamb shoulder',
      'beef steak', 'rump steak', 'sirloin steak', 'ribeye steak',
      'scotch fillet', 'eye fillet', 'porterhouse', 't-bone',
      'roast beef', 'corned beef', 'corned silverside',
      'turkey breast', 'turkey mince', 'bacon', 'bacon bits',
      'cooked ham', 'smoked ham', 'ham steak',
      'fish fillet', 'fish fingers', 'fish cakes',
      'salmon fillet', 'smoked salmon', 'tuna steak',
      'prawn cutlet', 'prawn cocktail', 'peeled prawns',
      'hot dog', 'hot dogs', 'frankfurter', 'frankfurters',
      'sausage rolls', 'chicken nuggets', 'chicken patties',
      'meatball', 'meatballs', 'kebab', 'kebabs',
      'deli meat', 'cold cuts', 'salami', 'pepperoni', 'prosciutto',
    ],
    words: [
      'chicken', 'beef', 'pork', 'turkey', 'lamb', 'fish',
      'salmon', 'tuna', 'shrimp', 'prawn', 'prawns',
      'crab', 'lobster', 'clam', 'clams', 'mussel', 'mussels',
      'oyster', 'oysters', 'scallop', 'scallops', 'squid', 'octopus',
      'anchovy', 'anchovies', 'sardine', 'sardines', 'mackerel',
      'trout', 'cod', 'haddock', 'halibut', 'snapper', 'grouper',
      'tilapia', 'barramundi', 'monkfish', 'hoki',
      'sausage', 'sausages', 'steak', 'steaks',
      'mince', 'fillet', 'fillets', 'breast', 'thigh', 'thighs',
      'drumstick', 'wing', 'wings', 'leg', 'legs',
      'bacon', 'ham', 'prosciutto', 'salami', 'pepperoni',
      'roast', 'cutlet', 'cutlets', 'chop', 'chops',
      'ribs', 'rack', 'loin', 'belly', 'shoulder',
      'duck', 'venison', 'rabbit', 'goose',
      'seafood', 'shellfish',
      'veal', 'biltong', 'jerky',
      'meat', 'poultry', 'game',
    ],
  },
  {
    category: 'Dairy',
    phrases: [
      'sour cream', 'cottage cheese', 'cream cheese', 'whipped cream',
      'heavy cream', 'double cream', 'single cream',
      'ice cream', 'ice-cream', 'gelato',
      'cheddar cheese', 'mozzarella cheese', 'parmesan cheese', 'feta cheese',
      'gouda cheese', 'brie cheese', 'camembert cheese', 'ricotta cheese',
      'blue cheese', 'goat cheese', 'cream cheese',
      'pepper jack', 'monterey jack', 'colby cheese', 'havarti cheese',
      'swiss cheese', 'gruyere cheese', ' mascarpone',
      'flavoured milk', 'chocolate milk', 'strawberry milk',
      'condensed milk', 'evaporated milk', 'long-life milk',
      'almond milk', 'soy milk', 'oat milk', 'coconut milk', 'rice milk',
      'greek yogurt', 'natural yogurt', 'flavoured yogurt', 'frozen yogurt',
      'yoghurt drink', 'probiotic drink',
      'free-range eggs', 'free range eggs',
    ],
    words: [
      'milk', 'cheese', 'yogurt', 'yoghurt', 'butter', 'cream',
      'egg', 'eggs', 'cheddar', 'mozzarella', 'parmesan', 'feta',
      'gouda', 'brie', 'camembert', 'ricotta', 'mascarpone', 'provolone',
      'kefir', 'quark', 'fromage', 'whey', 'curd', 'paneer',
      'dairy', 'lactose',
    ],
  },
  {
    category: 'Pantry',
    phrases: [
      'olive oil', 'coconut oil', 'sesame oil', 'sunflower oil', 'vegetable oil',
      'canola oil', 'peanut oil', 'avocado oil', 'truffle oil',
      'soy sauce', 'fish sauce', 'oyster sauce', 'hoisin sauce', 'teriyaki sauce',
      'worcestershire sauce', 'tabasco sauce', 'chilli sauce', 'hot sauce',
      'tomato sauce', 'pasta sauce', 'bbq sauce', 'steak sauce',
      'peanut butter', 'almond butter', 'cashew butter', 'sunflower butter',
      'baking powder', 'baking soda', 'bicarbonate soda', 'bicarb soda',
      'tomato paste', 'tomato puree', 'tinned tomatoes', 'canned tomatoes',
      'coconut cream', 'coconut milk', 'coconut water',
      'chicken stock', 'beef stock', 'vegetable stock', 'chicken broth', 'beef broth',
      'vegetable broth', 'stock cube', 'stock cubes', 'bouillon',
      'ice cream', 'whipped cream',
      'maple syrup', 'golden syrup', 'corn syrup', 'rice syrup', 'agave syrup',
      'apple cider vinegar', 'balsamic vinegar', 'white vinegar', 'red wine vinegar',
      'tortilla wrap', 'tortilla wraps', 'pita bread', 'flatbread', 'naan bread',
      'sourdough bread', 'white bread', 'wholemeal bread', 'grain bread',
      'bread rolls', 'bread crumbs', 'burger buns', 'hot dog buns',
      'breakfast cereal', 'muesli', 'granola', 'porridge oats',
      'basmati rice', 'jasmine rice', 'arborio rice', 'brown rice', 'white rice',
      'wild rice', 'long grain rice', 'short grain rice', 'sushi rice',
      'instant noodles', 'rice noodles', 'egg noodles', 'udon noodles',
      'soba noodles', 'ramen noodles', 'glass noodles',
      'potato chips', 'corn chips', 'tortilla chips', 'rice crackers',
      'dark chocolate', 'milk chocolate', 'white chocolate', 'cooking chocolate',
      'chocolate chips', 'chocolate bar',
      'pepper', 'black pepper', 'white pepper',
      'curry powder', 'turmeric', 'cumin', 'coriander', 'paprika',
      'cinnamon', 'nutmeg', 'cloves', 'allspice', 'garam masala',
      'chinese five spice', 'mixed spice', 'cake spice',
      'mustard', 'mayonnaise', 'mayo', 'ketchup', 'relish', 'chutney',
      'salsa', 'pesto', 'hummus', 'tahini', 'tapenade', 'guacamole',
      'dijon', 'wholegrain mustard',
      'granulated sugar', 'brown sugar', 'caster sugar', 'icing sugar',
      'powdered sugar', 'raw sugar', 'demerara sugar', 'coconut sugar',
      'plain flour', 'self-raising flour', 'self-rising flour', 'wholemeal flour',
      'bread flour', 'cake flour', 'rice flour', 'coconut flour', 'almond flour',
      'corn flour', 'cornflour', 'cornstarch',
      'brewers yeast', 'nutritional yeast', 'dry yeast', 'active yeast',
      'vanilla extract', 'vanilla essence', 'vanilla paste', 'vanilla bean',
      'food colouring', 'food coloring', 'gelatin', 'gelatine', 'agar agar',
      'desiccated coconut', 'shredded coconut', 'coconut flakes',
      'almond milk', 'soy milk', 'oat milk', 'rice milk',
    ],
    words: [
      'rice', 'pasta', 'flour', 'sugar', 'salt', 'oil', 'vinegar',
      'sauce', 'soup', 'canned', 'lentils', 'cereal', 'oats', 'oat',
      'bread', 'tortilla', 'wrap', 'wraps', 'honey', 'jam', 'marmalade',
      'tea', 'coffee', 'espresso', 'cacao', 'cocoa', 'chocolate',
      'spice', 'spices', 'seasoning', 'herbs',
      'wheat', 'quinoa', 'noodle', 'noodles', 'barley', 'bulgur',
      'couscous', 'farro', 'millet', 'rye', 'spelt', 'amaranth',
      'buckwheat', 'kamut', 'teff', 'triticale', 'semolina', 'polenta',
      'chips', 'crackers', 'biscuits', 'cookies', 'nuts',
      'almond', 'almonds', 'walnut', 'walnuts', 'cashew', 'cashews',
      'peanut', 'peanuts', 'pecan', 'pecans', 'pistachio', 'pistachios',
      'macadamia', 'hazelnut', 'hazelnuts', 'brazil', 'pine',
      'seed', 'seeds', 'sunflower', 'chia', 'flax', 'linseed', 'hemp',
      'sesame', 'pumpkin', 'popcorn', 'granola', 'muesli',
      'trail', 'dried', 'coconut',
      'stock', 'broth', 'bouillon',
      'bean', 'beans', 'chickpea', 'chickpeas', 'lentil', 'pea', 'peas',
      'tofu', 'tempeh', 'seitan', 'protein',
      'mustard', 'mayonnaise', 'mayo', 'ketchup',
      'pickle', 'pickles', 'olives',
      'cracker', 'pretzel', 'pretzels', 'snack', 'snacks',
      'preserve', 'preserves', 'conserves',
      'molasses', 'treacle', 'syrup',
      'yeast', 'bicarb', 'baking',
      'vanilla', 'essence', 'extract',
      'noodle', 'spaghetti', 'penne', 'fusilli', 'macaroni', 'lasagne', 'lasagna',
      'linguine', 'fettuccine', 'tagliatelle', 'rigatoni', 'farfalle', 'gnocchi',
      'ramen', 'udon', 'soba',
      'tahini', 'dip', 'hummus', 'pesto',
      'pantry', 'staple',
    ],
  },
  {
    category: 'Household',
    phrases: [
      'dish soap', 'dishwashing liquid', 'dishwasher tablets', 'dishwasher powder',
      'dishwasher rinse aid', 'dishwasher detergent',
      'laundry detergent', 'laundry powder', 'laundry liquid', 'laundry capsules',
      'fabric softener', 'fabric conditioner',
      'all-purpose cleaner', 'window cleaner', 'glass cleaner', 'floor cleaner',
      'bathroom cleaner', 'toilet cleaner', 'kitchen cleaner', 'oven cleaner',
      'stainless steel cleaner', 'surface spray',
      'spray and wipe', 'spray & wipe',
      'bin bag', 'bin liner', 'trash bag', 'rubbish bag', 'garbage bag',
      'recycling bag', 'compostable bag',
      'cling wrap', 'cling film', 'plastic wrap', 'aluminium foil', 'tin foil',
      'baking paper', 'parchment paper', 'greaseproof paper',
      'paper towel', 'kitchen towel', 'kitchen roll', 'kitchen paper',
      'paper plates', 'paper cups', 'plastic cups',
      'multi-purpose spray', 'disinfectant spray',
      'steel wool', 'scourer', 'scouring pad', 'chux', 'cleaning cloth',
      'microfiber cloth', 'sponge', 'sponges',
      'mop head', 'mop refill', 'broom', 'dustpan', 'brush',
      'rubber gloves', 'washing-up gloves', 'cleaning gloves',
      'air freshener', 'air freshener spray', 'candle', 'candles',
      'fly spray', 'insect repellent', 'insect spray', 'moth balls',
      'weed killer', 'pest control', 'ant killer', 'cockroach bait',
      'fertiliser', 'fertilizer', 'potting mix', 'compost', 'mulch',
      'plant food', 'garden soil', 'seedling mix',
      'light bulb', 'lightbulb', 'led bulb', 'batteries',
      'matches', 'lighter', 'lighters', 'extension cord', 'power strip',
      'tape', 'duct tape', 'masking tape', 'packing tape', 'superglue',
      'scissors', 'zip tie', 'command hook', 'storage container',
      'food container', 'food storage', 'freezer bag', 'sandwich bag',
      'esky', 'cooler bag',
    ],
    words: [
      'detergent', 'bleach', 'cleaning', 'cleaner', 'disinfectant',
      'sponge', 'mop', 'bucket', 'gloves',
      'foil', 'bin', 'wipes', 'wipe', 'wax',
      'tissue', 'tissues', 'napkin', 'napkins', 'serviette', 'serviettes',
      'candle', 'filter', 'charcoal',
      'household', 'clean', 'washing',
    ],
  },
  {
    category: 'Personal Care',
    phrases: [
      'body wash', 'shower gel', 'shower cream', 'bubble bath',
      'face wash', 'face scrub', 'face mask', 'face cream', 'face moisturiser',
      'face moisturizer', 'face serum', 'face lotion', 'toner', 'cleanser',
      'hand cream', 'hand wash', 'hand sanitizer', 'hand sanitiser',
      'body lotion', 'body cream', 'body butter', 'body scrub',
      'sun screen', 'sun cream', 'sunblock', 'sunscreen lotion',
      'lip balm', 'lip gloss', 'lipstick',
      'shaving cream', 'shaving gel', 'shaving foam', 'after shave',
      'hair gel', 'hair spray', 'hair mask', 'hair oil', 'hair serum',
      'hair colour', 'hair dye', 'hair treatment',
      'dry shampoo', 'leave-in conditioner',
      'cotton pad', 'cotton pads', 'cotton bud', 'cotton buds', 'cotton swab',
      'cotton swabs', 'q-tip', 'q-tips', 'makeup remover',
      'nail polish', 'nail polish remover', 'nail clipper', 'nail clippers',
      'nail file', 'tweezers',
      'toilet paper', 'toilet roll', 'toilet tissue',
      'wet wipe', 'wet wipes', 'baby wipe', 'baby wipes',
      'baby powder', 'baby oil', 'baby lotion', 'baby shampoo',
      'diaper', 'diapers', 'nappy', 'nappies', 'nappy cream',
      'sanitary pad', 'sanitary pads', 'sanitary towel', 'sanitary towels',
      'tampon', 'tampons', 'panty liner', 'panty liners', 'menstrual cup',
      'contact lens', 'contact lenses', 'contact solution', 'lens solution',
      'vitamin c', 'vitamin d', 'fish oil', 'omega 3', 'magnesium',
      'probiotic', 'probiotics', 'multivitamin', 'supplement', 'supplements',
      'panadol', 'paracetamol', 'ibuprofen', 'aspirin', 'nurofen',
      'cough syrup', 'cold and flu', 'throat lozenge', 'throat spray',
      'bandaid', 'bandaids', 'band-aid', 'bandage', 'bandages',
      'antiseptic', 'antiseptic cream', 'antiseptic spray',
      'first aid', 'first-aid', 'thermometer',
    ],
    words: [
      'shampoo', 'conditioner', 'soap', 'soapbar',
      'moisturiser', 'moisturizer', 'lotion', 'sunscreen', 'sunblock',
      'toothpaste', 'toothbrush', 'toothbrushes', 'floss', 'mouthwash',
      'deodorant', 'antiperspirant', 'razor', 'razors',
      'comb', 'combs', 'hairbrush', 'hairbrushes',
      'toilet', 'paper',
      'vitamin', 'vitamins', 'medicine', 'pharmacy',
      'personal', 'care',
    ],
  },
];

const MODIFIERS = new Set([
  'fresh', 'frozen', 'dried', 'canned', 'tinned', 'organic', 'free-range',
  'free range', 'whole', 'ground', 'minced', 'chopped', 'sliced', 'diced',
  'grated', 'shredded', 'roasted', 'smoked', 'cooked', 'raw', 'ripe',
  'unripe', 'green', 'red', 'white', 'brown', 'yellow', 'purple',
  'large', 'small', 'medium', 'baby', 'mini', 'jumbo', 'extra',
  'raw', 'natural', 'plain', 'flavoured', 'flavored', 'unsweetened',
  'sweetened', 'low-fat', 'low fat', 'full-fat', 'full fat', 'skim',
  'lite', 'light', 'reduced', 'fat-free', 'fat free', 'sugar-free',
  'sugar free', 'gluten-free', 'gluten free', 'vegan', 'vegetarian',
  'halal', 'kosher', 'spicy', 'mild', 'hot', 'crunchy', 'creamy',
  'smooth', 'crispy', 'soft', 'hard', 'thick', 'thin',
  'italian', 'greek', 'thai', 'indian', 'mexican', 'japanese', 'chinese',
  'french', 'mediterranean', 'asian', 'american', 'australian', 'nz',
]);

export interface ParsedPantryItem {
  name: string;
  quantityValue: number | null;
  quantityUnit: string;
  brand: string;
  category: Category;
  isFood: boolean;
  confidence: number;
  needsReview: boolean;
}

function normalizeUnit(raw: string): string {
  const lower = raw.toLowerCase().trim();
  return UNIT_MAP[lower] || lower;
}

function extractQuantity(text: string): { value: number | null; unit: string; remaining: string } {
  const numericMatch = text.match(/^(\d+(?:\.\d+)?)\s*(cups?|tbsp|tsp|lbs?|oz|kg|g|ml|l(?:itres?|iters?)?|pieces?|slices?|cans?|bags?|boxes?|bottles?|jars?|packs?|dozen|bunches?|heads?|cloves?|sticks?|punnets?|loaf|tins?|packets?|blocks?|tubs?|trays?|cartons?|rolls?|pkts?)\s+(.+)/i);
  if (numericMatch) {
    return {
      value: parseFloat(numericMatch[1]!),
      unit: normalizeUnit(numericMatch[2]!),
      remaining: numericMatch[3]!.trim(),
    };
  }

  const suffixNumericMatch = text.match(/(.+?)\s+(\d+(?:\.\d+)?)\s*(cups?|tbsp|tsp|lbs?|oz|kg|g|ml|l(?:itres?|iters?)?|pieces?|slices?|cans?|bags?|boxes?|bottles?|jars?|packs?|dozen|bunches?|heads?|cloves?|sticks?|punnets?|loaf|tins?|packets?|blocks?|tubs?|trays?|cartons?|rolls?|pkts?)$/i);
  if (suffixNumericMatch) {
    return {
      value: parseFloat(suffixNumericMatch[2]!),
      unit: normalizeUnit(suffixNumericMatch[3]!),
      remaining: suffixNumericMatch[1]!.trim(),
    };
  }

  const parenMatch = text.match(/(.+?)\s*\((\d+(?:\.\d+)?)\s*(cups?|tbsp|tsp|lbs?|oz|kg|g|ml|l(?:itres?|iters?)?|pieces?|slices?|cans?|bags?|boxes?|bottles?|jars?|packs?|dozen|bunches?|heads?|cloves?|sticks?|punnets?|loaf|tins?|packets?|blocks?|tubs?|trays?|cartons?|rolls?|pkts?)\)$/i);
  if (parenMatch) {
    return {
      value: parseFloat(parenMatch[2]!),
      unit: normalizeUnit(parenMatch[3]!),
      remaining: parenMatch[1]!.trim(),
    };
  }

  const fractionMatch = text.match(/^(half|quarter|third)\s*(?:of\s*)?an?\s+(.+)/i);
  if (fractionMatch) {
    const fractionValues: Record<string, number> = { half: 0.5, quarter: 0.25, third: 0.333 };
    return {
      value: fractionValues[fractionMatch[1]!.toLowerCase()] ?? null,
      unit: '',
      remaining: fractionMatch[2]!.trim(),
    };
  }

  const fractionNotationMatch = text.match(/^(\d+)\/(\d+)\s*(cups?|tbsp|tsp|lbs?|oz|kg|g|ml|l(?:itres?|iters?)?|pieces?|slices?|cans?|bags?|boxes?|bottles?|jars?|packs?|dozen|bunches?|heads?|cloves?|sticks?|punnets?|loaf|tins?|packets?|blocks?|tubs?|trays?|cartons?|rolls?|pkts?)?\s*(.+)/i);
  if (fractionNotationMatch) {
    const num = parseInt(fractionNotationMatch[1]!);
    const den = parseInt(fractionNotationMatch[2]!);
    return {
      value: den > 0 ? num / den : null,
      unit: fractionNotationMatch[3] ? normalizeUnit(fractionNotationMatch[3]) : '',
      remaining: (fractionNotationMatch[4] || '').trim(),
    };
  }

  return { value: null, unit: '', remaining: text };
}

function extractBrand(text: string): { brand: string; remaining: string } {
  const words = text.split(/\s+/);
  const brandWords: string[] = [];
  const remainingWords: string[] = [];

  for (const word of words) {
    const lower = word.toLowerCase();
    if (KNOWN_BRANDS.has(lower)) {
      brandWords.push(word);
    } else if (/^[A-Z]/.test(word) && word.length > 1 && !/^(the|a|an|and|or|but|in|on|at|to|for|of|with|by|from)$/i.test(word)) {
      if (remainingWords.length > 0 || brandWords.length > 0) {
        brandWords.push(word);
      } else {
        remainingWords.push(word);
      }
    } else {
      remainingWords.push(word);
    }
  }

  if (remainingWords.length === 0 && brandWords.length > 0) {
    const recovered = brandWords.splice(0, 1);
    remainingWords.push(recovered[0]!);
  }

  return {
    brand: brandWords.join(' '),
    remaining: remainingWords.join(' '),
  };
}

function singularize(word: string): string {
  if (word.endsWith('ies') && word.length > 4) return word.slice(0, -3) + 'y';
  if (word.endsWith('shes') || word.endsWith('ches') || word.endsWith('xes') || word.endsWith('sses')) return word.slice(0, -2);
  if (word.endsWith('ves') && word.length > 4) return word.slice(0, -3) + 'f';
  if (word.endsWith('s') && !word.endsWith('ss') && word.length > 2) return word.slice(0, -1);
  return word;
}

function getTokenVariants(word: string): string[] {
  const lower = word.toLowerCase();
  const variants = new Set([lower]);
  const sing = singularize(lower);
  variants.add(sing);
  if (lower !== sing) {
    variants.add(sing + 's');
    variants.add(sing + 'es');
    variants.add(sing.replace(/y$/, 'ies'));
  }
  variants.add(lower + 's');
  variants.add(lower + 'es');
  if (lower.endsWith('y')) {
    variants.add(lower.slice(0, -1) + 'ies');
  }
  return [...variants];
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[()]/g, ' ')
    .split(/[\s,;]+/)
    .filter((t) => t.length > 0 && !QUANTITY_UNITS.has(t) && !/^\d+(\.\d+)?$/.test(t));
}

interface CategoryScore {
  category: Category;
  score: number;
  matchedPhrases: string[];
  matchedWords: string[];
}

function scoreCategories(name: string): CategoryScore[] {
  const lower = name.toLowerCase().trim();
  const tokens = tokenize(lower);
  const scores: CategoryScore[] = [];

  for (const def of CATEGORY_DEFS) {
    let score = 0;
    const matchedPhrases: string[] = [];
    const matchedWords: string[] = [];

    for (const phrase of def.phrases) {
      if (lower.includes(phrase)) {
        const phraseWords = phrase.split(/\s+/).length;
        const phraseScore = 1.0 + (phraseWords - 1) * 0.5;
        score += phraseScore;
        matchedPhrases.push(phrase);
      }
    }

    for (const token of tokens) {
      if (MODIFIERS.has(token)) continue;

      const variants = getTokenVariants(token);

      for (const keyword of def.words) {
        for (const variant of variants) {
          if (variant === keyword || token === keyword) {
            score += 1.0;
            matchedWords.push(token);
            break;
          }
        }
        if (matchedWords.includes(token) && matchedWords.filter((w) => w === token).length <= def.words.filter((k) => getTokenVariants(token).includes(k)).length) {
          continue;
        }
      }
    }

    scores.push({ category: def.category, score, matchedPhrases, matchedWords });
  }

  return scores.sort((a, b) => b.score - a.score);
}

function categorize(name: string): { category: Category; confidence: number; needsReview: boolean } {
  const scores = scoreCategories(name);
  const best = scores[0]!;
  const second = scores[1];

  if (best.score === 0) {
    return { category: 'Pantry', confidence: 0.2, needsReview: true };
  }

  const dominance = second && second.score > 0 ? best.score / (best.score + second.score) : 1.0;

  let confidence = Math.min(0.5 + (best.score * 0.15), 0.85);

  if (best.matchedPhrases.length > 0) {
    confidence = Math.min(confidence + 0.15, 0.95);
  }

  confidence *= dominance;

  if (best.score >= 1 && dominance > 0.85 && second && second.score === 0) {
    confidence = Math.max(confidence, 0.75);
  }

  if (best.score >= 2 && dominance > 0.7) {
    confidence = Math.max(confidence, 0.8);
  }

  if (best.score < 1.5 && dominance < 0.55) {
    confidence = Math.min(confidence, 0.6);
  }

  const needsReview = confidence < 0.65;

  return { category: best.category, confidence: Math.round(confidence * 100) / 100, needsReview };
}

const FOOD_CATEGORIES: Set<Category> = new Set(['Produce', 'Meat', 'Dairy', 'Pantry']);

function determineIsFood(category: Category, confidence: number): boolean {
  return FOOD_CATEGORIES.has(category);
}

function regexParse(raw: string): ParsedPantryItem {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { name: '', quantityValue: null, quantityUnit: '', brand: '', category: 'Pantry', isFood: true, confidence: 0.3, needsReview: true };
  }

  const { value, unit, remaining } = extractQuantity(trimmed);
  const { brand, remaining: productName } = extractBrand(remaining);
  const nameToCategorize = productName || trimmed;
  const { category, confidence, needsReview } = categorize(nameToCategorize);
  const name = productName || trimmed;

  const isFood = determineIsFood(category, confidence);

  return {
    name,
    quantityValue: value,
    quantityUnit: unit,
    brand,
    category,
    isFood,
    confidence,
    needsReview,
  };
}

async function computeHash(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function parsePantryItem(
  raw: string,
  sql: DurableObjectStorage['sql'],
  deepseekApiKey?: string,
): Promise<ParsedPantryItem> {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { name: '', quantityValue: null, quantityUnit: '', brand: '', category: 'Pantry', isFood: true, confidence: 0.3, needsReview: true };
  }

  const inputHash = await computeHash(trimmed);
  const cached = await getCachedParse(sql, inputHash);
  if (cached) {
    try {
      return JSON.parse(cached.parsedJson) as ParsedPantryItem;
    } catch {
    }
  }

  const regexResult = regexParse(trimmed);

  if (regexResult.confidence >= 0.8 && !regexResult.needsReview) {
    await cacheParse(sql, { inputHash, rawInput: trimmed, parsedJson: JSON.stringify(regexResult), source: 'regex', createdAt: Date.now() });
    return regexResult;
  }

  if (deepseekApiKey) {
    try {
      const aiResults = await parsePantryWithAI([trimmed], deepseekApiKey);
      if (aiResults.length > 0) {
        const aiResult = aiResults[0]!;
        const result: ParsedPantryItem = {
          name: aiResult.name || trimmed,
          quantityValue: aiResult.quantityValue,
          quantityUnit: aiResult.quantityUnit,
          brand: aiResult.brand,
          category: aiResult.category,
          isFood: aiResult.isFood,
          confidence: aiResult.confidence,
          needsReview: false,
        };
        await cacheParse(sql, { inputHash, rawInput: trimmed, parsedJson: JSON.stringify(result), source: 'ai', createdAt: Date.now() });
        return result;
      }
    } catch (err) {
      console.error('AI parsing failed, falling back to regex:', err);
    }
  }

  await cacheParse(sql, { inputHash, rawInput: trimmed, parsedJson: JSON.stringify(regexResult), source: 'regex', createdAt: Date.now() });
  return regexResult;
}

export function parsePantryItemSync(raw: string): ParsedPantryItem {
  return regexParse(raw.trim());
}

export async function parsePantryBatch(
  rawInputs: string[],
  sql: DurableObjectStorage['sql'],
  deepseekApiKey?: string,
): Promise<ParsedPantryItem[]> {
  const results: ParsedPantryItem[] = [];
  const aiInputs: string[] = [];
  const aiIndices: number[] = [];

  for (let i = 0; i < rawInputs.length; i++) {
    const trimmed = rawInputs[i]?.trim();
    if (!trimmed) {
      results.push({ name: '', quantityValue: null, quantityUnit: '', brand: '', category: 'Pantry', isFood: true, confidence: 0.3, needsReview: true });
      continue;
    }

    const inputHash = await computeHash(trimmed);
    const cached = await getCachedParse(sql, inputHash);
    if (cached) {
      try {
        results.push(JSON.parse(cached.parsedJson) as ParsedPantryItem);
        continue;
      } catch {
      }
    }

    const regexResult = regexParse(trimmed);

    if (regexResult.confidence >= 0.8 && !regexResult.needsReview) {
      await cacheParse(sql, { inputHash, rawInput: trimmed, parsedJson: JSON.stringify(regexResult), source: 'regex', createdAt: Date.now() });
      results.push(regexResult);
    } else {
      aiInputs.push(trimmed);
      aiIndices.push(i);
      results.push(regexResult);
    }
  }

  if (aiInputs.length > 0 && deepseekApiKey) {
    try {
      const aiResults = await parsePantryWithAI(aiInputs, deepseekApiKey);
      for (let j = 0; j < aiInputs.length; j++) {
        const idx = aiIndices[j]!;
        const aiResult = aiResults[j];
        if (aiResult) {
          const result: ParsedPantryItem = {
            name: aiResult.name || aiInputs[j]!,
            quantityValue: aiResult.quantityValue,
            quantityUnit: aiResult.quantityUnit,
            brand: aiResult.brand,
            category: aiResult.category,
            isFood: aiResult.isFood,
            confidence: aiResult.confidence,
            needsReview: false,
          };
          results[idx] = result;
          const inputHash = await computeHash(aiInputs[j]!);
          await cacheParse(sql, { inputHash, rawInput: aiInputs[j]!, parsedJson: JSON.stringify(result), source: 'ai', createdAt: Date.now() });
        }
      }
    } catch (err) {
      console.error('Batch AI parsing failed, using regex results:', err);
    }
  }

  return results;
}
