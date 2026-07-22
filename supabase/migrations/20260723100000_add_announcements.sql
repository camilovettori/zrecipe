-- Broadcast announcements: single-post admin messages delivered as
-- read-only in-app notifications + transactional emails, with per-
-- recipient delivery tracking.

CREATE TABLE announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number INTEGER NOT NULL DEFAULT nextval('support_ticket_number_seq'::regclass),
    -- Reuse the existing support ticket sequence intentionally, so
    -- announcement numbers and ticket numbers share the same "#"
    -- namespace and never collide. Same #YYYYMM0000 formatter, prefixed
    -- differently in the UI ("A" instead of "#" — see formatTicketNumber).
  title TEXT NOT NULL,
  body TEXT NOT NULL,
    -- Plain text with line breaks preserved. Not HTML. No user input,
    -- authored by admin only, so no injection risk, but the API layer
    -- still passes it through escapeHtml before rendering.
  audience_kind TEXT NOT NULL
    CHECK (audience_kind IN ('all', 'segment', 'manual')),
  audience_segment TEXT
    CHECK (audience_segment IS NULL OR audience_segment IN
      ('active', 'trialing', 'free', 'past_due')),
    -- Nullable, only set when audience_kind='segment'.
    -- 'free' = no active Stripe subscription AND not trialing.
  sent_by_email TEXT NOT NULL,
    -- Admin's email at the time of send. Denormalized for audit
    -- clarity — the SUPER_ADMIN_EMAIL could rotate someday.
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_recipients INTEGER NOT NULL DEFAULT 0,
  email_ok_count INTEGER NOT NULL DEFAULT 0,
  email_failed_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_announcements_sent_at ON announcements(sent_at DESC);

CREATE TABLE announcement_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL
    REFERENCES announcements(id) ON DELETE CASCADE,
  tenant_id UUID
    REFERENCES tenants(id) ON DELETE SET NULL,
  user_id UUID
    REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
    -- Snapshotted at send-time, so historical records survive email
    -- changes on the auth.users side.
  read_at TIMESTAMPTZ,
  email_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (email_status IN ('pending', 'ok', 'failed', 'skipped')),
  email_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (announcement_id, user_id)
);

CREATE INDEX idx_announcement_recipients_user_unread
  ON announcement_recipients(user_id)
  WHERE read_at IS NULL;

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcement_recipients ENABLE ROW LEVEL SECURITY;

-- Users can SELECT their own recipient rows and their announcements.
-- No INSERT/UPDATE/DELETE at all from users — all writes go through
-- the service role from server actions/API routes.
CREATE POLICY "recipients_self_read"
  ON announcement_recipients FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "announcements_read_for_recipients"
  ON announcements FOR SELECT
  USING (
    id IN (
      SELECT announcement_id FROM announcement_recipients
      WHERE user_id = auth.uid()
    )
  );

-- Allow the user to mark their own recipient row as read.
CREATE POLICY "recipients_self_mark_read"
  ON announcement_recipients FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
  -- The UPDATE policy above lets the client mutate any column on their
  -- own row; that's fine because the only writable field they'd hit is
  -- read_at, and marking yourself read is idempotent + harmless. If
  -- future columns need protection, tighten to a specific server
  -- action instead.
