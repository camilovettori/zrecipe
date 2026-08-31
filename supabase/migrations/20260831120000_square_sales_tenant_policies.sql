-- Tenant-scoped RLS policies for the Square POS tables.
--
-- square_connections/square_orders/square_order_line_items (added in
-- 20260826193000_add_square_sales_integration.sql) enabled RLS but never
-- created policies, so they were the one gap in this schema relying entirely
-- on application-layer tenant_id filtering rather than a database-level
-- backstop. All current reads/writes go through the service-role admin
-- client (which bypasses RLS regardless), so this doesn't change app
-- behavior — it only closes the gap for any future authenticated/anon-role
-- access.
--
-- IMPORTANT: this uses `tenant_id in (select get_user_tenant_ids())`, NOT
-- the exists()/alias/::text pattern from 20260528150000_tenant_data_policies
-- .sql. That migration's own get_user_tenant_ids() (returns table(tenant_id
-- text)) does not match what's actually live in the zconnect database
-- (returns setof uuid) — confirmed via direct pg_get_functiondef inspection,
-- not by reading the migration file. See the CLAUDE.md note on this: do not
-- trust 20260528150000 as a reference for this function's real signature.
-- The pattern below was verified live against the recipes/ingredients/
-- suppliers/invoices/recipe_ingredients policies already in production
-- before writing this file.

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'square_connections'
      and policyname = 'square_connections_select_own_tenant'
  ) then
    create policy square_connections_select_own_tenant
      on public.square_connections
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
      and tablename = 'square_connections'
      and policyname = 'square_connections_insert_own_tenant'
  ) then
    create policy square_connections_insert_own_tenant
      on public.square_connections
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
      and tablename = 'square_connections'
      and policyname = 'square_connections_update_own_tenant'
  ) then
    create policy square_connections_update_own_tenant
      on public.square_connections
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
      and tablename = 'square_connections'
      and policyname = 'square_connections_delete_own_tenant'
  ) then
    create policy square_connections_delete_own_tenant
      on public.square_connections
      for delete
      to authenticated
      using (
        tenant_id in (select public.get_user_tenant_ids())
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'square_orders'
      and policyname = 'square_orders_select_own_tenant'
  ) then
    create policy square_orders_select_own_tenant
      on public.square_orders
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
      and tablename = 'square_orders'
      and policyname = 'square_orders_insert_own_tenant'
  ) then
    create policy square_orders_insert_own_tenant
      on public.square_orders
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
      and tablename = 'square_orders'
      and policyname = 'square_orders_update_own_tenant'
  ) then
    create policy square_orders_update_own_tenant
      on public.square_orders
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
      and tablename = 'square_orders'
      and policyname = 'square_orders_delete_own_tenant'
  ) then
    create policy square_orders_delete_own_tenant
      on public.square_orders
      for delete
      to authenticated
      using (
        tenant_id in (select public.get_user_tenant_ids())
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'square_order_line_items'
      and policyname = 'square_order_line_items_select_own_tenant'
  ) then
    create policy square_order_line_items_select_own_tenant
      on public.square_order_line_items
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
      and tablename = 'square_order_line_items'
      and policyname = 'square_order_line_items_insert_own_tenant'
  ) then
    create policy square_order_line_items_insert_own_tenant
      on public.square_order_line_items
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
      and tablename = 'square_order_line_items'
      and policyname = 'square_order_line_items_update_own_tenant'
  ) then
    create policy square_order_line_items_update_own_tenant
      on public.square_order_line_items
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
      and tablename = 'square_order_line_items'
      and policyname = 'square_order_line_items_delete_own_tenant'
  ) then
    create policy square_order_line_items_delete_own_tenant
      on public.square_order_line_items
      for delete
      to authenticated
      using (
        tenant_id in (select public.get_user_tenant_ids())
      );
  end if;
end $$;
