ALTER TABLE ingredients
  ADD COLUMN IF NOT EXISTS needs_verification BOOLEAN NOT NULL DEFAULT false;

-- Backfill: any existing ingredient whose name currently contains
-- "(verify)" gets the flag set and the suffix stripped in one atomic
-- pass. Preserve trailing whitespace cleanly.
UPDATE ingredients
SET
  needs_verification = true,
  name = TRIM(REGEXP_REPLACE(name, '\s*\(verify\)\s*$', '', 'i'))
WHERE name ~* '\(verify\)';

-- Partial index — most rows will NOT need verification, so a partial
-- index on the flag=true rows is much smaller than a full one.
CREATE INDEX IF NOT EXISTS idx_ingredients_needs_verification
  ON ingredients (tenant_id)
  WHERE needs_verification = true;

COMMENT ON COLUMN ingredients.needs_verification IS
  'True when this ingredient was flagged by AI extraction as
   uncertain (previously via a "(verify)" suffix in the name).
   The user should review key fields — usually price — before
   relying on cost calculations. Flag auto-clears when the user
   saves an explicit price via the ingredient detail page or via
   an invoice line matching this ingredient with a confirmed price.';
