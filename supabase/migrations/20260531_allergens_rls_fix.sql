-- Replace the join-based ingredient_allergens RLS policy with a simple
-- IN subquery to avoid nested RLS evaluation on the ingredients table.

DROP POLICY IF EXISTS "ingredient_allergens_tenant_isolation" ON ingredient_allergens;

CREATE POLICY "ingredient_allergens_select" ON ingredient_allergens
  FOR SELECT TO authenticated
  USING (
    ingredient_id IN (
      SELECT id FROM ingredients
      WHERE tenant_id::text IN (SELECT tenant_id FROM public.get_user_tenant_ids())
    )
  );

CREATE POLICY "ingredient_allergens_insert" ON ingredient_allergens
  FOR INSERT TO authenticated
  WITH CHECK (
    ingredient_id IN (
      SELECT id FROM ingredients
      WHERE tenant_id::text IN (SELECT tenant_id FROM public.get_user_tenant_ids())
    )
  );

CREATE POLICY "ingredient_allergens_update" ON ingredient_allergens
  FOR UPDATE TO authenticated
  USING (
    ingredient_id IN (
      SELECT id FROM ingredients
      WHERE tenant_id::text IN (SELECT tenant_id FROM public.get_user_tenant_ids())
    )
  );

CREATE POLICY "ingredient_allergens_delete" ON ingredient_allergens
  FOR DELETE TO authenticated
  USING (
    ingredient_id IN (
      SELECT id FROM ingredients
      WHERE tenant_id::text IN (SELECT tenant_id FROM public.get_user_tenant_ids())
    )
  );
