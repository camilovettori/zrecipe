/*
 * Run this SQL in the Supabase SQL Editor before deploying:
 *
 * CREATE TABLE ai_usage_logs (
 *   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
 *   user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
 *   feature TEXT NOT NULL CHECK (feature IN ('invoice_extract', 'recipe_ideas', 'recipe_suggestions', 'other')),
 *   model TEXT DEFAULT 'claude-sonnet-4-6',
 *   input_tokens INT DEFAULT 0,
 *   output_tokens INT DEFAULT 0,
 *   total_tokens INT DEFAULT 0,
 *   cost_usd DECIMAL(10,6) DEFAULT 0,
 *   request_metadata JSONB,
 *   created_at TIMESTAMPTZ DEFAULT now()
 * );
 *
 * ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;
 *
 * CREATE POLICY "admin_view_ai_usage" ON ai_usage_logs
 *   FOR SELECT USING (true);
 *
 * CREATE INDEX idx_ai_usage_tenant ON ai_usage_logs(tenant_id);
 * CREATE INDEX idx_ai_usage_created ON ai_usage_logs(created_at);
 */

import { createAdminClient } from '@/lib/supabase/admin'

// claude-sonnet-4-6 pricing: $3/M input tokens, $15/M output tokens
const COST_PER_M_INPUT  = 3
const COST_PER_M_OUTPUT = 15

export async function logAIUsage({
  tenantId,
  userId,
  feature,
  inputTokens,
  outputTokens,
  model = 'claude-sonnet-4-6',
  metadata = {},
}: {
  tenantId: string
  userId: string
  feature: 'invoice_extract' | 'recipe_ideas' | 'recipe_suggestions' | 'other'
  inputTokens: number
  outputTokens: number
  model?: string
  metadata?: Record<string, unknown>
}) {
  try {
    const costUsd     = (inputTokens * COST_PER_M_INPUT + outputTokens * COST_PER_M_OUTPUT) / 1_000_000
    const totalTokens = inputTokens + outputTokens

    const admin = createAdminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin.from('ai_usage_logs') as any).insert({
      tenant_id:        tenantId,
      user_id:          userId,
      feature,
      model,
      input_tokens:     inputTokens,
      output_tokens:    outputTokens,
      total_tokens:     totalTokens,
      cost_usd:         costUsd,
      request_metadata: Object.keys(metadata).length ? metadata : null,
    })
  } catch (err) {
    // Never let logging failures break the main feature
    console.error('[ai-usage-logger] Failed to log usage:', err)
  }
}
