-- Add cost-mode columns to recipes
ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS labor_mode    VARCHAR(10) DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS overhead_mode VARCHAR(10) DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS overhead_percent NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS waste_percent    NUMERIC(5,2) DEFAULT 0;

-- Add tenant-level defaults
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS labor_hourly_rate NUMERIC(8,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overhead_method   VARCHAR(10)  DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS overhead_percent  NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS waste_percent     NUMERIC(5,2) DEFAULT 0;
