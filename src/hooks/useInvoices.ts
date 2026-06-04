'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { resolveTenantId } from '@/hooks/useTenant'

export type InvoiceStatus = 'completed' | 'processing' | 'failed'
export type InvoiceFileType = 'pdf' | 'csv' | 'image'

export interface SupplierLookup {
  id: string
  name: string
  contactEmail?: string | null
  contactPhone?: string | null
  address?: string | null
}

export interface IngredientLookup {
  id: string
  name: string
  currentPrice?: number | null
  priceUnit?: string | null
  packageSize?: number | null
  packageUnit?: string | null
}

export interface InvoiceItemRecord {
  id: string
  invoiceId: string
  ingredientId?: string | null
  description: string
  quantity: number
  unit: string
  packageSize?: number | null
  packageUnit?: string | null
  unitPrice: number
  totalPrice: number
  ingredient?: IngredientLookup | null
}

export interface InvoiceRecord {
  id: string
  tenantId: string
  supplierId?: string | null
  supplier?: SupplierLookup | null
  invoiceNumber?: string | null
  invoiceDate: string
  totalAmount?: number | null
  currency?: string | null
  fileUrl?: string | null
  fileType?: InvoiceFileType | null
  ocrStatus: InvoiceStatus
  notes?: string | null
  items: InvoiceItemRecord[]
  createdAt: string
  updatedAt: string
}

export interface InvoiceDraftItem {
  description: string
  quantity: number
  unit: string
  packageSize?: number | null
  packageUnit?: string | null
  unitPrice: number
  total: number
  ingredientId?: string | null
  createIngredient?: boolean
}

export interface InvoiceDraftInput {
  supplierId?: string | null
  supplierName?: string | null
  invoiceNumber?: string | null
  invoiceDate: string
  totalAmount?: number | null
  currency?: string | null
  fileUrl?: string | null
  fileType?: InvoiceFileType | null
  notes?: string | null
  ocrRawData?: Record<string, unknown> | null
  items: InvoiceDraftItem[]
}

type DatabaseInvoiceRow = {
  id: string
  tenant_id: string
  supplier_id?: string | null
  supplier?:
    | {
        id: string
        name: string
        contact_email?: string | null
        contact_phone?: string | null
        address?: string | null
      }
    | Array<{
        id: string
        name: string
        contact_email?: string | null
        contact_phone?: string | null
        address?: string | null
      }>
    | null
  invoice_number?: string | null
  invoice_date: string
  total_amount?: number | null
  currency?: string | null
  file_url?: string | null
  file_type?: InvoiceFileType | null
  ocr_status: InvoiceStatus | null
  notes?: string | null
  invoice_items?: Array<{
    id: string
    invoice_id: string
    ingredient_id?: string | null
    description: string
    quantity: number
    unit: string
    package_size?: number | null
    package_unit?: string | null
    unit_price: number
    total_price: number
    ingredient?:
      | {
          id: string
          name: string
          current_price?: number | null
          price_unit?: string | null
          package_size?: number | null
          package_unit?: string | null
        }
      | Array<{
          id: string
          name: string
          current_price?: number | null
          price_unit?: string | null
          package_size?: number | null
          package_unit?: string | null
        }>
      | null
  }>
  created_at: string
  updated_at: string
}

