-- Supplier-aware ingredient name memory for invoice import: remembers
-- which ingredient the user chose for a given (supplier, extracted
-- description) pair, so the next invoice from the same supplier can
-- auto-apply the match before the user ever sees the review step.
CREATE TABLE IF NOT EXISTS invoice_item_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  -- Extracted description, normalized: trimmed + LOWERCASED for lookup
  extracted_description_key TEXT NOT NULL,
  -- The original casing of the extracted description (for display in
  -- an admin/debug view if we ever build one — not shown to users)
  extracted_description_display TEXT NOT NULL,
  -- The user's final choice: link to an existing ingredient
  ingredient_id UUID REFERENCES ingredients(id) ON DELETE CASCADE,
  -- Count of confirmations — every time the user confirms this same
  -- mapping, we bump this. Used to prefer higher-confidence memories
  -- over one-offs if the schema ever supports multiple ingredient
  -- suggestions per key (out of scope for now, but the counter is
  -- cheap to maintain).
  confirmation_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, supplier_id, extracted_description_key)
);

CREATE INDEX IF NOT EXISTS idx_invoice_item_memory_lookup
  ON invoice_item_memory (tenant_id, supplier_id, extracted_description_key);

ALTER TABLE invoice_item_memory ENABLE ROW LEVEL SECURITY;

-- Users can read their own memories.
CREATE POLICY "iim_tenant_read" ON invoice_item_memory
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
    )
  );

-- Writes go through server route with authenticated client (RLS
-- respects tenant), no service role needed. Same pattern as other
-- user-scoped writes.
CREATE POLICY "iim_tenant_write" ON invoice_item_memory
  FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "iim_tenant_update" ON invoice_item_memory
  FOR UPDATE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "iim_tenant_delete" ON invoice_item_memory
  FOR DELETE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
    )
  );
