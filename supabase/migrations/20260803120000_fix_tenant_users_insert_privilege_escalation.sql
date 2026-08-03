-- SECURITY FIX: tenant_users_insert_self only validated user_id = auth.uid()
-- and never checked tenant_id, letting any authenticated user insert
-- themselves into ANY tenant (including as 'owner') by calling
-- supabase.from('tenant_users').insert({ tenant_id: <any>, user_id: auth.uid(), role: 'owner' })
-- directly from the browser client.
--
-- Fix: require a matching pending row in tenant_invites for tenant_id + email.
-- tenant_invites.role is constrained to ('manager', 'staff') only, so this
-- also makes owner-role self-insertion impossible via this policy.

drop policy if exists tenant_users_insert_self on public.tenant_users;

create policy tenant_users_insert_self
  on public.tenant_users
  for insert
  to authenticated
  with check (
    user_id::text = auth.uid()::text
    and exists (
      select 1
      from public.tenant_invites ti
      where ti.tenant_id = tenant_users.tenant_id
        and lower(ti.email) = lower(coalesce(auth.email(), ''))
        and ti.status = 'pending'
    )
  );
