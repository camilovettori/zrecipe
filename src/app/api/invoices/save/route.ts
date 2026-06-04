/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getPackagePricingBasis, normalizePackageUnit } from '@/lib/invoices'

type SaveItem = {
  id?: string
  description: string
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
  ingredientMatch?:
    | { type: 'existing'; id: string; name: string }
    | { type: 'create'; name: string }
    | null
}

type SupplierMatch =
  | { type: 'existing'; id: string; name: string }
  | { type: 'create'; name: string }
  | null

type AdminClient = {
  from(table: string): any
  storage: any
}

function resolveIngredientPricing(item: SaveItem) {
  const packageSize = Number(item.packageSize ?? NaN)
  const packageUnit = normalizePackageUnit(item.packageUnit)
  const basis = getPackagePricingBasis(packageSize, packageUnit)

  if (basis && basis.baseQuantity > 0) {
    return {
      currentPrice: Number((item.unitPrice / basis.baseQuantity).toFixed(4)),
      priceUnit: basis.baseUnit,
      packageSize: packageSize,
      packageUnit: packageUnit,
    }
  }

  return {
    currentPrice: Number.isFinite(item.unitPrice) ? item.unitPrice : 0,
    priceUnit:
      normalizePackageUnit(item.newIngredientUnit ?? item.unit) ?? item.newIngredientUnit ?? item.unit,
    packageSize: null,
    packageUnit: null,
  }
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

export async function POST(request: NextRequest) {
  console.log('[SAVE] Invoice save requested')
  console.log(
    '[SAVE] Using service role:',
    process.env.SUPABASE_SERVICE_ROLE_KEY?.substring(0, 20) ?? 'missing'
  )

  const cookieStore = cookies()
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

  console.log('[SAVE] Auth user:', user?.id ?? 'none')
  console.log('[SAVE] Auth error:', userError ? JSON.stringify(userError) : 'null')

  if (userError || !user) {
    console.log('[SAVE] Aborting: unauthorized')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const contentType = request.headers.get('content-type') ?? ''
  console.log('[SAVE] Request content-type:', contentType)

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

  console.log('[SAVE] Looking up tenant membership...')
  const { data: memberData, error: memberError } = await admin
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()
  const member = memberData as { tenant_id: string } | null

  console.log('[SAVE] Tenant lookup result:', memberData)
  console.log('[SAVE] Tenant lookup error:', memberError ? JSON.stringify(memberError) : 'null')

  if (memberError) {
    console.error('[/api/invoices/save] tenant lookup failed:', memberError)
    return NextResponse.json({ error: 'Tenant lookup failed' }, { status: 500 })
  }

  if (!member?.tenant_id) {
    return NextResponse.json({ error: 'No tenant found' }, { status: 404 })
  }

  const tenantId = member.tenant_id as string

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

      console.log('[SAVE] Multipart form data parsed:', {
        hasFile: Boolean(uploadedFile),
        fileName: uploadedFile?.name ?? null,
        fileType: uploadedFile?.type ?? null,
        dataKeys: Object.keys(body ?? {}),
      })
    } else {
      body = await request.json()
      console.log('[SAVE] JSON body keys:', Object.keys(body ?? {}))
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

    const normalizedSupplierName = supplierName.trim()
    let supplierId = typeof body?.supplier_id === 'string' ? body.supplier_id : null

    console.log('[SAVE] Parsed payload:', {
      invoiceId,
      supplierName: normalizedSupplierName,
      invoiceNumber,
      invoiceDate,
      currency,
      totalAmount,
      fileUrl: initialFileUrl,
      fileType: initialFileType,
      itemCount: items.length,
      supplierMatch,
      supplierId,
      tenantId,
      hasUploadedFile: Boolean(uploadedFile),
    })

    if (supplierMatch?.type === 'existing' && supplierMatch.id) {
      supplierId = supplierMatch.id
    }

    if (!supplierId && supplierMatch?.type !== 'create') {
      console.log('[SAVE] Step 1: Looking up supplier...')
      const { data: existingSupplierData, error: supplierLookupError } = await admin
        .from('suppliers')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('name', normalizedSupplierName)
        .limit(1)
        .maybeSingle()
      const existingSupplier = existingSupplierData as { id: string } | null

      console.log('[SAVE] Supplier lookup result:', existingSupplierData)
      console.log(
        '[SAVE] Supplier lookup error:',
        supplierLookupError ? JSON.stringify(supplierLookupError) : 'null'
      )

      if (supplierLookupError) {
        console.error('[/api/invoices/save] supplier lookup failed:', supplierLookupError)
        return NextResponse.json({ error: 'Unable to resolve supplier' }, { status: 500 })
      }

      supplierId = existingSupplier?.id ?? null
    }

    if (!supplierId) {
      console.log('[SAVE] Step 1: Creating supplier...')
      const supplierCreatePayload = {
        tenant_id: tenantId,
        name: normalizedSupplierName,
        notes: null,
      }
      console.log('[SAVE] Supplier create payload:', supplierCreatePayload)
      const { data: createdSupplierData, error: createSupplierError } = await admin
        .from('suppliers')
        .insert(supplierCreatePayload)
        .select('id, tenant_id, name')
        .single()
      const createdSupplier = createdSupplierData as { id: string } | null

      console.log('[SAVE] Supplier result:', createdSupplierData)
      console.log(
        '[SAVE] Supplier error:',
        createSupplierError ? JSON.stringify(createSupplierError) : 'null'
      )

      if (createSupplierError || !createdSupplier) {
        console.error('[/api/invoices/save] supplier create failed:', createSupplierError)
        return NextResponse.json(
          { error: createSupplierError?.message ?? 'Unable to create supplier' },
          { status: 500 }
        )
      }

      supplierId = createdSupplier.id
    }

    let fileUrl = initialFileUrl
    let fileType = initialFileType

    if (uploadedFile) {
      console.log('[SAVE] Step 2: Uploading invoice file...')
      const safeName = uploadedFile.name.replace(/\s+/g, '-')
      const storagePath = `${tenantId}/${invoiceId}/${safeName}`
      const fileBuffer = Buffer.from(await uploadedFile.arrayBuffer())

      console.log('[SAVE] Storage upload payload:', {
        storagePath,
        fileName: uploadedFile.name,
        fileType: uploadedFile.type,
        size: uploadedFile.size,
      })

      const { data: uploadData, error: uploadError } = await admin.storage
        .from('invoices')
        .upload(storagePath, fileBuffer, {
          contentType: uploadedFile.type || undefined,
          upsert: true,
        })

      console.log('[SAVE] Storage upload result:', uploadData)
      console.log('[SAVE] Storage upload error:', uploadError ? JSON.stringify(uploadError) : 'null')

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
      console.log('[SAVE] Storage public URL:', fileUrl)
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

    console.log('[SAVE] Step 3: Creating invoice...')
    console.log('[SAVE] Invoice payload:', invoicePayload)
    const { data: invoiceRow, error: invoiceError } = await admin
      .from('invoices')
      .upsert(invoicePayload, { onConflict: 'id' })
      .select('id, tenant_id, supplier_id, invoice_number, invoice_date, total_amount')
      .single()

    console.log('[SAVE] Invoice result:', invoiceRow)
    console.log('[SAVE] Invoice error:', invoiceError ? JSON.stringify(invoiceError) : 'null')

    if (invoiceError || !invoiceRow) {
      console.error('[/api/invoices/save] invoice upsert failed:', invoiceError)
      return NextResponse.json(
        { error: invoiceError?.message ?? 'Unable to save invoice' },
        { status: 500 }
      )
    }

    console.log('[SAVE] Step 4: Deleting existing invoice items...')
    const { error: deleteItemsError } = await admin
      .from('invoice_items')
      .delete()
      .eq('invoice_id', invoiceId)

    console.log(
      '[SAVE] Delete existing invoice items error:',
      deleteItemsError ? JSON.stringify(deleteItemsError) : 'null'
    )

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
      const pricing = resolveIngredientPricing(item)

      console.log('[SAVE] Processing item:', {
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        packageSize: item.packageSize,
        packageUnit: item.packageUnit,
        unitPrice: item.unitPrice,
        total: item.total,
        ingredientId,
        ingredientMatch,
        pricing,
      })

      if (ingredientMatch?.type === 'existing' && ingredientMatch.id) {
        ingredientId = ingredientMatch.id
      }

      if ((ingredientMatch?.type === 'create' || item.createIngredient) && !ingredientId) {
        console.log('[SAVE] Step 5: Creating ingredient...')
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

        const ingredientPayload = {
          tenant_id: tenantId,
          name: ingredientName,
          brand: item.newIngredientBrand?.trim() || null,
          category:
            item.newIngredientCategory && item.newIngredientCategory !== 'Other'
              ? item.newIngredientCategory
              : guessIngredientCategory(item.description || ingredientName),
          current_price: pricing.currentPrice,
          price_unit: pricing.priceUnit,
          package_size: pricing.packageSize,
          package_unit: pricing.packageUnit,
        }

        console.log('[SAVE] Ingredient payload:', ingredientPayload)
        const { data: createdIngredientData, error: createIngredientError } = await admin
          .from('ingredients')
          .insert(ingredientPayload)
          .select('id, tenant_id, name')
          .single()
        const createdIngredient = createdIngredientData as { id: string } | null

        console.log('[SAVE] Ingredient result:', createdIngredientData)
        console.log(
          '[SAVE] Ingredient error:',
          createIngredientError ? JSON.stringify(createIngredientError) : 'null'
        )

        if (createIngredientError || !createdIngredient) {
          console.error('[/api/invoices/save] ingredient create failed:', createIngredientError)
          return NextResponse.json(
            { error: createIngredientError?.message ?? 'Unable to create ingredient' },
            { status: 500 }
          )
        }

        ingredientId = createdIngredient.id

        // Image is now resolved client-side from the local manifest — no auto-fetch needed here.
      }

      console.log('[SAVE] Step 6: Creating invoice item...')
      const itemPayload = {
        tenant_id: tenantId,
        invoice_id: invoiceId,
        ingredient_id: ingredientId,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        package_size: pricing.packageSize,
        package_unit: pricing.packageUnit,
        unit_price: item.unitPrice,
        total_price: item.total,
      }

      console.log('[SAVE] Invoice item payload:', itemPayload)
      const { data: createdItemData, error: itemError } = await admin
        .from('invoice_items')
        .insert(itemPayload)
        .select('id, tenant_id, invoice_id, ingredient_id')
        .single()
      const createdItem = createdItemData as { id: string; ingredient_id?: string | null } | null

      console.log('[SAVE] Invoice item result:', createdItemData)
      console.log('[SAVE] Invoice item error:', itemError ? JSON.stringify(itemError) : 'null')

      if (itemError || !createdItem) {
        console.error('[/api/invoices/save] invoice item insert failed:', itemError)
        return NextResponse.json(
          { error: itemError?.message ?? 'Unable to save invoice item' },
          { status: 500 }
        )
      }

      createdItems.push(createdItem)

      if (ingredientId) {
        console.log('[SAVE] Step 7: Updating ingredient price...')

        const ingredientUpdatePayload = {
          current_price: pricing.currentPrice,
          price_unit: pricing.priceUnit,
          package_size: pricing.packageSize,
          package_unit: pricing.packageUnit,
          last_purchase_date: invoiceDate,
          last_supplier_id: supplierId,
        }
        console.log('[SAVE] Ingredient update payload:', ingredientUpdatePayload)
        const { data: ingredientUpdateData, error: ingredientUpdateError } = await admin
          .from('ingredients')
          .update(ingredientUpdatePayload)
          .eq('id', ingredientId)
          .select('id, tenant_id, name')
          .single()

        console.log('[SAVE] Ingredient update result:', ingredientUpdateData)
        console.log(
          '[SAVE] Ingredient update error:',
          ingredientUpdateError ? JSON.stringify(ingredientUpdateError) : 'null'
        )

        if (ingredientUpdateError) {
          console.error('[/api/invoices/save] ingredient update failed:', ingredientUpdateError)
          return NextResponse.json(
            { error: ingredientUpdateError.message ?? 'Unable to update ingredient price' },
            { status: 500 }
          )
        }

        console.log('[SAVE] Step 8: Creating ingredient price history...')
        const historyPayload = {
          ingredient_id: ingredientId,
          tenant_id: tenantId,
          price: pricing.currentPrice,
          unit: pricing.priceUnit,
          invoice_id: invoiceId,
          recorded_at: invoiceDate,
        }
        console.log('[SAVE] History payload:', historyPayload)
        const { data: historyData, error: historyError } = await admin
          .from('ingredient_price_history')
          .insert(historyPayload)
          .select('id, tenant_id, ingredient_id, invoice_id')
          .single()

        console.log('[SAVE] History result:', historyData)
        console.log('[SAVE] History error:', historyError ? JSON.stringify(historyError) : 'null')

        if (historyError) {
          console.error('[/api/invoices/save] price history insert failed:', historyError)
          return NextResponse.json(
            { error: historyError.message ?? 'Unable to update price history' },
            { status: 500 }
          )
        }
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
