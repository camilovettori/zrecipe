-- Add custom Kitchen Card logo column to tenants table
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS custom_logo_url TEXT;

COMMENT ON COLUMN tenants.custom_logo_url IS 'Public URL of the tenant''s uploaded logo, shown on the Kitchen Card header in place of the ZRecipe logo. Only settable by tenants with branding rights (active subscription or is_comped).';
