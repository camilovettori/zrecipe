-- Test for merge_ingredients (supabase/migrations/20260803_fix_merge_rpc.sql)
--
-- Verifies the two bugs fixed by that migration:
--   1. Supplier codes are transferred from loser to keeper (not cascade-deleted),
--      and a duplicate (supplier_id, product_code) pair is kept only once.
--   2. is_selected_price is never duplicated on the keeper after merge.
--
-- No JS/pgTAP test runner exists in this repo yet, so this is a plain,
-- self-contained assertion script: it seeds its own tenant/data inside a
-- transaction and rolls back at the end, leaving no trace either way.
-- Run it directly against a Postgres connection that has the migrations
-- applied and bypasses RLS (e.g. the `postgres` role), for example:
--   psql "$DATABASE_URL" -f supabase/tests/merge_ingredients_rpc.test.sql

BEGIN;

DO $$
DECLARE
  v_tenant_id UUID := gen_random_uuid();
  v_supplier_a UUID := gen_random_uuid();
  v_supplier_b UUID := gen_random_uuid();
  v_keeper_id UUID := gen_random_uuid();
  v_loser_id UUID := gen_random_uuid();
  v_result JSONB;
  v_keeper_code_count INT;
  v_dup_code_count INT;
  v_selected_count INT;
  v_kept_price NUMERIC;
BEGIN
  -- ── Seed ──────────────────────────────────────────────────────────────
  INSERT INTO tenants (id, name, slug)
  VALUES (v_tenant_id, 'Merge RPC Test Tenant', 'merge-rpc-test-' || substr(v_tenant_id::text, 1, 8));

  INSERT INTO suppliers (id, tenant_id, name) VALUES
    (v_supplier_a, v_tenant_id, 'Supplier A'),
    (v_supplier_b, v_tenant_id, 'Supplier B');

  INSERT INTO ingredients (id, tenant_id, name, category, price_unit) VALUES
    (v_keeper_id, v_tenant_id, 'Keeper Flour', 'Dry Goods', 'kg'),
    (v_loser_id, v_tenant_id, 'Loser Flour', 'Dry Goods', 'kg');

  -- Keeper already has a code from supplier A ("DUP-1"). Loser has the same
  -- (supplier_a, DUP-1) pair — must collapse to one row on merge — plus a
  -- second, unique code from supplier B that must transfer untouched.
  INSERT INTO ingredient_supplier_codes (tenant_id, supplier_id, ingredient_id, product_code) VALUES
    (v_tenant_id, v_supplier_a, v_keeper_id, 'DUP-1');
  INSERT INTO ingredient_supplier_codes (tenant_id, supplier_id, ingredient_id, product_code) VALUES
    (v_tenant_id, v_supplier_a, v_loser_id, 'DUP-1'),
    (v_tenant_id, v_supplier_b, v_loser_id, 'UNIQUE-2');

  -- Keeper has its own selected price row; loser also has one flagged
  -- selected. After merge, exactly one selected row must remain on keeper.
  INSERT INTO ingredient_price_history (ingredient_id, tenant_id, price, unit, recorded_at, is_selected_price) VALUES
    (v_keeper_id, v_tenant_id, 10.00, 'kg', now() - interval '1 day', true);
  INSERT INTO ingredient_price_history (ingredient_id, tenant_id, price, unit, recorded_at, is_selected_price) VALUES
    (v_loser_id, v_tenant_id, 12.50, 'kg', now(), true);

  -- ── Act ───────────────────────────────────────────────────────────────
  SELECT merge_ingredients(v_keeper_id, v_loser_id, 'keeper', 'keeper', true) INTO v_result;

  -- ── Assert: supplier codes transferred, duplicate collapsed ────────────
  SELECT count(*) INTO v_keeper_code_count
  FROM ingredient_supplier_codes WHERE ingredient_id = v_keeper_id;

  IF v_keeper_code_count <> 2 THEN
    RAISE EXCEPTION 'expected keeper to have 2 supplier codes after merge (1 kept dup + 1 transferred unique), got %', v_keeper_code_count;
  END IF;

  SELECT count(*) INTO v_dup_code_count
  FROM ingredient_supplier_codes
  WHERE ingredient_id = v_keeper_id AND supplier_id = v_supplier_a AND product_code = 'DUP-1';

  IF v_dup_code_count <> 1 THEN
    RAISE EXCEPTION 'expected exactly 1 row for the duplicate (supplier_a, DUP-1) pair, got %', v_dup_code_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM ingredient_supplier_codes
    WHERE ingredient_id = v_keeper_id AND supplier_id = v_supplier_b AND product_code = 'UNIQUE-2'
  ) THEN
    RAISE EXCEPTION 'expected loser''s unique supplier code (supplier_b, UNIQUE-2) to have transferred to keeper';
  END IF;

  IF EXISTS (SELECT 1 FROM ingredient_supplier_codes WHERE ingredient_id = v_loser_id) THEN
    RAISE EXCEPTION 'expected no supplier codes left pointing at the deleted loser';
  END IF;

  IF (v_result->>'supplier_codes_moved')::int <> 1 THEN
    RAISE EXCEPTION 'expected supplier_codes_moved = 1 (only the non-duplicate code), got %', v_result->>'supplier_codes_moved';
  END IF;

  -- ── Assert: is_selected_price not duplicated ────────────────────────────
  SELECT count(*) INTO v_selected_count
  FROM ingredient_price_history
  WHERE ingredient_id = v_keeper_id AND is_selected_price = true;

  IF v_selected_count <> 1 THEN
    RAISE EXCEPTION 'expected exactly 1 selected price row on keeper after merge, got %', v_selected_count;
  END IF;

  SELECT price INTO v_kept_price
  FROM ingredient_price_history
  WHERE ingredient_id = v_keeper_id AND is_selected_price = true;

  IF v_kept_price <> 10.00 THEN
    RAISE EXCEPTION 'expected keeper''s original selected price (10.00) to remain selected, got %', v_kept_price;
  END IF;

  -- The loser's price row should have moved to the keeper with the
  -- selection flag cleared, not vanished.
  IF NOT EXISTS (
    SELECT 1 FROM ingredient_price_history
    WHERE ingredient_id = v_keeper_id AND price = 12.50 AND is_selected_price = false
  ) THEN
    RAISE EXCEPTION 'expected loser''s price row to have moved to keeper with is_selected_price = false';
  END IF;

  -- ── Assert: loser is gone ────────────────────────────────────────────
  IF EXISTS (SELECT 1 FROM ingredients WHERE id = v_loser_id) THEN
    RAISE EXCEPTION 'expected loser ingredient to be deleted after merge';
  END IF;

  RAISE NOTICE 'merge_ingredients_rpc.test.sql: all assertions passed';
END $$;

ROLLBACK;
