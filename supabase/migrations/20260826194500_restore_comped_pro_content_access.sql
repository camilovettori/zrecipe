-- Keep the database content-limit enforcement aligned with the application:
-- an admin-comped tenant retains Pro access regardless of its historical
-- Stripe subscription status/tier.

CREATE OR REPLACE FUNCTION public.enforce_subscription_content_limits()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tenant_plan TEXT;
  tenant_status TEXT;
  tenant_created_at TIMESTAMPTZ;
  tenant_is_comped BOOLEAN;
  has_pro_access BOOLEAN;
  current_count INTEGER;
  max_allowed INTEGER;
  resource_label TEXT;
BEGIN
  SELECT plan_tier, subscription_status, created_at, is_comped
  INTO tenant_plan, tenant_status, tenant_created_at, tenant_is_comped
  FROM public.tenants
  WHERE id = NEW.tenant_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  has_pro_access :=
    COALESCE(tenant_is_comped, FALSE)
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

  PERFORM pg_advisory_xact_lock(hashtext(NEW.tenant_id::text || ':' || TG_TABLE_NAME));

  IF TG_TABLE_NAME = 'recipes' THEN
    SELECT COUNT(*) INTO current_count FROM public.recipes WHERE tenant_id = NEW.tenant_id;
    max_allowed := 25;
    resource_label := 'recipes';
  ELSIF TG_TABLE_NAME = 'ingredients' THEN
    SELECT COUNT(*) INTO current_count FROM public.ingredients WHERE tenant_id = NEW.tenant_id;
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
