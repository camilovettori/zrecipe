/** Trims a brand string for storage; blank/whitespace-only becomes null. */
export function normalizeBrand(brand: string | null | undefined): string | null {
  return brand?.trim() || null
}
