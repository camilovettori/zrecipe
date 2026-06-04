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
  return manifestCache!
}

export async function findIngredientImage(ingredientName: string): Promise<string | null> {
  const manifest = await loadManifest()
  const name = ingredientName.toLowerCase().trim()

  // 1. Exact match
  if (manifest[name]) {
    return `/images/ingredients/${manifest[name]}`
  }

  // 2. Word-boundary keyword match — longer keys first so "coconut oil" wins over "oil"
  // and "demerara sugar" wins over "sugar". \b prevents "salt" matching "salted".
  const sortedKeys = Object.keys(manifest).sort((a, b) => b.length - a.length)
  for (const key of sortedKeys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
    const regex = new RegExp(`\\b${escaped}\\b`, 'i')
    if (regex.test(name)) {
      return `/images/ingredients/${manifest[key]}`
    }
  }

  return null
}
