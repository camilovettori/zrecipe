ALTER TABLE recipe_ingredients
  ADD COLUMN IF NOT EXISTS yield_percent NUMERIC(5,2) DEFAULT 100,
  ADD COLUMN IF NOT EXISTS yield_override BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN recipe_ingredients.yield_percent IS 'Food Yield Factor — EP/AP ratio expressed as 0-100. e.g. 66 for banana (peel removed)';
COMMENT ON COLUMN recipe_ingredients.yield_override IS 'True when the user has manually overridden the reference yield value';
