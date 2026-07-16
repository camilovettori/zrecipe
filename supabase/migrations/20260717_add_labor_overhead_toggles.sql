ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS labor_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS labor_job_title TEXT,
  ADD COLUMN IF NOT EXISTS labor_hourly_rate NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS overhead_enabled BOOLEAN NOT NULL DEFAULT false;

-- Backward compatibility: recipes that already had a meaningful labor or
-- overhead contribution keep behaving the same way after this change —
-- only NEW recipes default to off.
UPDATE recipes SET labor_enabled = true
  WHERE (labor_mode = 'fixed' AND labor_cost > 0)
     OR (labor_mode = 'time' AND COALESCE(prep_time_minutes, 0) > 0);

UPDATE recipes SET overhead_enabled = true
  WHERE (overhead_mode = 'fixed' AND overhead_cost > 0)
     OR (overhead_mode = 'percent' AND COALESCE(overhead_percent, 0) > 0);

-- Backfill a starting hourly rate (from the tenant's existing default) for
-- recipes being auto-enabled in time mode, so their totals don't change:
UPDATE recipes r
SET labor_hourly_rate = t.labor_hourly_rate
FROM tenants t
WHERE r.tenant_id = t.id
  AND r.labor_enabled = true
  AND r.labor_mode = 'time'
  AND r.labor_hourly_rate IS NULL;
