-- Update role constraint to include all valid roles
ALTER TABLE tenant_users
  DROP CONSTRAINT IF EXISTS tenant_users_role_check;

ALTER TABLE tenant_users
  ADD CONSTRAINT tenant_users_role_check
  CHECK (role IN ('owner', 'manager', 'staff'));

-- Pending invites table
CREATE TABLE IF NOT EXISTS tenant_invites (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID REFERENCES tenants(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  role         TEXT DEFAULT 'staff' CHECK (role IN ('manager', 'staff')),
  invited_by   UUID REFERENCES auth.users(id),
  invited_at   TIMESTAMPTZ DEFAULT now(),
  accepted_at  TIMESTAMPTZ,
  status       TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  UNIQUE(tenant_id, email)
);

ALTER TABLE tenant_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON tenant_invites
  FOR ALL USING (tenant_id IN (SELECT get_user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids()));

-- View: join tenant_users with auth.users for easy profile queries.
-- SECURITY DEFINER runs as the view owner (postgres) so it can read auth.users
-- even when the calling role is 'authenticated'.
CREATE OR REPLACE VIEW tenant_user_profiles
WITH (security_invoker = false)
AS
SELECT
  tu.id,
  tu.tenant_id,
  tu.user_id,
  tu.role,
  tu.created_at,
  u.email,
  COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name') AS full_name
FROM tenant_users tu
JOIN auth.users u ON u.id = tu.user_id;

GRANT SELECT ON tenant_user_profiles TO authenticated;
