ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS sub_ingredient_weight_manual_g NUMERIC DEFAULT NULL;

COMMENT ON COLUMN recipes.sub_ingredient_weight_manual_g IS
  'User-entered EP batch weight of this sub-recipe in grams, measured on a
   scale. Takes precedence over the computed sum of weight-family ingredient
   lines. Required when the sub-recipe has volume-measured (ml/L) ingredients,
   since those cannot be converted to grams without a density.';

COMMENT ON COLUMN recipes.sub_ingredient_weight_g IS
  'Computed sum of this sub-recipe''s weight-family ingredient lines (g/kg/oz/lb
   converted to grams). Only a valid denominator when no volume-measured (ml/L)
   line was skipped in that sum — see sub_ingredient_weight_manual_g for the
   user-entered override required when volume lines are present. Costing for a
   parent recipe that uses this sub-recipe by weight goes through costPerGram
   (see computeLiveSubRecipeCost), never a bridge reconstructed from
   sub_ingredient_cost_per_unit.';
