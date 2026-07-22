-- Allow recipe file extraction to be tracked alongside invoice extraction.
-- The legacy ai_usage table has no feature CHECK constraint in this repo,
-- but ai_usage_logs may have been created from the documented SQL.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'ai_usage_logs'
  ) THEN
    ALTER TABLE ai_usage_logs
      DROP CONSTRAINT IF EXISTS ai_usage_logs_feature_check;

    ALTER TABLE ai_usage_logs
      ADD CONSTRAINT ai_usage_logs_feature_check
      CHECK (feature IN ('invoice_extract', 'recipe_extract', 'recipe_ideas', 'recipe_suggestions', 'other'));
  END IF;
END $$;
