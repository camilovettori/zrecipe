-- Registration and workspace access policies for ZRecipe.
-- This keeps signup working even when the tenant row is selected immediately
-- after insert, before tenant_users has been created.

alter table if exists public.tenants
  add column if not exists owner_email text;

alter table if exists public.tenants
  add column if not exists business_type text;

alter table if exists public.tenants enable row level security;
alter table if exists public.tenant_users enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tenants'
      and policyname = 'tenants_select_own_or_member'
  ) then
    create policy tenants_select_own_or_member
      on public.tenants
      for select
      to authenticated
      using (
        lower(coalesce(owner_email, '')) = lower(coalesce(auth.email(), ''))
        or exists (
          select 1
          from public.tenant_users tu
          where tu.tenant_id::text = tenants.id::text
            and tu.user_id::text = auth.uid()::text
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tenants'
      and policyname = 'tenants_insert_own_workspace'
  ) then
    create policy tenants_insert_own_workspace
      on public.tenants
      for insert
      to authenticated
      with check (
        lower(coalesce(owner_email, '')) = lower(coalesce(auth.email(), ''))
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tenants'
      and policyname = 'tenants_update_member_workspace'
  ) then
    create policy tenants_update_member_workspace
      on public.tenants
      for update
      to authenticated
      using (
        exists (
          select 1
          from public.tenant_users tu
          where tu.tenant_id::text = tenants.id::text
            and tu.user_id::text = auth.uid()::text
            and tu.role in ('owner', 'admin')
        )
      )
      with check (
        exists (
          select 1
          from public.tenant_users tu
          where tu.tenant_id::text = tenants.id::text
            and tu.user_id::text = auth.uid()::text
            and tu.role in ('owner', 'admin')
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tenant_users'
      and policyname = 'tenant_users_select_own_or_member'
  ) then
    create policy tenant_users_select_own_or_member
      on public.tenant_users
      for select
      to authenticated
      using (
        user_id::text = auth.uid()::text
        or exists (
          select 1
          from public.tenant_users tu
          where tu.tenant_id::text = tenant_users.tenant_id::text
            and tu.user_id::text = auth.uid()::text
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tenant_users'
      and policyname = 'tenant_users_insert_self'
  ) then
    create policy tenant_users_insert_self
      on public.tenant_users
      for insert
      to authenticated
      with check (
        user_id::text = auth.uid()::text
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tenant_users'
      and policyname = 'tenant_users_update_member_roles'
  ) then
    create policy tenant_users_update_member_roles
      on public.tenant_users
      for update
      to authenticated
      using (
        exists (
          select 1
          from public.tenant_users tu
          where tu.tenant_id::text = tenant_users.tenant_id::text
            and tu.user_id::text = auth.uid()::text
            and tu.role in ('owner', 'admin')
        )
      )
      with check (
        exists (
          select 1
          from public.tenant_users tu
          where tu.tenant_id::text = tenant_users.tenant_id::text
            and tu.user_id::text = auth.uid()::text
            and tu.role in ('owner', 'admin')
        )
      );
  end if;
end $$;
