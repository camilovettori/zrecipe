export function normalizeMemoryKey(description: string): string {
  return description.toLowerCase().replace(/\s+/g, ' ').trim()
}
