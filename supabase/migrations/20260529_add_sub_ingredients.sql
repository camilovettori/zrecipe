-- Sub-ingredient support for ZRecipe
-- Run this in your Supabase SQL editor (Dashboard → SQL Editor → New query)

-- Add sub-ingredient fields to the recipes table
ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS is_sub_ingredient        BOOLEAN      DEFAULT false,
  ADD COLUMN IF NOT EXISTS sub_ingredient_unit       TEXT         DEFAULT 'g',
  ADD COLUMN IF NOT EXISTS sub_ingredient_cost_per_unit DECIMAL(10,4);

-- Add sub-recipe reference to recipe_ingredients
ALTER TABLE recipe_ingredients
  ADD COLUMN IF NOT EXISTS sub_recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL;

-- Index for faster sub-ingredient lookups in the search dropdown
CREATE INDEX IF NOT EXISTS idx_recipes_is_sub_ingredient
  ON recipes (is_sub_ingredient)
  WHERE is_sub_ingredient = true;
