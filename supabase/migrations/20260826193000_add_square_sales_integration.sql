-- Square POS integration. OAuth credentials are encrypted in the application
-- before storage; sales are kept per tenant for reporting and analytics.

CREATE TABLE IF NOT EXISTS public.square_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  merchant_id TEXT NOT NULL,
  merchant_name TEXT,
  access_token_ciphertext TEXT NOT NULL,
  refresh_token_ciphertext TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ,
  granted_scopes TEXT[] NOT NULL DEFAULT '{}',
  locations JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_synced_at TIMESTAMPTZ,
  last_sync_status TEXT NOT NULL DEFAULT 'never' CHECK (last_sync_status IN ('never', 'success', 'failed')),
  last_sync_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS square_connections_merchant_id_idx
  ON public.square_connections (merchant_id);

CREATE TABLE IF NOT EXISTS public.square_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES public.square_connections(id) ON DELETE CASCADE,
  square_order_id TEXT NOT NULL,
  location_id TEXT,
  state TEXT NOT NULL,
  source_name TEXT,
  created_at_square TIMESTAMPTZ NOT NULL,
  updated_at_square TIMESTAMPTZ,
  closed_at_square TIMESTAMPTZ,
  currency TEXT NOT NULL DEFAULT 'EUR',
  gross_amount_cents BIGINT NOT NULL DEFAULT 0,
  discount_amount_cents BIGINT NOT NULL DEFAULT 0,
  tax_amount_cents BIGINT NOT NULL DEFAULT 0,
  net_amount_cents BIGINT NOT NULL DEFAULT 0,
  total_amount_cents BIGINT NOT NULL DEFAULT 0,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, square_order_id)
);

CREATE INDEX IF NOT EXISTS square_orders_tenant_created_idx
  ON public.square_orders (tenant_id, created_at_square DESC);

CREATE INDEX IF NOT EXISTS square_orders_tenant_state_idx
  ON public.square_orders (tenant_id, state);

CREATE TABLE IF NOT EXISTS public.square_order_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  square_order_id TEXT NOT NULL,
  square_line_item_uid TEXT NOT NULL,
  catalog_object_id TEXT,
  catalog_version BIGINT,
  sku TEXT,
  name TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 0,
  gross_amount_cents BIGINT NOT NULL DEFAULT 0,
  total_amount_cents BIGINT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, square_order_id, square_line_item_uid),
  FOREIGN KEY (tenant_id, square_order_id)
    REFERENCES public.square_orders(tenant_id, square_order_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS square_order_line_items_tenant_catalog_idx
  ON public.square_order_line_items (tenant_id, catalog_object_id);

-- These tables contain encrypted credentials and reporting data. All reads and
-- writes go through server routes using the service-role client.
ALTER TABLE public.square_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.square_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.square_order_line_items ENABLE ROW LEVEL SECURITY;

