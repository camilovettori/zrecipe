-- Atomic ingredient merge: transfers price history + recipe usage from
-- "loser" into "keeper", optionally merges allergens, applies photo/
-- category choices, then deletes the loser. Used by the "Merge another
-- ingredient into this one" feature on the ingredient detail page.
CREATE OR REPLACE FUNCTION merge_ingredients(
  keeper_id UUID,
  loser_id UUID,
  photo_choice TEXT,
  category_choice TEXT,
  merge_allergens BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER  -- respect RLS of the calling user, not superuser
AS $$
DECLARE
  keeper_tenant UUID;
  loser_tenant UUID;
  price_count INT;
  recipe_count INT;
  keeper_image TEXT;
  loser_image TEXT;
  keeper_cat TEXT;
  loser_cat TEXT;
BEGIN
  -- Basic safety: both must exist, must be same tenant, must be different rows
  IF keeper_id = loser_id THEN
    RAISE EXCEPTION 'Cannot merge an ingredient into itself';
  END IF;

  SELECT tenant_id, image_url, category INTO keeper_tenant, keeper_image, keeper_cat
  FROM ingredients WHERE id = keeper_id;

  SELECT tenant_id, image_url, category INTO loser_tenant, loser_image, loser_cat
  FROM ingredients WHERE id = loser_id;

  IF keeper_tenant IS NULL OR loser_tenant IS NULL THEN
    RAISE EXCEPTION 'One or both ingredients not found or not accessible';
  END IF;

  IF keeper_tenant <> loser_tenant THEN
    RAISE EXCEPTION 'Cannot merge across tenants';
  END IF;

  -- Move price history
  UPDATE ingredient_price_history
  SET ingredient_id = keeper_id
  WHERE ingredient_id = loser_id;
  GET DIAGNOSTICS price_count = ROW_COUNT;

  -- Move recipe_ingredients
  UPDATE recipe_ingredients
  SET ingredient_id = keeper_id
  WHERE ingredient_id = loser_id;
  GET DIAGNOSTICS recipe_count = ROW_COUNT;

  -- Handle allergens
  IF merge_allergens THEN
    -- Insert allergens from loser that keeper doesn't have.
    -- When both have the same allergen, keeper's status wins
    -- unless loser has a stricter status ('contains' > 'may_contain' > 'not_present').
    -- Simpler + safe: raise loser's stricter status onto keeper.
    -- Delete keeper's row and re-insert with the strictest status,
    -- for each shared allergen; INSERT loser-only allergens; then
    -- delete loser's rows.

    -- Step 1: for each allergen present on loser but not keeper,
    -- copy it over.
    INSERT INTO ingredient_allergens (ingredient_id, allergen_id, status)
    SELECT keeper_id, la.allergen_id, la.status
    FROM ingredient_allergens la
    WHERE la.ingredient_id = loser_id
      AND NOT EXISTS (
        SELECT 1 FROM ingredient_allergens ka
        WHERE ka.ingredient_id = keeper_id
          AND ka.allergen_id = la.allergen_id
      );

    -- Step 2: for shared allergens, upgrade keeper's status if
    -- loser's is stricter. Ordering: 'contains' (2) > 'may_contain' (1) > 'not_present' (0).
    UPDATE ingredient_allergens ka
    SET status = la.status
    FROM ingredient_allergens la
    WHERE ka.ingredient_id = keeper_id
      AND la.ingredient_id = loser_id
      AND ka.allergen_id = la.allergen_id
      AND (
        (la.status = 'contains' AND ka.status IN ('may_contain', 'not_present'))
        OR (la.status = 'may_contain' AND ka.status = 'not_present')
      );

    -- Step 3: delete loser's allergen rows (they're either copied
    -- or superseded now).
    DELETE FROM ingredient_allergens WHERE ingredient_id = loser_id;
  ELSE
    -- Not merging allergens: just discard loser's.
    DELETE FROM ingredient_allergens WHERE ingredient_id = loser_id;
  END IF;

  -- Apply photo/category choices to the keeper before deleting loser.
  IF photo_choice = 'loser' AND loser_image IS NOT NULL THEN
    UPDATE ingredients SET image_url = loser_image WHERE id = keeper_id;
  END IF;

  IF category_choice = 'loser' AND loser_cat IS NOT NULL THEN
    UPDATE ingredients SET category = loser_cat WHERE id = keeper_id;
  END IF;

  -- Finally, delete the loser.
  DELETE FROM ingredients WHERE id = loser_id;

  RETURN jsonb_build_object(
    'ok', true,
    'price_history_moved', price_count,
    'recipe_ingredients_moved', recipe_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION merge_ingredients TO authenticated;

COMMENT ON FUNCTION merge_ingredients IS
  'Merges the loser ingredient into the keeper ingredient. Transfers
   price history and recipe_ingredients FKs, optionally merges
   allergens, applies photo/category choices, then deletes the loser.
   SECURITY INVOKER means RLS applies — users can only merge
   ingredients in their own tenant.';
