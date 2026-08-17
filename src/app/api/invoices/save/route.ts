/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { normalizeText, resolveInvoiceIngredientPricing } from '@/lib/invoices'
import { normalizeMemoryKey } from '@/lib/utils/normalizeMemoryKey'
import {
  createIngredientAllergenRows,
  normalizeIngredientAllergenSelection,
  type IngredientAllergen,
} from '@/lib/allergens'
import { getEffectiveSubscriptionStatus, getEffectiveTier } from '@/lib/tenant'
import { getLimitsForTier } from '@/lib/subscription/limits'

type SaveItem = {
  id?: string
  description: string
  product_code?: string | null
  quantity: number
  unit: string
  packageSize?: number | null
  packageUnit?: string | null
  unitPrice: number
  total: number
  ingredientId?: string | null
  createIngredient?: boolean
  newIngredientName?: string | null
  newIngredientBrand?: string | null
  newIngredientCategory?: string | null
  newIngredientUnit?: string | null
  newIngredientAllergens?: number[]
  reviewAllergens?: IngredientAllergen[]
  allergensChanged?: boolean
  ingredientMatch?:
    | { type: 'existing'; id: string; name: string }
    | { type: 'create'; name: string }
    | null
  extractedDescriptionOriginal?: string | null
  needs_verification?: boolean
  normalizedPriceConfidence?: 'high' | 'review'
  needsReviewReason?: string | null
  quantityInterpretationConfirmed?: boolean
}

type SupplierMatch =
  | { type: 'existing'; id: string; name: string }
  | { type: 'create'; name: string }
  | null

type AdminClient = {
  from(table: string): any
  storage: any
}

function guessIngredientCategory(description: string) {
  const value = description.toLowerCase()
  if (/(flour|sugar|salt|yeast|baking|starch|bread)/i.test(value)) return 'Baking'
  if (/(milk|cream|butter|cheese|yogurt|yoghurt)/i.test(value)) return 'Dairy'
  if (/(egg|eggs)/i.test(value)) return 'Eggs'
  if (/(beef|pork|chicken|turkey|lamb|meat)/i.test(value)) return 'Meat'
  if (/(fish|salmon|tuna|seafood)/i.test(value)) return 'Seafood'
  if (/(fruit|apple|banana|berry|berries|lettuce|tomato|vegetable|veg|potato|carrot)/i.test(value))
    return 'Produce'
  if (/(water|juice|soda|cola|coffee|tea|beer|wine|drink)/i.test(value)) return 'Beverages'
  if (/(oil|vinegar|sauce|ketchup|mustard|mayo|mayonnaise|spice|herb|pepper)/i.test(value))
    return 'Condiments'
  return 'Other'
}

