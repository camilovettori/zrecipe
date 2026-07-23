-- Audit trail for Terms of Service / Privacy Policy acceptance at signup.
-- Bump terms_version whenever Terms or Privacy Policy is materially
-- updated — this establishes which version each user accepted.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS terms_accepted_ip TEXT,
  ADD COLUMN IF NOT EXISTS terms_version TEXT DEFAULT 'v1';
