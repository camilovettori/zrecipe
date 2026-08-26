-- Verified missing via live pg_indexes query against the zconnect project
-- (2026-08-26): recipes and recipe_ingredients had only their primary-key
-- indexes; ingredient_price_history had a partial index
-- (idx_price_history_selected, WHERE is_selected_price = true) which serves
-- the "selected" lookup but not the "most recent by recorded_at" fallback,
-- and doesn't cover the compound ordering the slimmed refreshRecipes() list
-- query now sends (order=is_selected_price.desc,recorded_at.desc,id.desc
-- limit=1 per ingredient — see useRecipes.ts).

CREATE INDEX IF NOT EXISTS idx_recipes_tenant_active
  ON recipes (tenant_id, is_active);

CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe_id
  ON recipe_ingredients (recipe_id);

CREATE INDEX IF NOT EXISTS idx_ingredient_price_history_lookup
  ON ingredient_price_history (ingredient_id, is_selected_price, recorded_at DESC);
