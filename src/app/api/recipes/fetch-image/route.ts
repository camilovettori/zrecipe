import { NextRequest, NextResponse } from 'next/server'
import { createRequestSupabaseClient } from '@/lib/supabase/request'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const maxDuration = 30

const STRIP_QUALIFIERS =
  /\b(homemade|easy|quick|simple|classic|traditional|authentic|creamy|crispy|crunchy|spicy|sweet|savory|baked|fried|grilled|roasted|slow|instant|fresh|healthy|delicious)\b/gi

function cleanRecipeName(name: string): string {
  return name
    .replace(STRIP_QUALIFIERS, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .toLowerCase()
}

type PexelsPhoto = { src?: { medium?: string; small?: string } }
type PexelsResponse = { photos?: PexelsPhoto[] }

async function searchPexels(query: string): Promise<string | null> {
  const key = process.env.PEXELS_API_KEY
  if (!key) return null

  const url =
    `https://api.pexels.com/v1/search` +
    `?query=${encodeURIComponent(query)}` +
    `&per_page=1&orientation=square&size=small`

  const res = await fetch(url, { headers: { Authorization: key } })
  if (!res.ok) return null

  const data = (await res.json()) as PexelsResponse
  if (!data.photos?.length) return null
  return data.photos[0].src?.medium ?? data.photos[0].src?.small ?? null
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createRequestSupabaseClient(request)
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({})) as { recipeName?: unknown; recipeId?: unknown }
    const recipeName = typeof body.recipeName === 'string' ? body.recipeName.trim() : ''
    const recipeId = typeof body.recipeId === 'string' ? body.recipeId.trim() : ''

    if (!recipeName) {
      return NextResponse.json({ error: 'recipeName is required' }, { status: 400 })
    }

    const cleanName = cleanRecipeName(recipeName)

    const queries = [
      `${cleanName} food recipe dish`,
      `${cleanName} food`,
      cleanName,
      ...(cleanName !== recipeName.toLowerCase() ? [recipeName.toLowerCase()] : []),
    ]

    let imageUrl: string | null = null
    for (const q of queries) {
      imageUrl = await searchPexels(q)
      if (imageUrl) break
    }

    // Persist to recipe row if we have a real recipe ID
    if (imageUrl && recipeId && recipeId !== 'draft' && recipeId !== 'new') {
      const admin = createAdminClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (admin.from('recipes') as any)
        .update({ image_url: imageUrl })
        .eq('id', recipeId)
    }

    return NextResponse.json({ imageUrl })
  } catch (error: unknown) {
    console.error('[recipe image] fetch failed:', error)
    return NextResponse.json({ imageUrl: null, error: error instanceof Error ? error.message : 'Unknown error' })
  }
}