async function replaceIngredientAllergens(
  admin: AdminClient,
  tenantId: string,
  ingredientId: string,
  selection: IngredientAllergen[]
): Promise<{ message: string } | null> {
  if (selection.length === 0) {
    const { error } = await admin
      .from('ingredient_allergens')
      .delete()
      .eq('ingredient_id', ingredientId)

    return error ? { message: error.message ?? 'Unable to clear allergens' } : null
  }

  // Write the complete reviewed selection first. If this fails, existing
  // declarations remain intact instead of being deleted before a failed insert.
  const rows = createIngredientAllergenRows(ingredientId, tenantId, selection)
  const { error: upsertError } = await admin
    .from('ingredient_allergens')
    .upsert(rows, { onConflict: 'ingredient_id,allergen_id' })

  if (upsertError) {
    return { message: upsertError.message ?? 'Unable to save allergens' }
  }

  const selectedIds = new Set(rows.map((row) => row.allergen_id))
  const { data: existingRows, error: lookupError } = await admin
    .from('ingredient_allergens')
    .select('allergen_id')
    .eq('ingredient_id', ingredientId)

  if (lookupError) {
    return { message: lookupError.message ?? 'Unable to verify allergens' }
  }

  const staleIds = (existingRows ?? [])
    .map((row: { allergen_id: number }) => row.allergen_id)
    .filter((allergenId: number) => !selectedIds.has(allergenId))

  if (staleIds.length > 0) {
    const { error: deleteError } = await admin
      .from('ingredient_allergens')
      .delete()
      .eq('ingredient_id', ingredientId)
      .in('allergen_id', staleIds)

    if (deleteError) {
      return { message: deleteError.message ?? 'Unable to remove old allergens' }
    }
  }

  return null
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {
          // API route only needs to read the authenticated user.
        },
      },
    }
  )
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const contentType = request.headers.get('content-type') ?? ''

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  ) as unknown as AdminClient

  const { data: memberData, error: memberError } = await admin
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()
  const member = memberData as { tenant_id: string } | null

  if (memberError) {
    console.error('[/api/invoices/save] tenant lookup failed:', memberError)
    return NextResponse.json({ error: 'Tenant lookup failed' }, { status: 500 })
  }

  if (!member?.tenant_id) {
    return NextResponse.json({ error: 'No tenant found' }, { status: 404 })
  }

  const tenantId = member.tenant_id as string

  const { data: tenant } = await admin
    .from('tenants')
    .select('subscription_status, plan_tier, is_comped, created_at')
    .eq('id', tenantId)
    .single()
  const subscriptionStatus = getEffectiveSubscriptionStatus(
    tenant?.subscription_status,
    tenant?.created_at ?? new Date().toISOString()
  )
  const tier = getEffectiveTier({
    subscription_status: subscriptionStatus,
    plan_tier: tenant?.plan_tier,
    is_comped: tenant?.is_comped,
  })
  const subscriptionLimits = getLimitsForTier(tier)

  const { data: existingIngredientsData, error: existingIngredientsError } = await admin
    .from('ingredients')
    .select('id, name, price_unit')
    .eq('tenant_id', tenantId)

  if (existingIngredientsError) {
    console.error('[/api/invoices/save] ingredient lookup failed:', existingIngredientsError)
    return NextResponse.json({ error: 'Unable to resolve ingredients' }, { status: 500 })
  }

  const existingIngredients = (existingIngredientsData ?? []) as Array<{
    id: string
    name: string
    price_unit: string | null
  }>
  const ingredientIdByNormalizedName = new Map<string, string>(
    existingIngredients.map((ing) => [
      normalizeText(ing.name),
      ing.id,
    ])
  )
  const ingredientPriceUnitById = new Map(
    existingIngredients.map((ing) => [ing.id, ing.price_unit])
  )
  const tenantIngredientIds = new Set(existingIngredients.map((ing) => ing.id))
  let ingredientCount = existingIngredients.length

  try {
    let body: any = {}
    let uploadedFile: File | null = null

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      const rawData = formData.get('data')
      const fileEntry = formData.get('file')

      uploadedFile = fileEntry instanceof File ? fileEntry : null
      if (typeof rawData === 'string' && rawData.trim()) {
        body = JSON.parse(rawData)
      } else if (rawData instanceof Blob) {
        body = JSON.parse(await rawData.text())
      }
    } else {
      body = await request.json()
    }

    const invoiceId = typeof body?.invoice_id === 'string' && body.invoice_id.trim()
      ? body.invoice_id.trim()
      : crypto.randomUUID()
    const supplierName = typeof body?.supplier_name === 'string' ? body.supplier_name.trim() : ''
    const invoiceNumber = typeof body?.invoice_number === 'string' ? body.invoice_number.trim() : ''
    const invoiceDate =
      typeof body?.invoice_date === 'string' && body.invoice_date.trim()
        ? body.invoice_date.trim()
        : new Date().toISOString().slice(0, 10)
    const currency = typeof body?.currency === 'string' ? body.currency.trim() : 'EUR'
    const notes = typeof body?.notes === 'string' ? body.notes.trim() : ''
    const totalAmount = Number.parseFloat(String(body?.total_amount ?? '0')) || 0
    const initialFileUrl = typeof body?.file_url === 'string' ? body.file_url : null
    const initialFileType = typeof body?.file_type === 'string' ? body.file_type : null
    const items = Array.isArray(body?.items) ? (body.items as SaveItem[]) : []
    const supplierMatch = body?.supplier_match as SupplierMatch | undefined

    if (!supplierName) {
      return NextResponse.json({ error: 'Supplier name is required' }, { status: 400 })
    }

    if (items.length === 0) {
      return NextResponse.json({ error: 'At least one invoice item is required' }, { status: 400 })
    }

    // Validate every row that will create or update an ingredient before the
    // invoice is written. Unmatched rows can still be stored as invoice data.
    for (const item of items) {
      const linkedIngredientId =
        item.ingredientMatch?.type === 'existing'
          ? item.ingredientMatch.id
          : item.ingredientId
      const updatesIngredient = Boolean(
        linkedIngredientId || item.ingredientMatch?.type === 'create' || item.createIngredient
      )
      if (!updatesIngredient) continue

      if (
        item.normalizedPriceConfidence === 'review' &&
        !item.quantityInterpretationConfirmed
      ) {
        return NextResponse.json(
          {
            error: `Needs review: ${item.description || 'invoice item'}. ${item.needsReviewReason ?? 'Confirm invoice quantity source and package size before updating ingredient cost.'}`,
          },
          { status: 400 }
        )
      }

      if (linkedIngredientId && !tenantIngredientIds.has(linkedIngredientId)) {
        return NextResponse.json({ error: 'Selected ingredient is not available in this workspace' }, { status: 400 })
      }

      const pricing = resolveInvoiceIngredientPricing({
        unitPrice: item.unitPrice,
        lineTotal: item.total,
        quantity: item.quantity,
        invoiceUnit: item.unit,
        packageSize: item.packageSize,
        packageUnit: item.packageUnit,
        targetUnit:
          (linkedIngredientId ? ingredientPriceUnitById.get(linkedIngredientId) : null) ??
          item.newIngredientUnit,
      })

      if (!pricing.valid) {
        return NextResponse.json(
          {
            error: `Needs review: ${item.description || 'invoice item'}. ${pricing.warning}`,
          },
          { status: 400 }
        )
      }
    }

    const normalizedSupplierName = supplierName.trim()
    let supplierId = typeof body?.supplier_id === 'string' ? body.supplier_id : null

    if (supplierMatch?.type === 'existing' && supplierMatch.id) {
      supplierId = supplierMatch.id
    }

    if (!supplierId && supplierMatch?.type !== 'create') {
      const { data: existingSupplierData, error: supplierLookupError } = await admin
        .from('suppliers')
        .select('id')
        .eq('tenant_id', tenantId)
        .ilike('name', normalizedSupplierName)
        .limit(1)
        .maybeSingle()
      const existingSupplier = existingSupplierData as { id: string } | null

      if (supplierLookupError) {
        console.error('[/api/invoices/save] supplier lookup failed:', supplierLookupError)
        return NextResponse.json({ error: 'Unable to resolve supplier' }, { status: 500 })
      }

      supplierId = existingSupplier?.id ?? null
    }

    if (!supplierId) {
      // Re-check for a case-variant match right before creating — guards the
      // race between the lookup above and here, and covers the supplierMatch
      // 'create' path which skipped the lookup entirely.
      const { data: recheckSupplierData } = await admin
        .from('suppliers')
        .select('id')
        .eq('tenant_id', tenantId)
        .ilike('name', normalizedSupplierName)
        .limit(1)
        .maybeSingle()
      const recheckSupplier = recheckSupplierData as { id: string } | null

      if (recheckSupplier?.id) {
        supplierId = recheckSupplier.id
      } else {
        const supplierCreatePayload = {
          tenant_id: tenantId,
          name: normalizedSupplierName,
          notes: null,
        }
        const { data: createdSupplierData, error: createSupplierError } = await admin
          .from('suppliers')
          .insert(supplierCreatePayload)
          .select('id, tenant_id, name')
          .single()
        const createdSupplier = createdSupplierData as { id: string } | null

        if (createSupplierError || !createdSupplier) {
          console.error('[/api/invoices/save] supplier create failed:', createSupplierError)
          return NextResponse.json(
            { error: createSupplierError?.message ?? 'Unable to create supplier' },
            { status: 500 }
          )
        }

        supplierId = createdSupplier.id
      }
    }

    if (invoiceNumber && supplierId) {
      const { data: existing } = await admin
        .from('invoices')
        .select('id, invoice_number')
        .eq('tenant_id', tenantId)
        .eq('supplier_id', supplierId)
        .eq('invoice_number', invoiceNumber)
        .neq('id', invoiceId)
        .maybeSingle()

      if (existing) {
        return NextResponse.json(
          { error: `Invoice ${invoiceNumber} from this supplier already exists. Delete the existing one first or use a different invoice number.` },
          { status: 409 }
        )
      }
    }

    let fileUrl = initialFileUrl
    let fileType = initialFileType

    if (uploadedFile) {
      const safeName = uploadedFile.name.replace(/\s+/g, '-')
      const storagePath = `${tenantId}/${invoiceId}/${safeName}`
      const fileBuffer = Buffer.from(await uploadedFile.arrayBuffer())

      const { data: uploadData, error: uploadError } = await admin.storage
        .from('invoices')
        .upload(storagePath, fileBuffer, {
          contentType: uploadedFile.type || undefined,
          upsert: true,
        })

      if (uploadError) {
        console.error('[/api/invoices/save] storage upload failed:', uploadError)
        return NextResponse.json(
          { error: uploadError.message ?? 'Unable to upload invoice file' },
          { status: 500 }
        )
      }

      fileUrl = uploadData?.path
        ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/invoices/${uploadData.path}`
        : fileUrl
      fileType = uploadedFile.type || fileType
    }

    const invoicePayload = {
      id: invoiceId,
      tenant_id: tenantId,
      supplier_id: supplierId,
      invoice_number: invoiceNumber || null,
      invoice_date: invoiceDate,
      total_amount: totalAmount,
      currency,
      file_url: fileUrl,
      file_type: fileType,
      ocr_status: 'completed',
      notes: notes || null,
    }

    const { data: invoiceRow, error: invoiceError } = await admin
      .from('invoices')
      .upsert(invoicePayload, { onConflict: 'id' })
      .select('id, tenant_id, supplier_id, invoice_number, invoice_date, total_amount')
      .single()

    if (invoiceError || !invoiceRow) {
      console.error('[/api/invoices/save] invoice upsert failed:', invoiceError)
      return NextResponse.json(
        { error: invoiceError?.message ?? 'Unable to save invoice' },
        { status: 500 }
      )
    }

    const { error: deleteItemsError } = await admin
      .from('invoice_items')
      .delete()
      .eq('invoice_id', invoiceId)

    if (deleteItemsError) {
      console.error('[/api/invoices/save] existing items delete failed:', deleteItemsError)
      return NextResponse.json(
        { error: deleteItemsError.message ?? 'Unable to refresh invoice items' },
        { status: 500 }
      )
    }

    const createdItems: Array<{ id: string; ingredient_id?: string | null }> = []

    for (const item of items) {
      let ingredientId = item.ingredientId ?? null
      const ingredientMatch = item.ingredientMatch ?? null

      if (ingredientMatch?.type === 'existing' && ingredientMatch.id) {
        ingredientId = ingredientMatch.id
      }

      const pricing = resolveInvoiceIngredientPricing({
        unitPrice: item.unitPrice,
        lineTotal: item.total,
        quantity: item.quantity,
        invoiceUnit: item.unit,
        packageSize: item.packageSize,
        packageUnit: item.packageUnit,
        targetUnit:
          (ingredientId ? ingredientPriceUnitById.get(ingredientId) : null) ??
          item.newIngredientUnit,
      })

      // Unmatched rows do not update ingredient pricing, but still retain
      // their exact invoice quantity, unit, price, and line total below.
      const updatesIngredient = Boolean(
        ingredientId || ingredientMatch?.type === 'create' || item.createIngredient
      )
      if (
        updatesIngredient &&
        item.normalizedPriceConfidence === 'review' &&
        !item.quantityInterpretationConfirmed
      ) {
        return NextResponse.json(
          {
            error: `Needs review: ${item.description}. ${item.needsReviewReason ?? 'Confirm invoice quantity source and package size before updating ingredient cost.'}`,
          },
          { status: 400 }
        )
      }
      if (
        updatesIngredient &&
        (!pricing.valid || pricing.normalizedPrice == null || !pricing.normalizedUnit)
      ) {
        return NextResponse.json(
          { error: `Needs review: ${item.description}. ${pricing.warning}` },
          { status: 400 }
        )
      }

      if ((ingredientMatch?.type === 'create' || item.createIngredient) && !ingredientId) {
        const ingredientName = (ingredientMatch?.type === 'create'
          ? ingredientMatch.name
          : item.newIngredientName ?? item.description ?? ''
        ).trim()

        if (!ingredientName) {
          return NextResponse.json(
            { error: 'Ingredient name is required when creating a new ingredient' },
            { status: 400 }
          )
        }

        const normalizedName = normalizeText(ingredientName)
        const dedupedIngredientId = ingredientIdByNormalizedName.get(normalizedName)

        if (dedupedIngredientId) {
          // An ingredient with the same normalized name already exists (created earlier in
          // this save call, or by a prior invoice) — reuse it instead of creating a duplicate.
          ingredientId = dedupedIngredientId
        } else {
          if (ingredientCount >= subscriptionLimits.maxIngredients) {
            return NextResponse.json(
              { error: `${tier === 'starter' ? 'Starter' : tier} plan limit of ${subscriptionLimits.maxIngredients} ingredients reached.` },
              { status: 403 }
            )
          }

          const ingredientPayload = {
            tenant_id: tenantId,
            name: ingredientName,
            brand: item.newIngredientBrand?.trim() || null,
            category:
              item.newIngredientCategory && item.newIngredientCategory !== 'Other'
                ? item.newIngredientCategory
                : guessIngredientCategory(item.description || ingredientName),
            current_price: pricing.normalizedPrice,
            price_unit: pricing.normalizedUnit,
            package_size: pricing.packageSize,
            package_unit: pricing.packageUnit,
            needs_verification: item.needs_verification ?? false,
          }

          const { data: createdIngredientData, error: createIngredientError } = await admin
            .from('ingredients')
            .insert(ingredientPayload)
            .select('id, tenant_id, name')
            .single()
          const createdIngredient = createdIngredientData as { id: string } | null

          if (createIngredientError || !createdIngredient) {
            console.error('[/api/invoices/save] ingredient create failed:', createIngredientError)
            return NextResponse.json(
              { error: createIngredientError?.message ?? 'Unable to create ingredient' },
              { status: 500 }
            )
          }

          ingredientId = createdIngredient.id
          ingredientCount += 1
          ingredientIdByNormalizedName.set(normalizedName, ingredientId)
          tenantIngredientIds.add(ingredientId)
        }

        // Image is now resolved client-side from the local manifest — no auto-fetch needed here.
      }

      const itemPayload = {
        tenant_id: tenantId,
        invoice_id: invoiceId,
        ingredient_id: ingredientId,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        package_size: item.packageSize ?? null,
        package_unit: item.packageUnit ?? null,
        unit_price: item.unitPrice,
        total_price: item.total,
      }

      const { data: createdItemData, error: itemError } = await admin
        .from('invoice_items')
        .insert(itemPayload)
        .select('id, tenant_id, invoice_id, ingredient_id')
        .single()
      const createdItem = createdItemData as { id: string; ingredient_id?: string | null } | null

      if (itemError || !createdItem) {
        console.error('[/api/invoices/save] invoice item insert failed:', itemError)
        return NextResponse.json(
          { error: itemError?.message ?? 'Unable to save invoice item' },
          { status: 500 }
        )
      }

      createdItems.push(createdItem)

      if (
        ingredientId &&
        (item.allergensChanged || (item.newIngredientAllergens?.length ?? 0) > 0)
      ) {
        const selection = normalizeIngredientAllergenSelection(
          item.reviewAllergens ?? item.newIngredientAllergens?.map((allergenId) => ({
            allergenId,
            status: 'contains' as const,
          }))
        )
        const allergenError = await replaceIngredientAllergens(
          admin,
          tenantId,
          ingredientId,
          selection
        )

        if (allergenError) {
          console.error('[/api/invoices/save] allergen replace failed:', allergenError.message)
          return NextResponse.json({ error: 'Unable to update ingredient allergens' }, { status: 500 })
        }
      }

      // Supplier product-code memory: a (supplier, code) pair is a
      // DEFINITIVE match for future invoices — stronger than name matching —
      // so remember it whenever this line item carries a code and resolved
      // to an ingredient. Best-effort: never fails the (already-succeeded)
      // item save.
      if (subscriptionLimits.canUseSupplierCodes && item.product_code && supplierId && ingredientId) {
        try {
          const { error: codeUpsertError } = await admin
            .from('ingredient_supplier_codes')
            .upsert(
              {
                tenant_id: tenantId,
                supplier_id: supplierId,
                ingredient_id: ingredientId,
                product_code: item.product_code,
                updated_at: new Date().toISOString(),
              },
              {
                onConflict: 'tenant_id,supplier_id,product_code',
                ignoreDuplicates: false,
              }
            )

          if (codeUpsertError) {
            console.error('[/api/invoices/save] supplier code upsert failed:', codeUpsertError)
          }
        } catch (codeErr) {
          console.error('[/api/invoices/save] supplier code upsert failed:', codeErr)
        }
      }

      if (ingredientId) {
        const { data: latestHistoryData } = await admin
          .from('ingredient_price_history')
          .select('recorded_at')
          .eq('ingredient_id', ingredientId)
          .order('recorded_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        const latestHistory = latestHistoryData as { recorded_at: string } | null

        const shouldUpdateCurrent =
          !latestHistory?.recorded_at ||
          new Date(invoiceDate).getTime() >= new Date(latestHistory.recorded_at).getTime()

        if (shouldUpdateCurrent) {
          const ingredientUpdatePayload = {
            current_price: pricing.normalizedPrice,
            price_unit: pricing.normalizedUnit,
            package_size: pricing.packageSize,
            package_unit: pricing.packageUnit,
            last_purchase_date: invoiceDate,
            last_supplier_id: supplierId,
          }
          const { error: ingredientUpdateError } = await admin
            .from('ingredients')
            .update(ingredientUpdatePayload)
            .eq('id', ingredientId)
            .select('id, tenant_id, name')
            .single()

          if (ingredientUpdateError) {
            console.error('[/api/invoices/save] ingredient update failed:', ingredientUpdateError)
            return NextResponse.json(
              { error: ingredientUpdateError.message ?? 'Unable to update ingredient price' },
              { status: 500 }
            )
          }
        }

        const historyPayload = {
          ingredient_id: ingredientId,
          tenant_id: tenantId,
          price: pricing.normalizedPrice,
          unit: pricing.normalizedUnit,
          brand: item.newIngredientBrand?.trim() || null,
          invoice_id: invoiceId,
          recorded_at: invoiceDate,
        }
        const { error: historyError } = await admin
          .from('ingredient_price_history')
          .insert(historyPayload)
          .select('id, tenant_id, ingredient_id, invoice_id')
          .single()

        if (historyError) {
          console.error('[/api/invoices/save] price history insert failed:', historyError)
          return NextResponse.json(
            { error: historyError.message ?? 'Unable to update price history' },
            { status: 500 }
          )
        }

        // A confirmed real price on this line — whether the ingredient was
        // just created above or already existed — is exactly the signal
        // that clears needs_verification. Only touches rows still flagged,
        // so this is a no-op write for the common case. Best-effort: a
        // failure here must never fail the (already-succeeded) invoice save.
        if (Number(item.unitPrice) > 0) {
          try {
            await admin
              .from('ingredients')
              .update({ needs_verification: false })
              .eq('id', ingredientId)
              .eq('needs_verification', true)
          } catch (flagErr) {
            console.error('[/api/invoices/save] needs_verification clear failed:', flagErr)
          }
        }
      }
    }

    // Supplier-aware ingredient name memory: remember what the user chose
    // for each extracted description so the next invoice from this same
    // supplier can auto-apply the match. Best-effort only — a failure here
    // must never fail the invoice save, which has already succeeded above.
    if (supplierId) {
      try {
        for (let i = 0; i < items.length; i++) {
          const item = items[i]
          const createdItem = createdItems[i]
          const original = item.extractedDescriptionOriginal?.trim()
          const finalIngredientId = createdItem?.ingredient_id ?? null
          if (!original || !finalIngredientId) continue

          const key = normalizeMemoryKey(original)
          const { error: memoryError } = await admin
            .from('invoice_item_memory')
            .upsert(
              {
                tenant_id: tenantId,
                supplier_id: supplierId,
                extracted_description_key: key,
                extracted_description_display: original,
                ingredient_id: finalIngredientId,
                confirmation_count: 1,
                last_confirmed_at: new Date().toISOString(),
              },
              {
                onConflict: 'tenant_id,supplier_id,extracted_description_key',
                ignoreDuplicates: false,
              }
            )

          if (memoryError) {
            console.error('[/api/invoices/save] memory upsert failed:', memoryError)
          }
        }
      } catch (memoryErr) {
        console.error('[/api/invoices/save] memory write failed:', memoryErr)
      }
    }

    return NextResponse.json({
      success: true,
      invoiceId,
      supplierId,
      itemCount: createdItems.length,
    })
  } catch (error) {
    console.error('[/api/invoices/save] unhandled error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to save invoice' },
      { status: 500 }
    )
  }
}
