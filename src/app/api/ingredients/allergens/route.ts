import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRequestSupabaseClient } from '@/lib/supabase/request'
import type { AllergenStatus, IngredientAllergen } from '@/lib/allergens'

export const runtime = 'nodejs'

// ── GET /api/ingredients/allergens?id=xxx or ?ids=a,b,c ───────────────────
// Returns Record<ingredientId, IngredientAllergen[]>

export async function GET(request: NextRequest) {
  try {
    const supabase = createRequestSupabaseClient(request)
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id  = searchParams.get('id')
    const ids = searchParams.get('ids')

    const rawIds = id
      ? [id]
      : ids
        ? ids.split(',').filter(Boolean)
        : []

    if (rawIds.length === 0) {
      return NextResponse.json({})
    }

    const admin = createAdminClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (admin.from('ingredient_allergens') as any)
      .select('ingredient_id, allergen_id, status')
      .in('ingredient_id', rawIds)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Group by ingredient_id
    const result: Record<string, IngredientAllergen[]> = {}
    for (const id of rawIds) result[id] = []

    for (const row of (data ?? [])) {
      const arr = result[row.ingredient_id]
      if (arr) {
        arr.push({ allergenId: row.allergen_id, status: row.status as AllergenStatus })
      }
    }

    return NextResponse.json(result)
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch allergens' },
      { status: 500 }
    )
  }
}

// ── PUT /api/ingredients/allergens ────────────────────────────────────────
// Body: { ingredientId: string, allergens: IngredientAllergen[] }
// Replaces all allergen records for the ingredient.

export async function PUT(request: NextRequest) {
  try {
    const supabase = createRequestSupabaseClient(request)
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json() as {
      ingredientId: string
      allergens: IngredientAllergen[]
    }

    if (!body.ingredientId) {
      return NextResponse.json({ error: 'ingredientId required' }, { status: 400 })
    }

    console.log('[allergens PUT] ingredientId:', body.ingredientId, 'allergens:', body.allergens.length)

    const admin = createAdminClient()

    // Verify ingredient belongs to a tenant the user is a member of
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: ing, error: ingError } = await (admin.from('ingredients') as any)
      .select('id, tenant_id')
      .eq('id', body.ingredientId)
      .single()

    console.log('[allergens PUT] ingredient lookup:', ing ? `tenant=${ing.tenant_id}` : 'not found', ingError?.message)

    if (!ing) {
      return NextResponse.json({ error: 'Ingredient not found' }, { status: 404 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: member } = await (admin.from('tenant_users') as any)
      .select('id')
      .eq('user_id', user.id)
      .eq('tenant_id', ing.tenant_id)
      .maybeSingle()

    console.log('[allergens PUT] tenant member check:', member ? 'ok' : 'not found (forbidden)')

    if (!member) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Replace all allergen records for this ingredient
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: deleteError } = await (admin.from('ingredient_allergens') as any)
      .delete()
      .eq('ingredient_id', body.ingredientId)

    if (deleteError) {
      console.error('[allergens PUT] delete error:', deleteError)
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    if (body.allergens.length > 0) {
      const rows = body.allergens.map((a) => ({
        ingredient_id: body.ingredientId,
        allergen_id:   a.allergenId,
        status:        a.status,
        tenant_id:     ing.tenant_id,
      }))

      console.log('[allergens PUT] inserting rows:', rows)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: insertError } = await (admin.from('ingredient_allergens') as any).insert(rows)
      if (insertError) {
        console.error('[allergens PUT] insert error:', insertError)
        return NextResponse.json({ error: insertError.message }, { status: 500 })
      }
    }

    console.log('[allergens PUT] success')
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save allergens' },
      { status: 500 }
    )
  }
}
