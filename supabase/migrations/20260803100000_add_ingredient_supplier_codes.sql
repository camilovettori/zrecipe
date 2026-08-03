-- Per-supplier product codes (SKU / article / item number) for ingredients.
-- A (supplier, product_code) match is a DEFINITIVE match when reconciling
-- invoice line items to ingredients — stronger than any name matching,
-- since suppliers reuse codes consistently across invoices even when the
-- printed description text varies.
CREATE TABLE IF NOT EXISTS ingredient_supplier_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  product_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, supplier_id, product_code)
);

CREATE INDEX IF NOT EXISTS idx_ingredient_supplier_codes_lookup
  ON ingredient_supplier_codes (tenant_id, supplier_id, product_code);

ALTER TABLE ingredient_supplier_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "isc_tenant_read" ON ingredient_supplier_codes
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "isc_tenant_write" ON ingredient_supplier_codes
  FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "isc_tenant_update" ON ingredient_supplier_codes
  FOR UPDATE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "isc_tenant_delete" ON ingredient_supplier_codes
  FOR DELETE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
    )
  );
