-- Square-to-recipe item mapping (Phase 1 margin analytics).
-- Lets a tenant link a Square-sold item name to a ZRecipe recipe so real
-- margin (units sold x actual recipe cost) can be computed — the one thing
-- Square's own dashboard can't show.

CREATE TABLE IF NOT EXISTS public.square_item_recipe_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  square_item_name TEXT NOT NULL,
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, square_item_name)
);

CREATE INDEX IF NOT EXISTS square_item_recipe_links_recipe_id_idx
  ON public.square_item_recipe_links (recipe_id);

ALTER TABLE public.square_item_recipe_links ENABLE ROW LEVEL SECURITY;

-- Tenant-scoped RLS, using `tenant_id in (select get_user_tenant_ids())` —
-- verified LIVE in production this week via direct pg_policies/
-- pg_get_functiondef inspection against recipes/ingredients/suppliers/
-- invoices, NOT the exists()/alias/::text pattern in
-- 20260528150000_tenant_data_policies.sql, which does not match what's
-- actually running (see CLAUDE.md's "Migration files do not reliably
-- reflect production" note). All current reads/writes go through the
-- service-role admin client via the Square API routes, which bypasses RLS
-- regardless — this is the same database-level backstop the other three
-- Square tables got in 20260831120000_square_sales_tenant_policies.sql.

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'square_item_recipe_links'
      and policyname = 'square_item_recipe_links_select_own_tenant'
  ) then
    create policy square_item_recipe_links_select_own_tenant
      on public.square_item_recipe_links
      for select
      to authenticated
      using (
        tenant_id in (select public.get_user_tenant_ids())
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'square_item_recipe_links'
      and policyname = 'square_item_recipe_links_insert_own_tenant'
  ) then
    create policy square_item_recipe_links_insert_own_tenant
      on public.square_item_recipe_links
      for insert
      to authenticated
      with check (
        tenant_id in (select public.get_user_tenant_ids())
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'square_item_recipe_links'
      and policyname = 'square_item_recipe_links_update_own_tenant'
  ) then
    create policy square_item_recipe_links_update_own_tenant
      on public.square_item_recipe_links
      for update
      to authenticated
      using (
        tenant_id in (select public.get_user_tenant_ids())
      )
      with check (
        tenant_id in (select public.get_user_tenant_ids())
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'square_item_recipe_links'
      and policyname = 'square_item_recipe_links_delete_own_tenant'
  ) then
    create policy square_item_recipe_links_delete_own_tenant
      on public.square_item_recipe_links
      for delete
      to authenticated
      using (
        tenant_id in (select public.get_user_tenant_ids())
      );
  end if;
end $$;
