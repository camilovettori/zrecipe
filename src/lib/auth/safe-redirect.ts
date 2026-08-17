const DEFAULT_DESTINATION = '/dashboard'
const BLOCKED_DESTINATIONS = new Set([
  '/',
  '/login',
  '/register',
  '/signup',
  '/auth/callback',
])

/** Accepts only same-site paths and prevents protocol-relative/open redirects. */
export function getSafeInternalRedirect(value: string | null | undefined): string {
  if (
    !value ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    /[\u0000-\u001F\u007F]/.test(value)
  ) {
    return DEFAULT_DESTINATION
  }

  try {
    const parsed = new URL(value, 'https://zrecipe.ie')
    if (parsed.origin !== 'https://zrecipe.ie' || BLOCKED_DESTINATIONS.has(parsed.pathname)) {
      return DEFAULT_DESTINATION
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return DEFAULT_DESTINATION
  }
}
