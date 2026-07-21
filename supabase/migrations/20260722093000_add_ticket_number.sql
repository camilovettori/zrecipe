-- Auto-incrementing, tenant-agnostic (global) ticket numbers.
-- Global is intentional: #1247 is a single lookup key across admin and user views.
CREATE SEQUENCE IF NOT EXISTS support_ticket_number_seq;

ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS number INTEGER;

-- Backfill existing rows in creation order, so old tickets get low numbers.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM support_tickets WHERE number IS NULL ORDER BY created_at ASC LOOP
    UPDATE support_tickets SET number = nextval('support_ticket_number_seq') WHERE id = r.id;
  END LOOP;
END $$;

-- Make it required and default new rows to the next sequence value.
ALTER TABLE support_tickets
  ALTER COLUMN number SET DEFAULT nextval('support_ticket_number_seq'),
  ALTER COLUMN number SET NOT NULL;

-- Advance the sequence past the backfill so no collisions.
SELECT setval(
  'support_ticket_number_seq',
  GREATEST(COALESCE((SELECT MAX(number) FROM support_tickets), 0), 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_support_tickets_number ON support_tickets(number);
