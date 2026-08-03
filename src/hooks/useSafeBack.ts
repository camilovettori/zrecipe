'use client'

import { useRouter } from 'next/navigation'

/**
 * Back-button navigation that preserves whatever list-page state (search,
 * filters, scroll position) the user came from, instead of hard-resetting to
 * the list root. Falls back to `fallbackHref` when there's no history to
 * return to (e.g. the page was opened directly from a bookmark or new tab).
 */
export function useSafeBack(fallbackHref: string) {
  const router = useRouter()

  return () => {
    if (window.history.length > 1) {
      router.back()
    } else {
      router.push(fallbackHref)
    }
  }
}
