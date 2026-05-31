import { NextRequest, NextResponse } from 'next/server'
import { createRequestSupabaseClient } from '@/lib/supabase/request'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAndSaveIngredientImage } from '@/lib/ingredients/image-fetch'

export const runtime = 'nodejs'
export const maxDuration = 30

type FetchImageBody = {
  ingredientId?: unknown
  ingredientName?: unknown
  force?: unknown
}

type IngredientLookupRow = {
  id: string
  tenant_id: string
  name: string
  image_url: string | null
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createRequestSupabaseClient(request)
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json().catch(() => ({}))) as FetchImageBody
    const ingredientId =
      typeof body.ingredientId === 'string' ? body.ingredientId.trim() : ''
    const bodyIngredientName =
      typeof body.ingredientName === 'string' ? body.ingredientName.trim() : ''
    const force = body.force === true

    if (!ingredientId && !bodyIngredientName) {
      return NextResponse.json(
        { error: 'ingredientId or ingredientName is required' },
        { status: 400 }
      )
    }

    const admin = createAdminClient()

    let tenantId: string | null = null
    let ingredientName = bodyIngredientName

    if (ingredientId) {
      const { data: ingredientData, error: ingredientError } = await admin
        .from('ingredients')
        .select('id, tenant_id, name, image_url')
        .eq('id', ingredientId)
        .maybeSingle()
      const ingredient = ingredientData as IngredientLookupRow | null

      if (ingredientError) {
        return NextResponse.json({ error: ingredientError.message }, { status: 500 })
      }

      if (!ingredient) {
        return NextResponse.json({ error: 'Ingredient not found' }, { status: 404 })
      }

      tenantId = ingredient.tenant_id as string
      ingredientName = ingredientName || (ingredient.name as string)

      const { data: member } = await admin
        .from('tenant_users')
        .select('id')
        .eq('user_id', user.id)
        .eq('tenant_id', tenantId)
        .maybeSingle()

      if (!member) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const result = await fetchAndSaveIngredientImage({
      ingredientId: ingredientId || null,
      ingredientName,
      force,
    })

    return NextResponse.json({
      imageUrl: result.imageUrl,
      query: result.query ?? null,
      skipped: result.skipped ?? null,
      tenantId,
    })
  } catch (error: unknown) {
    console.error('[ingredient image] fetch failed:', error)
    return NextResponse.json({
      imageUrl: null,
      error: error instanceof Error ? error.message : 'Unable to fetch ingredient image',
      skipped: 'fetch_failed',
    })
  }
}
