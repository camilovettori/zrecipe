-- Support ticket + internal messaging system.
-- Two channels share one schema:
--   'email'    — public/logged-out contact form, conversation continues over real email
--   'internal' — logged-in in-app ticket, conversation continues inside the app

CREATE TABLE support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel TEXT NOT NULL CHECK (channel IN ('email', 'internal')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  -- Requester identity (email channel: from form; internal: from tenant)
  requester_name TEXT NOT NULL,
  requester_email TEXT NOT NULL,
  -- Only set for internal tickets (logged-in users)
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  -- Denormalized last message preview for admin inbox list view
  last_message_preview TEXT,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Unread badge tracking (from each side's perspective)
  admin_unread BOOLEAN NOT NULL DEFAULT true,
  user_unread BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_support_tickets_status_last ON support_tickets(status, last_message_at DESC);
CREATE INDEX idx_support_tickets_tenant ON support_tickets(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX idx_support_tickets_email ON support_tickets(requester_email);

CREATE TABLE support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_role TEXT NOT NULL CHECK (author_role IN ('user', 'admin')),
  author_name TEXT NOT NULL,
  author_email TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_support_messages_ticket ON support_messages(ticket_id, created_at ASC);

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;

-- ── support_tickets ─────────────────────────────────────────────────────────
-- Users can see their own internal tickets.
CREATE POLICY support_tickets_select_own ON support_tickets
  FOR SELECT
  USING (user_id = auth.uid());

-- Users can only create internal tickets, for themselves, scoped to a tenant
-- they actually belong to (or no tenant at all).
CREATE POLICY support_tickets_insert_own ON support_tickets
  FOR INSERT
  WITH CHECK (
    channel = 'internal'
    AND user_id = auth.uid()
    AND (
      tenant_id IS NULL
      OR tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
    )
  );

-- Users can update their own tickets — needed to flip user_unread when they
-- open a ticket or reply, and to bump last_message_at/preview on reply.
CREATE POLICY support_tickets_update_own ON support_tickets
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── support_messages ────────────────────────────────────────────────────────
-- Users can see messages on their own tickets.
CREATE POLICY support_messages_select_own ON support_messages
  FOR SELECT
  USING (
    ticket_id IN (SELECT id FROM support_tickets WHERE user_id = auth.uid())
  );

-- Users can post messages only into their own internal tickets, as themselves.
CREATE POLICY support_messages_insert_own ON support_messages
  FOR INSERT
  WITH CHECK (
    author_role = 'user'
    AND ticket_id IN (
      SELECT id FROM support_tickets WHERE user_id = auth.uid() AND channel = 'internal'
    )
  );

-- No anonymous/public RLS policies on purpose: public (email-channel) ticket
-- creation goes through /api/support/public using the service role client,
-- and all admin operations go through /adminziffera server actions using the
-- service role client — both bypass RLS deliberately rather than exposing a
-- public or admin-privileged insert/select policy that could be abused
-- directly against PostgREST.
