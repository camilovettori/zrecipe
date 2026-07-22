const PLACEHOLDER_RE = /\{\{\s*name\s*\}\}/gi

function firstNameOf(fullName: string | null | undefined): string {
  return (fullName ?? '').trim().split(/\s+/)[0] || 'there'
}

/** Substitutes {{name}} in an announcement body with the recipient's
 *  first name (falls back to "there"). Used both at email send time
 *  (per-recipient) and when rendering /announcements/[id] (per-viewer). */
export function renderAnnouncementBody(body: string, fullName: string | null | undefined): string {
  return body.replace(PLACEHOLDER_RE, firstNameOf(fullName))
}

/** Same substitution, for the announcement title. */
export function renderAnnouncementTitle(title: string, fullName: string | null | undefined): string {
  return title.replace(PLACEHOLDER_RE, firstNameOf(fullName))
}
