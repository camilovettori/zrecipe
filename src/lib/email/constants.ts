import 'server-only'

/**
 * Where admin-facing notifications land, per channel.
 *
 * These are Zoho aliases that both route to the same underlying mailbox —
 * the split is for inbox organization, not for having physically separate
 * accounts. Neither needs to be a real deliverable inbox on ziffera.ie for
 * Resend's purposes; Resend only cares that auth.ziffera.ie is verified.
 */
export const ADMIN_HELLO_INBOX = 'hello@zrecipe.ie' // Contact / landing page
export const ADMIN_SUPPORT_INBOX = 'support@zrecipe.ie' // Support / login / register / in-app