function mapInvoiceRow(row: DatabaseInvoiceRow): InvoiceRecord {
  const supplierRow = Array.isArray(row.supplier) ? row.supplier[0] : row.supplier

  return {
    id: row.id,
    tenantId: row.tenant_id,
    supplierId: row.supplier_id ?? null,
    supplier: supplierRow
      ? {
          id: supplierRow.id,
          name: supplierRow.name,
          contactEmail: supplierRow.contact_email ?? null,
          contactPhone: supplierRow.contact_phone ?? null,
          address: supplierRow.address ?? null,
        }
      : null,
    invoiceNumber: row.invoice_number ?? null,
    invoiceDate: row.invoice_date,
    totalAmount: row.total_amount ?? null,
    currency: row.currency ?? 'EUR',
    fileUrl: row.file_url ?? null,
    fileType: row.file_type ?? null,
    ocrStatus: row.ocr_status ?? 'processing',
    notes: row.notes ?? null,
    items:
      row.invoice_items?.map((item) => {
        const ingredientRow = Array.isArray(item.ingredient)
          ? item.ingredient[0]
          : item.ingredient

        return {
          id: item.id,
          invoiceId: item.invoice_id,
          ingredientId: item.ingredient_id ?? null,
          description: item.description,
          quantity: Number(item.quantity),
          unit: item.unit,
          packageSize: item.package_size ?? null,
          packageUnit: item.package_unit ?? null,
          unitPrice: Number(item.unit_price),
          totalPrice: Number(item.total_price),
          ingredient: ingredientRow
            ? {
                id: ingredientRow.id,
                name: ingredientRow.name,
                currentPrice: ingredientRow.current_price ?? null,
                priceUnit: ingredientRow.price_unit ?? null,
                packageSize: ingredientRow.package_size ?? null,
                packageUnit: ingredientRow.package_unit ?? null,
              }
            : null,
        }
      }) ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function useInvoices(options?: { autoLoad?: boolean }) {
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const autoLoad = options?.autoLoad ?? true

  const refreshInvoices = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const tenantId = await resolveTenantId()
      const { data, error: fetchError } = await supabase
        .from('invoices')
        .select(
          `
            id,
            tenant_id,
            supplier_id,
            supplier:suppliers (
              id,
              name,
              contact_email,
              contact_phone,
              address
            ),
            invoice_number,
            invoice_date,
            total_amount,
            currency,
            file_url,
            file_type,
            ocr_status,
            notes,
            invoice_items (
              id,
              invoice_id,
              ingredient_id,
              description,
              quantity,
              unit,
              package_size,
              package_unit,
              unit_price,
              total_price,
              ingredient:ingredients (
                id,
                name,
                current_price,
                price_unit,
                package_size,
                package_unit
              )
            ),
            created_at,
            updated_at
          `
        )
        .eq('tenant_id', tenantId)
        .order('invoice_date', { ascending: false })
        .order('created_at', { ascending: false })

      if (fetchError) {
        throw fetchError
      }

      setInvoices((data as unknown as DatabaseInvoiceRow[] | null)?.map(mapInvoiceRow) ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load invoices')
      setInvoices([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!autoLoad) {
      setLoading(false)
      return
    }

    refreshInvoices()
  }, [autoLoad, refreshInvoices])

  const getInvoiceById = useCallback(async (id: string) => {
    const supabase = createClient()
    const { data, error: fetchError } = await supabase
      .from('invoices')
      .select(
        `
          id,
          tenant_id,
          supplier_id,
          supplier:suppliers (
            id,
            name,
            contact_email,
            contact_phone,
            address
          ),
          invoice_number,
          invoice_date,
          total_amount,
          currency,
          file_url,
          file_type,
          ocr_status,
          notes,
          invoice_items (
            id,
            invoice_id,
            ingredient_id,
            description,
            quantity,
            unit,
            package_size,
            package_unit,
            unit_price,
            total_price,
            ingredient:ingredients (
              id,
              name,
              current_price,
              price_unit,
              package_size,
              package_unit
            )
          ),
          created_at,
          updated_at
        `
      )
      .eq('id', id)
      .maybeSingle()

    if (fetchError) {
      throw fetchError
    }

    return data ? mapInvoiceRow(data as unknown as DatabaseInvoiceRow) : null
  }, [])

  const createInvoiceWithItems = useCallback(
    async (draft: InvoiceDraftInput) => {
      const supabase = createClient()
      const tenantId = await resolveTenantId()
      const normalizedTotal =
        draft.totalAmount ?? draft.items.reduce((sum, item) => sum + item.total, 0)

      const invoicePayload = {
        tenant_id: tenantId,
        supplier_id: draft.supplierId ?? null,
        invoice_number: draft.invoiceNumber ?? null,
        invoice_date: draft.invoiceDate,
        total_amount: normalizedTotal,
        currency: draft.currency ?? 'EUR',
        file_url: draft.fileUrl ?? null,
        file_type: draft.fileType ?? null,
        ocr_status: 'completed' as InvoiceStatus,
        notes: draft.notes ?? null,
        ocr_raw_data: draft.ocrRawData ?? null,
      }

      const itemPayload = draft.items.map((item) => ({
        tenant_id: tenantId,
        ingredient_id: item.ingredientId ?? null,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        package_size: item.packageSize ?? null,
        package_unit: item.packageUnit ?? null,
        unit_price: item.unitPrice,
        total_price: item.total,
      }))

      const rpcResult = await supabase.rpc('create_invoice_with_items', {
        invoice_payload: invoicePayload,
        items_payload: itemPayload,
      })

      if (!rpcResult.error && rpcResult.data) {
        const rpcInvoiceId =
          typeof rpcResult.data === 'object' && rpcResult.data && 'id' in rpcResult.data
            ? (rpcResult.data as { id: string }).id
            : null

        if (rpcInvoiceId) {
          const createdInvoice = await getInvoiceById(rpcInvoiceId)
          return createdInvoice ?? (rpcResult.data as InvoiceRecord)
        }

        return rpcResult.data as InvoiceRecord
      }

      if (rpcResult.error && rpcResult.error.code !== '42883') {
        throw rpcResult.error
      }

      const { data: invoiceRow, error: invoiceError } = await supabase
        .from('invoices')
        .insert(invoicePayload)
        .select(
          `
            id,
            tenant_id,
            supplier_id,
            supplier:suppliers (
              id,
              name,
              contact_email,
              contact_phone,
              address
            ),
            invoice_number,
            invoice_date,
            total_amount,
            currency,
            file_url,
            file_type,
            ocr_status,
            notes,
            invoice_items (
              id,
              invoice_id,
              ingredient_id,
              description,
              quantity,
              unit,
              package_size,
              package_unit,
              unit_price,
              total_price,
              ingredient:ingredients (
                id,
                name,
                current_price,
                price_unit,
                package_size,
                package_unit
              )
            ),
            created_at,
            updated_at
          `
        )
        .single()

      if (invoiceError || !invoiceRow) {
        throw invoiceError ?? new Error('Unable to create invoice')
      }

      if (itemPayload.length > 0) {
        const { error: itemsError } = await supabase.from('invoice_items').insert(
          itemPayload.map((item) => ({
            ...item,
            invoice_id: invoiceRow.id,
          }))
        )

        if (itemsError) {
          await supabase.from('invoice_items').delete().eq('invoice_id', invoiceRow.id)
          await supabase.from('invoices').delete().eq('id', invoiceRow.id)
          throw itemsError
        }
      }

      const createdInvoice = await getInvoiceById(invoiceRow.id)
      return createdInvoice ?? mapInvoiceRow(invoiceRow as unknown as DatabaseInvoiceRow)
    },
    [getInvoiceById]
  )

  const updateInvoice = useCallback(
    async (invoiceId: string, updates: Partial<InvoiceDraftInput>) => {
      const supabase = createClient()
      const { data, error: updateError } = await supabase
        .from('invoices')
        .update({
          supplier_id: updates.supplierId ?? undefined,
          invoice_number: updates.invoiceNumber ?? undefined,
          invoice_date: updates.invoiceDate ?? undefined,
          total_amount: updates.totalAmount ?? undefined,
          currency: updates.currency ?? undefined,
          file_url: updates.fileUrl ?? undefined,
          file_type: updates.fileType ?? undefined,
          notes: updates.notes ?? undefined,
          ocr_raw_data: updates.ocrRawData ?? undefined,
        })
        .eq('id', invoiceId)
        .select()
        .single()

      if (updateError) {
        throw updateError
      }

      return data
    },
    []
  )

  const deleteInvoice = useCallback(async (invoiceId: string) => {
    const supabase = createClient()
    const { error } = await supabase.from('invoices').delete().eq('id', invoiceId)

    if (error) {
      throw error
    }

    setInvoices((current) => current.filter((invoice) => invoice.id !== invoiceId))
  }, [])

  const linkItemToIngredient = useCallback(
    async ({
      invoiceItemId,
      ingredientId,
      price,
      unit,
      invoiceId,
      supplierId,
      invoiceDate,
    }: {
      invoiceItemId: string
      ingredientId: string
      price: number
      unit: string
      invoiceId: string
      supplierId?: string | null
      invoiceDate: string
    }) => {
      const supabase = createClient()
      const tenantId = await resolveTenantId()

      const { error: itemError } = await supabase
        .from('invoice_items')
        .update({ ingredient_id: ingredientId })
        .eq('id', invoiceItemId)

      if (itemError) {
        throw itemError
      }

      const ingredientUpdate = await supabase
        .from('ingredients')
        .update({
          current_price: price,
          price_unit: unit,
          last_purchase_date: invoiceDate,
          last_supplier_id: supplierId ?? null,
        })
        .eq('id', ingredientId)

      if (ingredientUpdate.error) {
        throw ingredientUpdate.error
      }

      const historyInsert = await supabase.from('ingredient_price_history').insert({
        ingredient_id: ingredientId,
        tenant_id: tenantId,
        price,
        unit,
        invoice_id: invoiceId,
        recorded_at: invoiceDate,
      })

      console.log('[useInvoices] price history payload:', {
        ingredient_id: ingredientId,
        tenant_id: tenantId,
        price,
        unit,
        invoice_id: invoiceId,
        recorded_at: invoiceDate,
      })
      console.log(
        '[useInvoices] price history result:',
        historyInsert.data,
        'error:',
        historyInsert.error ? JSON.stringify(historyInsert.error) : 'null'
      )

      if (historyInsert.error) {
        throw historyInsert.error
      }
    },
    []
  )

  return {
    invoices,
    loading,
    error,
    refreshInvoices,
    getInvoiceById,
    createInvoiceWithItems,
    updateInvoice,
    deleteInvoice,
    linkItemToIngredient,
  }
}
