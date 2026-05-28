-- Tenant-scoped RLS for all browser-accessed data tables.
-- This keeps the client-side Supabase flow working while enforcing access by tenant membership.

create or replace function public.get_user_tenant_ids()
returns table (tenant_id text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct tu.tenant_id::text
  from public.tenant_users tu
  where tu.user_id::text = auth.uid()::text
$$;

alter table if exists public.recipes enable row level security;
alter table if exists public.ingredients enable row level security;
alter table if exists public.suppliers enable row level security;
alter table if exists public.invoices enable row level security;
alter table if exists public.invoice_items enable row level security;
alter table if exists public.recipe_ingredients enable row level security;
alter table if exists public.ingredient_price_history enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'recipes'
      and policyname = 'recipes_select_own_tenant'
  ) then
    create policy recipes_select_own_tenant
      on public.recipes
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.get_user_tenant_ids() tenant_ids
          where tenant_ids.tenant_id = recipes.tenant_id::text
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'recipes'
      and policyname = 'recipes_insert_own_tenant'
  ) then
    create policy recipes_insert_own_tenant
      on public.recipes
      for insert
      to authenticated
      with check (
        exists (
          select 1
          from public.get_user_tenant_ids() tenant_ids
          where tenant_ids.tenant_id = recipes.tenant_id::text
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'recipes'
      and policyname = 'recipes_update_own_tenant'
  ) then
    create policy recipes_update_own_tenant
      on public.recipes
      for update
      to authenticated
      using (
        exists (
          select 1
          from public.get_user_tenant_ids() tenant_ids
          where tenant_ids.tenant_id = recipes.tenant_id::text
        )
      )
      with check (
        exists (
          select 1
          from public.get_user_tenant_ids() tenant_ids
          where tenant_ids.tenant_id = recipes.tenant_id::text
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'recipes'
      and policyname = 'recipes_delete_own_tenant'
  ) then
    create policy recipes_delete_own_tenant
      on public.recipes
      for delete
      to authenticated
      using (
        exists (
          select 1
          from public.get_user_tenant_ids() tenant_ids
          where tenant_ids.tenant_id = recipes.tenant_id::text
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ingredients'
      and policyname = 'ingredients_select_own_tenant'
  ) then
    create policy ingredients_select_own_tenant
      on public.ingredients
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.get_user_tenant_ids() tenant_ids
          where tenant_ids.tenant_id = ingredients.tenant_id::text
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ingredients'
      and policyname = 'ingredients_insert_own_tenant'
  ) then
    create policy ingredients_insert_own_tenant
      on public.ingredients
      for insert
      to authenticated
      with check (
        exists (
          select 1
          from public.get_user_tenant_ids() tenant_ids
          where tenant_ids.tenant_id = ingredients.tenant_id::text
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ingredients'
      and policyname = 'ingredients_update_own_tenant'
  ) then
    create policy ingredients_update_own_tenant
      on public.ingredients
      for update
      to authenticated
      using (
        exists (
          select 1
          from public.get_user_tenant_ids() tenant_ids
          where tenant_ids.tenant_id = ingredients.tenant_id::text
        )
      )
      with check (
        exists (
          select 1
          from public.get_user_tenant_ids() tenant_ids
          where tenant_ids.tenant_id = ingredients.tenant_id::text
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ingredients'
      and policyname = 'ingredients_delete_own_tenant'
  ) then
    create policy ingredients_delete_own_tenant
      on public.ingredients
      for delete
      to authenticated
      using (
        exists (
          select 1
          from public.get_user_tenant_ids() tenant_ids
          where tenant_ids.tenant_id = ingredients.tenant_id::text
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'suppliers'
      and policyname = 'suppliers_select_own_tenant'
  ) then
    create policy suppliers_select_own_tenant
      on public.suppliers
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.get_user_tenant_ids() tenant_ids
          where tenant_ids.tenant_id = suppliers.tenant_id::text
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'suppliers'
      and policyname = 'suppliers_insert_own_tenant'
  ) then
    create policy suppliers_insert_own_tenant
      on public.suppliers
      for insert
      to authenticated
      with check (
        exists (
          select 1
          from public.get_user_tenant_ids() tenant_ids
          where tenant_ids.tenant_id = suppliers.tenant_id::text
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'suppliers'
      and policyname = 'suppliers_update_own_tenant'
  ) then
    create policy suppliers_update_own_tenant
      on public.suppliers
      for update
      to authenticated
      using (
        exists (
          select 1
          from public.get_user_tenant_ids() tenant_ids
          where tenant_ids.tenant_id = suppliers.tenant_id::text
        )
      )
      with check (
        exists (
          select 1
          from public.get_user_tenant_ids() tenant_ids
          where tenant_ids.tenant_id = suppliers.tenant_id::text
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'suppliers'
      and policyname = 'suppliers_delete_own_tenant'
  ) then
    create policy suppliers_delete_own_tenant
      on public.suppliers
      for delete
      to authenticated
      using (
        exists (
          select 1
          from public.get_user_tenant_ids() tenant_ids
          where tenant_ids.tenant_id = suppliers.tenant_id::text
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'invoices'
      and policyname = 'invoices_select_own_tenant'
  ) then
    create policy invoices_select_own_tenant
      on public.invoices
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.get_user_tenant_ids() tenant_ids
          where tenant_ids.tenant_id = invoices.tenant_id::text
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'invoices'
      and policyname = 'invoices_insert_own_tenant'
  ) then
    create policy invoices_insert_own_tenant
      on public.invoices
      for insert
      to authenticated
      with check (
        exists (
          select 1
          from public.get_user_tenant_ids() tenant_ids
          where tenant_ids.tenant_id = invoices.tenant_id::text
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'invoices'
      and policyname = 'invoices_update_own_tenant'
  ) then
    create policy invoices_update_own_tenant
      on public.invoices
      for update
      to authenticated
      using (
        exists (
          select 1
          from public.get_user_tenant_ids() tenant_ids
          where tenant_ids.tenant_id = invoices.tenant_id::text
        )
      )
      with check (
        exists (
          select 1
          from public.get_user_tenant_ids() tenant_ids
          where tenant_ids.tenant_id = invoices.tenant_id::text
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'invoices'
      and policyname = 'invoices_delete_own_tenant'
  ) then
    create policy invoices_delete_own_tenant
      on public.invoices
      for delete
      to authenticated
      using (
        exists (
          select 1
          from public.get_user_tenant_ids() tenant_ids
          where tenant_ids.tenant_id = invoices.tenant_id::text
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'invoice_items'
      and policyname = 'invoice_items_select_own_tenant'
  ) then
    create policy invoice_items_select_own_tenant
      on public.invoice_items
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.get_user_tenant_ids() tenant_ids
          where tenant_ids.tenant_id = invoice_items.tenant_id::text
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'invoice_items'
      and policyname = 'invoice_items_insert_own_tenant'
  ) then
    create policy invoice_items_insert_own_tenant
      on public.invoice_items
      for insert
      to authenticated
      with check (
        exists (
          select 1
          from public.get_user_tenant_ids() tenant_ids
          where tenant_ids.tenant_id = invoice_items.tenant_id::text
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'invoice_items'
      and policyname = 'invoice_items_update_own_tenant'
  ) then
    create policy invoice_items_update_own_tenant
      on public.invoice_items
      for update
      to authenticated
      using (
        exists (
          select 1
          from public.get_user_tenant_ids() tenant_ids
          where tenant_ids.tenant_id = invoice_items.tenant_id::text
        )
      )
      with check (
        exists (
          select 1
          from public.get_user_tenant_ids() tenant_ids
          where tenant_ids.tenant_id = invoice_items.tenant_id::text
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'invoice_items'
      and policyname = 'invoice_items_delete_own_tenant'
  ) then
    create policy invoice_items_delete_own_tenant
      on public.invoice_items
      for delete
      to authenticated
      using (
        exists (
          select 1
          from public.get_user_tenant_ids() tenant_ids
          where tenant_ids.tenant_id = invoice_items.tenant_id::text
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'recipe_ingredients'
      and policyname = 'recipe_ingredients_select_own_tenant'
  ) then
    create policy recipe_ingredients_select_own_tenant
      on public.recipe_ingredients
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.get_user_tenant_ids() tenant_ids
          where tenant_ids.tenant_id = recipe_ingredients.tenant_id::text
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'recipe_ingredients'
      and policyname = 'recipe_ingredients_insert_own_tenant'
  ) then
    create policy recipe_ingredients_insert_own_tenant
      on public.recipe_ingredients
      for insert
      to authenticated
      with check (
        exists (
          select 1
          from public.get_user_tenant_ids() tenant_ids
          where tenant_ids.tenant_id = recipe_ingredients.tenant_id::text
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'recipe_ingredients'
      and policyname = 'recipe_ingredients_update_own_tenant'
  ) then
    create policy recipe_ingredients_update_own_tenant
      on public.recipe_ingredients
      for update
      to authenticated
      using (
        exists (
          select 1
          from public.get_user_tenant_ids() tenant_ids
          where tenant_ids.tenant_id = recipe_ingredients.tenant_id::text
        )
      )
      with check (
        exists (
          select 1
          from public.get_user_tenant_ids() tenant_ids
          where tenant_ids.tenant_id = recipe_ingredients.tenant_id::text
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'recipe_ingredients'
      and policyname = 'recipe_ingredients_delete_own_tenant'
  ) then
    create policy recipe_ingredients_delete_own_tenant
      on public.recipe_ingredients
      for delete
      to authenticated
      using (
        exists (
          select 1
          from public.get_user_tenant_ids() tenant_ids
          where tenant_ids.tenant_id = recipe_ingredients.tenant_id::text
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ingredient_price_history'
      and policyname = 'ingredient_price_history_select_own_tenant'
  ) then
    create policy ingredient_price_history_select_own_tenant
      on public.ingredient_price_history
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.get_user_tenant_ids() tenant_ids
          where tenant_ids.tenant_id = ingredient_price_history.tenant_id::text
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ingredient_price_history'
      and policyname = 'ingredient_price_history_insert_own_tenant'
  ) then
    create policy ingredient_price_history_insert_own_tenant
      on public.ingredient_price_history
      for insert
      to authenticated
      with check (
        exists (
          select 1
          from public.get_user_tenant_ids() tenant_ids
          where tenant_ids.tenant_id = ingredient_price_history.tenant_id::text
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ingredient_price_history'
      and policyname = 'ingredient_price_history_update_own_tenant'
  ) then
    create policy ingredient_price_history_update_own_tenant
      on public.ingredient_price_history
      for update
      to authenticated
      using (
        exists (
          select 1
          from public.get_user_tenant_ids() tenant_ids
          where tenant_ids.tenant_id = ingredient_price_history.tenant_id::text
        )
      )
      with check (
        exists (
          select 1
          from public.get_user_tenant_ids() tenant_ids
          where tenant_ids.tenant_id = ingredient_price_history.tenant_id::text
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ingredient_price_history'
      and policyname = 'ingredient_price_history_delete_own_tenant'
  ) then
    create policy ingredient_price_history_delete_own_tenant
      on public.ingredient_price_history
      for delete
      to authenticated
      using (
        exists (
          select 1
          from public.get_user_tenant_ids() tenant_ids
          where tenant_ids.tenant_id = ingredient_price_history.tenant_id::text
        )
      );
  end if;
end $$;
