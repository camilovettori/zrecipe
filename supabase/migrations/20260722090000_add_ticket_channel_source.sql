-- Distinguishes the Contact (landing page) and Support (login/register/
-- in-app) channels within the existing 'email' ticket channel, plus labels
-- 'internal' tickets explicitly for consistent admin-inbox display.

ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS channel_source TEXT
    CHECK (channel_source IN ('contact', 'support', 'internal'));

-- Backfill existing rows. Note: this intentionally does NOT set
-- channel_source = channel directly — the existing `channel` column's
-- 'email' value is not one of the allowed channel_source values (it
-- predates the contact/support split), so that would violate the CHECK
-- constraint above. Pre-existing email-channel tickets are backfilled to
-- 'support' (the only channel that existed before this split); internal
-- tickets map straight across.
UPDATE support_tickets
  SET channel_source = CASE
    WHEN channel = 'internal' THEN 'internal'
    ELSE 'support'
  END
  WHERE channel_source IS NULL;
