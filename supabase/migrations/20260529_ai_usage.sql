-- Track AI usage per tenant per month
CREATE TABLE IF NOT EXISTS ai_usage (
  id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID        REFERENCES tenants(id) ON DELETE CASCADE,
  feature   TEXT        NOT NULL, -- 'recipe_ideas' | 'invoice_extract'
  used_at   TIMESTAMPTZ DEFAULT now()
);

-- Index for efficient monthly count queries
CREATE INDEX IF NOT EXISTS idx_ai_usage_tenant_feature_month
  ON ai_usage (tenant_id, feature, used_at);

ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_usage_tenant_isolation" ON ai_usage
  FOR ALL TO authenticated
  USING (
    exists (
      select 1 from public.get_user_tenant_ids() ids
      where ids.tenant_id = ai_usage.tenant_id::text
    )
  )
  WITH CHECK (
    exists (
      select 1 from public.get_user_tenant_ids() ids
      where ids.tenant_id = ai_usage.tenant_id::text
    )
  );
