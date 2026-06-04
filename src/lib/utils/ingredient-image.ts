let manifestCache: Record<string, string> | null = null

async function loadManifest(): Promise<Record<string, string>> {
  if (manifestCache) return manifestCache
  try {
    const res = await fetch('/images/ingredients/manifest.json')
    if (!res.ok) throw new Error(`manifest fetch failed: ${res.status}`)
    manifestCache = (await res.json()) as Record<string, string>
  } catch {
    manifestCache = {}
  }
  return manifestCache
}

/**
 * Returns the public path to a local ingredient image, or null if no match.
 *
 * Matching priority:
 *   1. Exact match on lowercased name
 *   2. Keyword match — any manifest key contained in the name
 *      e.g. "Lakeland Butter Salted 250g" → "butter" → /images/ingredients/butter.jpg
 *      e.g. "RHM 12% Flour"              → "flour"  → /images/ingredients/flour.jpg
 *
 * Longer keys are checked first so "brown sugar" wins over "sugar" and
 * "coconut oil" wins over "oil" (if oil were ever added).
 */
export async function findIngredientImage(ingredientName: string): Promise<string | null> {
  const manifest = await loadManifest()
  const name = ingredientName.toLowerCase().trim()

  // 1. Exact match
  if (manifest[name]) {
    return `/images/ingredients/${manifest[name]}`
  }

  // 2. Keyword match — longer keys first to prevent false positives
  const sortedKeys = Object.keys(manifest).sort((a, b) => b.length - a.length)
  for (const key of sortedKeys) {
    if (name.includes(key)) {
      return `/images/ingredients/${manifest[key]}`
    }
  }

  return null
}
