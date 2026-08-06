-- Atomic replacement for the delete-then-insert in the recipe save route,
-- which ran as two separate PostgREST calls: if the insert failed after the
-- delete committed, a recipe's ingredients were gone for good (see incident
-- 2026-08-06: 5 recipes lost their ingredients this way). Wrapping both
-- statements in one function body makes them one Postgres transaction —
-- an exception anywhere in here rolls back the delete too.
CREATE OR REPLACE FUNCTION save_recipe_ingredients(
  p_recipe_id UUID,
  p_ingredients JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER  -- respect RLS of the calling role, matches merge_ingredients/set_selected_price
AS $$
BEGIN
  DELETE FROM recipe_ingredients WHERE recipe_id = p_recipe_id;

  IF jsonb_array_length(p_ingredients) > 0 THEN
    INSERT INTO recipe_ingredients (
      recipe_id, ingredient_id, sub_recipe_id, quantity, unit,
      notes, sort_order, tenant_id, yield_percent, yield_override, ep_weight_manual
    )
    SELECT
      p_recipe_id,
      NULLIF(item->>'ingredient_id', '')::UUID,
      NULLIF(item->>'sub_recipe_id', '')::UUID,
      (item->>'quantity')::NUMERIC,
      item->>'unit',
      item->>'notes',
      (item->>'sort_order')::INT,
      NULLIF(item->>'tenant_id', '')::UUID,
      COALESCE((item->>'yield_percent')::NUMERIC, 100),
      COALESCE((item->>'yield_override')::BOOLEAN, false),
      NULLIF(item->>'ep_weight_manual', '')::NUMERIC
    FROM jsonb_array_elements(p_ingredients) AS item;
  END IF;
END;
$$;

-- Called only from src/app/api/recipes/save/route.ts via the service-role
-- admin client, never from client-side code, so grant to service_role only.
GRANT EXECUTE ON FUNCTION save_recipe_ingredients TO service_role;

COMMENT ON FUNCTION save_recipe_ingredients IS
  'Atomically replaces all recipe_ingredients rows for a recipe. Runs
   delete+insert as one transaction so a failed insert cannot leave a
   recipe with its ingredients deleted and nothing in their place.';
