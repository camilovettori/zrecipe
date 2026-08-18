ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS sub_ingredient_weight_g NUMERIC DEFAULT NULL;

COMMENT ON COLUMN recipes.sub_ingredient_weight_g IS
  'Total EP weight of the sub-recipe in grams (sum of its weight-family
   ingredient lines converted to grams). Used to bridge weight-based usage in
   a parent recipe (e.g. "200g of this frosting") against a sub-recipe that
   is costed per count unit (e.g. yield = 1 unit / batch), which
   calculateIngredientCost cannot otherwise convert.
   Example: Cream Cheese Frost yields 1 unit, total weight = 600g → this
   column = 600. When a parent uses 200g:
   cost = (200 / 600) * sub_ingredient_cost_per_unit.
   Never used to bridge weight against volume-priced sub-recipes — that would
   require an unstated ingredient density and must stay a unit mismatch.';
