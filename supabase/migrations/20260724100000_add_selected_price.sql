-- Part 1: let a single historical purchase override the "most recent
-- purchase" default when calculating an ingredient's effective price.
ALTER TABLE ingredient_price_history
  ADD COLUMN IF NOT EXISTS is_selected_price BOOLEAN NOT NULL DEFAULT false;

-- Partial index — most price history rows will NOT be selected,
-- so a partial index is much smaller than a full one.
CREATE INDEX IF NOT EXISTS idx_price_history_selected
  ON ingredient_price_history (ingredient_id)
  WHERE is_selected_price = true;

COMMENT ON COLUMN ingredient_price_history.is_selected_price IS
  'When true, this specific historical price is the one used in recipe
   cost calculations for this ingredient, overriding the default
   "most recent purchase" behavior. At most one row per ingredient
   should be true at a time (enforced by application logic in
   setSelectedPrice server action, not by DB constraint — keeping
   the constraint soft lets invoice re-imports and history rewrites
   stay simple).';

-- Part 2: consolidate brand-duplicate ingredients into one row per
-- product per tenant. Today the same product bought under two brands
-- lives as two separate `ingredients` rows (e.g. "Butter Salted" with
-- brand='Kerrygold' and "Butter Salted" with brand='Kellygold'). Brand
-- is now purchase-level only (ingredient_price_history.brand), so these
-- duplicates are merged into a single canonical ingredient row.
DO $$
DECLARE
  tenant_row RECORD;
  name_group RECORD;
  keeper_id UUID;
  non_keeper_ids UUID[];
  merged_count INTEGER;
  tenant_consolidated INTEGER;
  total_consolidated INTEGER := 0;
BEGIN
  FOR tenant_row IN SELECT DISTINCT tenant_id FROM ingredients LOOP
    tenant_consolidated := 0;

    FOR name_group IN
      SELECT LOWER(TRIM(name)) AS norm_name
      FROM ingredients
      WHERE tenant_id = tenant_row.tenant_id
      GROUP BY LOWER(TRIM(name))
      HAVING COUNT(*) > 1
    LOOP
      -- Keeper: most recipe_ingredients usages (fewest FKs to repoint),
      -- tie-broken by most-recent updated_at, then lowest id (stable).
      SELECT i.id INTO keeper_id
      FROM ingredients i
      LEFT JOIN (
        SELECT ingredient_id, COUNT(*) AS usage_count
        FROM recipe_ingredients
        GROUP BY ingredient_id
      ) ri ON ri.ingredient_id = i.id
      WHERE i.tenant_id = tenant_row.tenant_id
        AND LOWER(TRIM(i.name)) = name_group.norm_name
      ORDER BY COALESCE(ri.usage_count, 0) DESC, i.updated_at DESC, i.id ASC
      LIMIT 1;

      SELECT ARRAY_AGG(i.id) INTO non_keeper_ids
      FROM ingredients i
      WHERE i.tenant_id = tenant_row.tenant_id
        AND LOWER(TRIM(i.name)) = name_group.norm_name
        AND i.id <> keeper_id;

      CONTINUE WHEN non_keeper_ids IS NULL OR array_length(non_keeper_ids, 1) IS NULL;

      -- Repoint recipe usage and purchase history onto the keeper.
      UPDATE recipe_ingredients
      SET ingredient_id = keeper_id
      WHERE ingredient_id = ANY(non_keeper_ids);

      UPDATE ingredient_price_history
      SET ingredient_id = keeper_id
      WHERE ingredient_id = ANY(non_keeper_ids);

      -- Merge allergen declarations onto the keeper; if the keeper already
      -- has a status for that allergen, its own row wins (DO NOTHING).
      INSERT INTO ingredient_allergens (ingredient_id, allergen_id, status)
      SELECT keeper_id, allergen_id, status
      FROM ingredient_allergens
      WHERE ingredient_id = ANY(non_keeper_ids)
      ON CONFLICT (ingredient_id, allergen_id) DO NOTHING;

      DELETE FROM ingredient_allergens WHERE ingredient_id = ANY(non_keeper_ids);

      DELETE FROM ingredients WHERE id = ANY(non_keeper_ids);

      merged_count := array_length(non_keeper_ids, 1);
      tenant_consolidated := tenant_consolidated + merged_count;
      total_consolidated := total_consolidated + merged_count;
    END LOOP;

    IF tenant_consolidated > 0 THEN
      RAISE NOTICE 'Tenant %: consolidated % duplicate ingredient(s)', tenant_row.tenant_id, tenant_consolidated;
    END IF;
  END LOOP;

  RAISE NOTICE 'Total ingredients consolidated across all tenants: %', total_consolidated;
END $$;

-- Preserve historical accuracy: any price_history row still missing a
-- brand (recorded before per-purchase brand tracking existed) inherits
-- the brand that was on its ingredient at the time. ingredients.brand
-- itself is left untouched — it's now a legacy field, not dropped, per
-- the "leave it as a nullable legacy field" instruction — application
-- code simply stops reading it as the source of truth going forward.
UPDATE ingredient_price_history h
SET brand = i.brand
FROM ingredients i
WHERE h.ingredient_id = i.id
  AND h.brand IS NULL
  AND i.brand IS NOT NULL;
