ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS plan_tier TEXT NOT NULL DEFAULT 'starter'
  CHECK (plan_tier IN ('starter', 'pro', 'business'));

-- Existing Stripe subscribers are on the legacy EUR 25 Pro price.
UPDATE tenants
SET plan_tier = 'pro'
WHERE subscription_status IN ('active', 'trialing')
  AND stripe_subscription_id IS NOT NULL;

-- Enforce Starter content limits at the database boundary. Most ingredient
-- creation happens directly through the authenticated Supabase client, so an
-- API-only check would be bypassable. Triggers also protect recipes created
-- outside the normal server route.
CREATE OR REPLACE FUNCTION public.enforce_subscription_content_limits()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tenant_plan TEXT;
  tenant_status TEXT;
  tenant_comped BOOLEAN;
  tenant_created_at TIMESTAMPTZ;
  has_pro_access BOOLEAN;
  current_count INTEGER;
  max_allowed INTEGER;
  resource_label TEXT;
BEGIN
  SELECT plan_tier, subscription_status, COALESCE(is_comped, false), created_at
  INTO tenant_plan, tenant_status, tenant_comped, tenant_created_at
  FROM public.tenants
  WHERE id = NEW.tenant_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  has_pro_access :=
    tenant_comped
    OR (tenant_status = 'active' AND tenant_plan IN ('pro', 'business'))
    OR (
      tenant_created_at + INTERVAL '14 days' > now()
      AND (
        tenant_status = 'trialing'
        OR tenant_status IS NULL
        OR tenant_status NOT IN ('active', 'canceled', 'past_due')
      )
    );

  IF has_pro_access THEN
    RETURN NEW;
  END IF;

  -- Serialize concurrent Starter inserts for the same tenant/resource so two
  -- requests cannot both pass the count check at the limit boundary.
  PERFORM pg_advisory_xact_lock(hashtext(NEW.tenant_id::text || ':' || TG_TABLE_NAME));

  IF TG_TABLE_NAME = 'recipes' THEN
    SELECT COUNT(*) INTO current_count
    FROM public.recipes
    WHERE tenant_id = NEW.tenant_id;
    max_allowed := 25;
    resource_label := 'recipes';
  ELSIF TG_TABLE_NAME = 'ingredients' THEN
    SELECT COUNT(*) INTO current_count
    FROM public.ingredients
    WHERE tenant_id = NEW.tenant_id;
    max_allowed := 75;
    resource_label := 'ingredients';
  ELSE
    RETURN NEW;
  END IF;

  IF current_count >= max_allowed THEN
    RAISE EXCEPTION 'Starter plan limit of % % reached', max_allowed, resource_label
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_recipe_subscription_limit ON public.recipes;
CREATE TRIGGER enforce_recipe_subscription_limit
  BEFORE INSERT ON public.recipes
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_subscription_content_limits();

DROP TRIGGER IF EXISTS enforce_ingredient_subscription_limit ON public.ingredients;
CREATE TRIGGER enforce_ingredient_subscription_limit
  BEFORE INSERT ON public.ingredients
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_subscription_content_limits();
