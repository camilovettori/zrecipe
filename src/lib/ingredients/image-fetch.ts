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

// Ask Claude to extract the bare ingredient name, stripping brand/size/percentage.
// Returns null on any failure so the caller can fall back to regex cleaning.
async function getClaudeSearchQuery(ingredientName: string): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 20,
        messages: [{
          role: 'user',
          content: `What is the base food ingredient in "${ingredientName}"? Reply with ONLY 1-3 words for an image search. Examples:
"RHM 12% Flour" → "wheat flour"
"Lakeland Butter Salted 250g" → "butter"
"KTC Coconut Oil Pure 500ml" → "coconut oil"
"GEM Almonds Ground Bulk 10kg" → "ground almonds"
"Newforge Essence Vanilla 500ml" → "vanilla extract"
Just the ingredient, no brand, no size, no percentage.`,
        }],
      }),
    })

    if (!res.ok) return null
    const data = await res.json() as { content?: Array<{ text?: string }> }
    const text = data.content?.[0]?.text?.trim().toLowerCase()
    return text || null
  } catch {
    return null
  }
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

  // Step 1: ask Claude to extract the bare ingredient (strips brand/size/%).
  // Falls back to regex-based cleaning if the API is unavailable.
  const claudeQuery = await getClaudeSearchQuery(trimmedName)
  const cleanName = claudeQuery ?? cleanIngredientName(trimmedName)
  const usedClean = cleanName !== trimmedName.toLowerCase()

  console.log(`[image-fetch] query base: "${cleanName}" (${claudeQuery ? 'claude' : 'regex'})`)

  // Three-tier query strategy: specific → textural → bare name
  const queries = [
    `${cleanName} close up food ingredient`,
    `${cleanName} raw ingredient white background`,
    `${cleanName} close up texture`,
    cleanName,
    ...(usedClean ? [trimmedName] : []),
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
