-- Atomic supplier merge: reassigns invoices, ingredient links and supplier
-- intelligence from the loser supplier into the keeper, then deletes the
-- loser. This is intentionally conservative: when a duplicate product code or
-- invoice-memory key already exists on the keeper, we keep the keeper's row
-- and skip the loser duplicate rather than guessing which one should win.

CREATE OR REPLACE FUNCTION merge_suppliers(
  keeper_id UUID,
  loser_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  keeper_tenant UUID;
  loser_tenant UUID;
  invoices_moved INTEGER := 0;
  ingredient_supplier_moved INTEGER := 0;
  ingredient_last_supplier_moved INTEGER := 0;
  supplier_codes_inserted INTEGER := 0;
  invoice_memory_upserted INTEGER := 0;
BEGIN
  IF keeper_id = loser_id THEN
    RAISE EXCEPTION 'Cannot merge a supplier into itself';
  END IF;

  SELECT tenant_id INTO keeper_tenant
  FROM public.suppliers
  WHERE id = keeper_id;

  SELECT tenant_id INTO loser_tenant
  FROM public.suppliers
  WHERE id = loser_id;

  IF keeper_tenant IS NULL OR loser_tenant IS NULL THEN
    RAISE EXCEPTION 'One or both suppliers not found or not accessible';
  END IF;

  IF keeper_tenant <> loser_tenant THEN
    RAISE EXCEPTION 'Cannot merge suppliers across tenants';
  END IF;

  UPDATE public.invoices
  SET supplier_id = keeper_id
  WHERE tenant_id = keeper_tenant
    AND supplier_id = loser_id;
  GET DIAGNOSTICS invoices_moved = ROW_COUNT;

  UPDATE public.ingredients
  SET supplier_id = keeper_id
  WHERE tenant_id = keeper_tenant
    AND supplier_id = loser_id;
  GET DIAGNOSTICS ingredient_supplier_moved = ROW_COUNT;

  UPDATE public.ingredients
  SET last_supplier_id = keeper_id
  WHERE tenant_id = keeper_tenant
    AND last_supplier_id = loser_id;
  GET DIAGNOSTICS ingredient_last_supplier_moved = ROW_COUNT;

  INSERT INTO public.ingredient_supplier_codes (
    tenant_id,
    supplier_id,
    ingredient_id,
    product_code,
    created_at,
    updated_at
  )
  SELECT
    isc.tenant_id,
    keeper_id,
    isc.ingredient_id,
    isc.product_code,
    now(),
    now()
  FROM public.ingredient_supplier_codes isc
  WHERE isc.tenant_id = keeper_tenant
    AND isc.supplier_id = loser_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.ingredient_supplier_codes keeper_code
      WHERE keeper_code.tenant_id = keeper_tenant
        AND keeper_code.supplier_id = keeper_id
        AND keeper_code.product_code = isc.product_code
    );
  GET DIAGNOSTICS supplier_codes_inserted = ROW_COUNT;

  INSERT INTO public.invoice_item_memory (
    tenant_id,
    supplier_id,
    extracted_description_key,
    extracted_description_display,
    ingredient_id,
    confirmation_count,
    created_at,
    last_confirmed_at
  )
  SELECT
    iim.tenant_id,
    keeper_id,
    iim.extracted_description_key,
    iim.extracted_description_display,
    iim.ingredient_id,
    iim.confirmation_count,
    now(),
    iim.last_confirmed_at
  FROM public.invoice_item_memory iim
  WHERE iim.tenant_id = keeper_tenant
    AND iim.supplier_id = loser_id
  ON CONFLICT (tenant_id, supplier_id, extracted_description_key)
  DO UPDATE SET
    confirmation_count = public.invoice_item_memory.confirmation_count + EXCLUDED.confirmation_count,
    last_confirmed_at = GREATEST(public.invoice_item_memory.last_confirmed_at, EXCLUDED.last_confirmed_at);
  GET DIAGNOSTICS invoice_memory_upserted = ROW_COUNT;

  DELETE FROM public.invoice_item_memory
  WHERE tenant_id = keeper_tenant
    AND supplier_id = loser_id;

  DELETE FROM public.ingredient_supplier_codes
  WHERE tenant_id = keeper_tenant
    AND supplier_id = loser_id;

  DELETE FROM public.suppliers
  WHERE id = loser_id
    AND tenant_id = keeper_tenant;

  RETURN jsonb_build_object(
    'ok', true,
    'invoices_moved', invoices_moved,
    'ingredient_supplier_moved', ingredient_supplier_moved,
    'ingredient_last_supplier_moved', ingredient_last_supplier_moved,
    'supplier_codes_inserted', supplier_codes_inserted,
    'invoice_memory_upserted', invoice_memory_upserted
  );
END;
$$;

GRANT EXECUTE ON FUNCTION merge_suppliers(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION merge_suppliers(UUID, UUID) IS
  'Merges the loser supplier into the keeper supplier. Reassigns invoices and ingredient links, copies unique supplier intelligence, then deletes the loser. SECURITY INVOKER means RLS applies.';
