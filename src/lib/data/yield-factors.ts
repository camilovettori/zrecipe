export interface YieldFactor {
  ingredient: string
  aliases: string[]
  yieldPercent: number
  notes: string
  category: 'produce' | 'meat' | 'fish' | 'dairy' | 'dry' | 'other'
}

export const YIELD_FACTORS: YieldFactor[] = [
  // ── FRUITS ──
  { ingredient: 'banana',       aliases: ['bananas'],                     yieldPercent: 66,  notes: 'Peel removed',                  category: 'produce' },
  { ingredient: 'apple',        aliases: ['apples'],                      yieldPercent: 40,  notes: 'Peeled and cored',              category: 'produce' },
  { ingredient: 'avocado',      aliases: ['avocados'],                    yieldPercent: 63,  notes: 'Skin and seed removed',         category: 'produce' },
  { ingredient: 'mango',        aliases: ['mangoes'],                     yieldPercent: 69,  notes: 'Skin and pit removed',          category: 'produce' },
  { ingredient: 'orange',       aliases: ['oranges'],                     yieldPercent: 44,  notes: 'Pared, flesh only',             category: 'produce' },
  { ingredient: 'lemon',        aliases: ['lemons'],                      yieldPercent: 44,  notes: 'Pared, flesh only',             category: 'produce' },
  { ingredient: 'pineapple',    aliases: ['pineapples'],                  yieldPercent: 38,  notes: 'Peeled and cored',              category: 'produce' },
  { ingredient: 'peach',        aliases: ['peaches'],                     yieldPercent: 76,  notes: 'Pit and skin removed',          category: 'produce' },
  { ingredient: 'pear',         aliases: ['pears'],                       yieldPercent: 78,  notes: 'Pit and skin removed',          category: 'produce' },
  { ingredient: 'strawberry',   aliases: ['strawberries'],                yieldPercent: 87,  notes: 'Hulled',                        category: 'produce' },
  { ingredient: 'raspberry',    aliases: ['raspberries'],                 yieldPercent: 96,  notes: 'Minimal trim',                  category: 'produce' },
  { ingredient: 'blackberry',   aliases: ['blackberries'],                yieldPercent: 96,  notes: 'Minimal trim',                  category: 'produce' },
  { ingredient: 'grape',        aliases: ['grapes'],                      yieldPercent: 94,  notes: 'Stems removed',                 category: 'produce' },
  { ingredient: 'watermelon',   aliases: [],                              yieldPercent: 46,  notes: 'Rind removed',                  category: 'produce' },
  { ingredient: 'cantaloupe',   aliases: ['melon'],                       yieldPercent: 43,  notes: 'Rind and seeds removed',        category: 'produce' },
  { ingredient: 'fig',          aliases: ['figs'],                        yieldPercent: 97,  notes: 'Stem removed',                  category: 'produce' },
  { ingredient: 'plum',         aliases: ['plums'],                       yieldPercent: 94,  notes: 'Pitted',                        category: 'produce' },
  { ingredient: 'coconut',      aliases: [],                              yieldPercent: 48,  notes: 'Meat only',                     category: 'produce' },

  // ── VEGETABLES ──
  { ingredient: 'onion',        aliases: ['onions', 'white onion'],       yieldPercent: 63,  notes: 'Skin and ends removed',         category: 'produce' },
  { ingredient: 'garlic',       aliases: ['garlic cloves'],               yieldPercent: 78,  notes: 'Skin removed',                  category: 'produce' },
  { ingredient: 'carrot',       aliases: ['carrots', 'grated carrot'],    yieldPercent: 80,  notes: 'Ends and skin removed',         category: 'produce' },
  { ingredient: 'potato',       aliases: ['potatoes', 'old potatoes'],    yieldPercent: 63,  notes: 'Peeled by hand, raw',           category: 'produce' },
  { ingredient: 'broccoli',     aliases: [],                              yieldPercent: 61,  notes: 'Florets only',                  category: 'produce' },
  { ingredient: 'cauliflower',  aliases: [],                              yieldPercent: 53,  notes: 'Cored, florets only',           category: 'produce' },
  { ingredient: 'celery',       aliases: [],                              yieldPercent: 60,  notes: 'Leaves and base removed',       category: 'produce' },
  { ingredient: 'pepper',       aliases: ['peppers', 'bell pepper'],      yieldPercent: 59,  notes: 'Seeds and membranes removed',   category: 'produce' },
  { ingredient: 'cucumber',     aliases: ['cucumbers'],                   yieldPercent: 84,  notes: 'Pared and sliced',              category: 'produce' },
  { ingredient: 'zucchini',     aliases: ['courgette'],                   yieldPercent: 78,  notes: 'Ends trimmed',                  category: 'produce' },
  { ingredient: 'spinach',      aliases: [],                              yieldPercent: 72,  notes: 'Trimmed leaves',                category: 'produce' },
  { ingredient: 'romaine',      aliases: ['lettuce', 'romaine lettuce'],  yieldPercent: 86,  notes: 'Outer leaves removed',          category: 'produce' },
  { ingredient: 'corn',         aliases: ['sweetcorn'],                   yieldPercent: 36,  notes: 'Raw kernels cut off cob',       category: 'produce' },
  { ingredient: 'eggplant',     aliases: ['aubergine'],                   yieldPercent: 75,  notes: 'Ends trimmed',                  category: 'produce' },
  { ingredient: 'tomato',       aliases: ['tomatoes'],                    yieldPercent: 93,  notes: 'Core removed',                  category: 'produce' },
  { ingredient: 'mushroom',     aliases: ['mushrooms'],                   yieldPercent: 92,  notes: 'Stems trimmed',                 category: 'produce' },
  { ingredient: 'leek',         aliases: ['leeks'],                       yieldPercent: 70,  notes: 'Roots and dark green removed',  category: 'produce' },
  { ingredient: 'fennel',       aliases: [],                              yieldPercent: 70,  notes: 'Stalks and fronds removed',     category: 'produce' },
  { ingredient: 'beetroot',     aliases: ['beet', 'beets'],               yieldPercent: 76,  notes: 'Skin and tops removed',         category: 'produce' },
  { ingredient: 'cabbage',      aliases: [],                              yieldPercent: 79,  notes: 'Outer leaves removed',          category: 'produce' },
  { ingredient: 'basil',        aliases: [],                              yieldPercent: 56,  notes: 'Stems removed',                 category: 'produce' },
  { ingredient: 'cilantro',     aliases: ['coriander'],                   yieldPercent: 90,  notes: 'Thick stems removed',           category: 'produce' },
  { ingredient: 'acorn squash', aliases: [],                              yieldPercent: 74,  notes: 'Flesh only',                    category: 'produce' },

  // ── MEAT ──
  { ingredient: 'chicken breast', aliases: ['chicken'],                   yieldPercent: 79,  notes: 'Boneless, skinless',            category: 'meat' },
  { ingredient: 'chicken whole',  aliases: [],                            yieldPercent: 67,  notes: 'Edible meat after cooking',     category: 'meat' },
  { ingredient: 'beef',           aliases: ['beef steak', 'sirloin'],     yieldPercent: 75,  notes: 'Fat and gristle trimmed',       category: 'meat' },
  { ingredient: 'pork loin',      aliases: ['pork'],                      yieldPercent: 80,  notes: 'Fat trimmed, raw',              category: 'meat' },
  { ingredient: 'lamb',           aliases: ['lamb chops'],                yieldPercent: 70,  notes: 'Bone-in trim loss',             category: 'meat' },
  { ingredient: 'bacon',          aliases: [],                            yieldPercent: 58,  notes: 'Cooked, fat rendered',          category: 'meat' },
  { ingredient: 'sausage',        aliases: ['sausages'],                  yieldPercent: 75,  notes: 'Cooked weight',                 category: 'meat' },

  // ── FISH & SEAFOOD ──
  { ingredient: 'salmon',         aliases: ['salmon fillet'],             yieldPercent: 72,  notes: 'Skin and bones removed',        category: 'fish' },
  { ingredient: 'cod',            aliases: ['cod fillet'],                yieldPercent: 75,  notes: 'Skin removed',                  category: 'fish' },
  { ingredient: 'shrimp',         aliases: ['prawns'],                    yieldPercent: 67,  notes: 'Shell and vein removed',        category: 'fish' },
  { ingredient: 'tuna',           aliases: ['tuna steak'],                yieldPercent: 78,  notes: 'Skin and bones removed',        category: 'fish' },
  { ingredient: 'mussels',        aliases: [],                            yieldPercent: 27,  notes: 'Shell removed, cooked',         category: 'fish' },

  // ── DAIRY & EGGS ──
  { ingredient: 'egg',            aliases: ['eggs', 'whole egg'],         yieldPercent: 88,  notes: 'Shell removed',                 category: 'dairy' },
  { ingredient: 'liquid whole egg', aliases: [],                          yieldPercent: 100, notes: 'Ready to use',                  category: 'dairy' },
  { ingredient: 'butter',         aliases: ['butter salted'],             yieldPercent: 100, notes: 'No trim loss',                  category: 'dairy' },
  { ingredient: 'milk',           aliases: [],                            yieldPercent: 100, notes: 'No trim loss',                  category: 'dairy' },
  { ingredient: 'cream',          aliases: ['double cream'],              yieldPercent: 100, notes: 'No trim loss',                  category: 'dairy' },

  // ── DRY / PANTRY ──
  { ingredient: 'flour',          aliases: ['plain flour', 'rhm flour', 'bread flour'], yieldPercent: 100, notes: 'No trim loss', category: 'dry' },
  { ingredient: 'sugar',          aliases: ['caster sugar', 'demerara sugar', 'brown sugar'], yieldPercent: 100, notes: 'No trim loss', category: 'dry' },
  { ingredient: 'salt',           aliases: [],                            yieldPercent: 100, notes: 'No trim loss',                  category: 'dry' },
  { ingredient: 'yeast',          aliases: [],                            yieldPercent: 100, notes: 'No trim loss',                  category: 'dry' },
  { ingredient: 'chocolate',      aliases: ['dark chocolate'],            yieldPercent: 100, notes: 'No trim loss',                  category: 'dry' },
  { ingredient: 'cocoa',          aliases: ['cocoa powder'],              yieldPercent: 100, notes: 'No trim loss',                  category: 'dry' },
  { ingredient: 'almond',         aliases: ['almonds'],                   yieldPercent: 100, notes: 'Ready to use',                  category: 'dry' },
  { ingredient: 'honey',          aliases: [],                            yieldPercent: 100, notes: 'No trim loss',                  category: 'dry' },
  { ingredient: 'vanilla',        aliases: ['vanilla extract'],           yieldPercent: 100, notes: 'No trim loss',                  category: 'dry' },
  { ingredient: 'olive oil',      aliases: [],                            yieldPercent: 100, notes: 'No trim loss',                  category: 'dry' },
  { ingredient: 'coconut oil',    aliases: [],                            yieldPercent: 100, notes: 'No trim loss',                  category: 'dry' },
]

export function findYieldFactor(ingredientName: string): YieldFactor | null {
  const name = ingredientName.toLowerCase().trim()
  const sorted = [...YIELD_FACTORS].sort((a, b) => b.ingredient.length - a.ingredient.length)
  for (const yf of sorted) {
    if (name.includes(yf.ingredient)) return yf
    for (const alias of yf.aliases) {
      if (name.includes(alias)) return yf
    }
  }
  return null
}
