import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Escapes Postgres LIKE/ILIKE wildcards (%, _) and the escape character
 * itself so a user-supplied string used for an exact-match filter can't
 * accidentally behave like a pattern (e.g. a category named "50% Off").
 */
export function escapeLike(value: string): string {
  return value.replace(/[%_\\]/g, '\\$&')
}
