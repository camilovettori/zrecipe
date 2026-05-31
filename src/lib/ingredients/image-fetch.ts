import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

type IngredientImageFetchOptions = {
  ingredientId?: string | null
  ingredientName: string
  force?: boolean
}

type ImageFetchResult = {
  imageUrl: string | null
  query: string | null
  skipped?: string | null
}

type PexelsPhoto = {
  src?: { medium?: string; small?: string; large?: string }
}

type PexelsResponse = {
  photos?: PexelsPhoto[]
  total_results?: number
}

// Strip generic descriptors that don't identify the ingredient visually.
// "powder" and "flour" are intentionally kept — they affect appearance.
const STRIP_QUALIFIERS =
  /\b(granulated|whole|pieces|organic|fresh|dried|ground|raw|pure|fine|coarse|large|small|medium|extra|light|dark|heavy|salted|unsalted|skimmed|semi-skimmed|full-fat|low-fat|reduced|instant|roasted|toasted|sliced|chopped|minced|crushed|cracked|rolled)\b/gi

function cleanIngredientName(name: string): string {
  return name
    .replace(STRIP_QUALIFIERS, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .toLowerCase()
}

async function searchPexels(query: string): Promise<string | null> {
  const key = process.env.PEXELS_API_KEY
  if (!key) return null

  const url =
    `https://api.pexels.com/v1/search` +
    `?query=${encodeURIComponent(query)}` +
    `&per_page=1&orientation=square&size=small`

  const res = await fetch(url, { headers: { Authorization: key } })
  if (!res.ok) {
    console.error(`[image-fetch] Pexels ${res.status} for "${query}"`)
    return null
  }

  const data = (await res.json()) as PexelsResponse
  if (!data.photos?.length) return null
  return data.photos[0].src?.medium ?? data.photos[0].src?.small ?? null
}

export async function fetchAndSaveIngredientImage({
  ingredientId,
  ingredientName,
  force = false,
}: IngredientImageFetchOptions): Promise<ImageFetchResult> {
  const trimmedName = ingredientName.trim()
  if (!trimmedName) {
    return { imageUrl: null, query: null, skipped: 'missing_name' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any

  if (ingredientId && !force) {
    const { data: existing } = (await admin
      .from('ingredients')
      .select('image_url')
      .eq('id', ingredientId)
      .maybeSingle()) as { data: { image_url: string | null } | null }

    if (existing?.image_url) {
      return { imageUrl: existing.image_url, query: null, skipped: 'existing_image' }
    }
  }

  const cleanName = cleanIngredientName(trimmedName)
  const usedClean = cleanName !== trimmedName.toLowerCase()

  // Three-tier query strategy: specific → textural → bare name
  const queries = [
    `${cleanName} raw ingredient white background`,
    `${cleanName} close up texture`,
    cleanName,
    ...(usedClean ? [trimmedName] : []), // final fallback to original if cleaning changed it
  ]

  let imageUrl: string | null = null
  let usedQuery = queries[0]

  for (const q of queries) {
    console.log(`[image-fetch] Pexels query: "${q}"`)
    imageUrl = await searchPexels(q)
    if (imageUrl) { usedQuery = q; break }
  }

  if (!imageUrl) {
    console.log(`[image-fetch] No image found for "${trimmedName}"`)
    return { imageUrl: null, query: usedQuery, skipped: 'no_image_found' }
  }

  console.log(`[image-fetch] Found via "${usedQuery}": ${imageUrl}`)

  if (ingredientId) {
    const { error } = await admin
      .from('ingredients')
      .update({ image_url: imageUrl })
      .eq('id', ingredientId)

    if (error) {
      console.error('[image-fetch] DB save error:', error)
    }
  }

  return { imageUrl, query: usedQuery, skipped: null }
}
