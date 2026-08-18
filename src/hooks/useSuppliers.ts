'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { resolveTenantId } from '@/hooks/useTenant'
import { mergeSuppliers } from '@/lib/suppliers/mergeSuppliers'

export interface SupplierRecord {
  id: string
  tenantId: string
  name: string
  email?: string | null
  phone?: string | null
  address?: string | null
  notes?: string | null
  quantityInThousands: boolean
  invoiceCount: number
  lastInvoiceDate?: string | null
  createdAt: string
  updatedAt: string
}

type SupplierRow = {
  id: string
  tenant_id: string
  name: string
  contact_email?: string | null
  contact_phone?: string | null
  address?: string | null
  notes?: string | null
  quantity_in_thousands?: boolean | null
  created_at: string
  updated_at: string
}

type InvoiceSupplierRow = {
  supplier_id?: string | null
  invoice_date: string
}

function mapSupplierRow(row: SupplierRow, invoices: InvoiceSupplierRow[]) {
  const supplierInvoices = invoices.filter((invoice) => invoice.supplier_id === row.id)
  const lastInvoiceDate = supplierInvoices
    .map((invoice) => invoice.invoice_date)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]

  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    email: row.contact_email ?? null,
    phone: row.contact_phone ?? null,
    address: row.address ?? null,
    notes: row.notes ?? null,
    quantityInThousands: row.quantity_in_thousands ?? false,
    invoiceCount: supplierInvoices.length,
    lastInvoiceDate: lastInvoiceDate ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  } satisfies SupplierRecord
}

export function useSuppliers(options?: { autoLoad?: boolean }) {
  const autoLoad = options?.autoLoad ?? true
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refreshSuppliers = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const tenantId = await resolveTenantId()

      const [{ data: supplierRows, error: supplierError }, { data: invoiceRows, error: invoiceError }] =
        await Promise.all([
          supabase
            .from('suppliers')
            .select('id, tenant_id, name, contact_email, contact_phone, address, notes, quantity_in_thousands, created_at, updated_at')
            .eq('tenant_id', tenantId)
            .order('name', { ascending: true }),
          supabase.from('invoices').select('supplier_id, invoice_date').eq('tenant_id', tenantId),
        ])

      if (supplierError) throw supplierError
      if (invoiceError) throw invoiceError

      const suppliersData = (supplierRows as unknown as SupplierRow[] | null) ?? []
      const invoicesData = (invoiceRows as unknown as InvoiceSupplierRow[] | null) ?? []

      setSuppliers(suppliersData.map((row) => mapSupplierRow(row, invoicesData)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load suppliers')
      setSuppliers([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!autoLoad) {
      setLoading(false)
      return
    }

    refreshSuppliers()
  }, [autoLoad, refreshSuppliers])

  const createSupplier = useCallback(
    async (input: {
      name: string
      email?: string | null
      phone?: string | null
      address?: string | null
      notes?: string | null
      quantityInThousands?: boolean
    }) => {
      const supabase = createClient()
      const tenantId = await resolveTenantId()
      const { data, error: createError } = await supabase
        .from('suppliers')
        .insert({
          tenant_id: tenantId,
          name: input.name,
          contact_email: input.email ?? null,
          contact_phone: input.phone ?? null,
          address: input.address ?? null,
          notes: input.notes ?? null,
          quantity_in_thousands: input.quantityInThousands ?? false,
        })
        .select('id, tenant_id, name, contact_email, contact_phone, address, notes, quantity_in_thousands, created_at, updated_at')
        .single()

      if (createError || !data) {
        throw createError ?? new Error('Unable to create supplier')
      }

      await refreshSuppliers()
      return mapSupplierRow(data as SupplierRow, [])
    },
    [refreshSuppliers]
  )

  const updateSupplier = useCallback(
    async (
      supplierId: string,
      input: {
        name: string
        email?: string | null
        phone?: string | null
        address?: string | null
        notes?: string | null
        quantityInThousands?: boolean
      }
    ) => {
      const supabase = createClient()
      const { data, error: updateError } = await supabase
        .from('suppliers')
        .update({
          name: input.name,
          contact_email: input.email ?? null,
          contact_phone: input.phone ?? null,
          address: input.address ?? null,
          notes: input.notes ?? null,
          quantity_in_thousands: input.quantityInThousands ?? false,
        })
        .eq('id', supplierId)
        .select('id, tenant_id, name, contact_email, contact_phone, address, notes, quantity_in_thousands, created_at, updated_at')
        .single()

      if (updateError || !data) {
        throw updateError ?? new Error('Unable to update supplier')
      }

      await refreshSuppliers()
      return data as SupplierRow
    },
    [refreshSuppliers]
  )

  const deleteSupplier = useCallback(
    async (supplierId: string, supplierName?: string) => {
      const supabase = createClient()
      const tenantId = await resolveTenantId()

      const [
        { count: invoiceCount, error: invoiceError },
        { count: ingredientSupplierCount, error: ingredientSupplierError },
        { count: ingredientLastCount, error: ingredientLastError },
        { count: codeCount, error: codeError },
        { count: memoryCount, error: memoryError },
      ] = await Promise.all([
        supabase
          .from('invoices')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('supplier_id', supplierId),
        supabase
          .from('ingredients')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('supplier_id', supplierId),
        supabase
          .from('ingredients')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('last_supplier_id', supplierId),
        supabase
          .from('ingredient_supplier_codes')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('supplier_id', supplierId),
        supabase
          .from('invoice_item_memory')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('supplier_id', supplierId),
      ])

      const preflightError =
        invoiceError ?? ingredientSupplierError ?? ingredientLastError ?? codeError ?? memoryError

      if (preflightError) {
        throw preflightError
      }

      const totalLinks =
        (invoiceCount ?? 0) +
        (ingredientSupplierCount ?? 0) +
        (ingredientLastCount ?? 0) +
        (codeCount ?? 0) +
        (memoryCount ?? 0)

      if (totalLinks > 0) {
        const label = supplierName ? `“${supplierName}”` : 'This supplier'
        throw new Error(
          `${label} is still linked to ${totalLinks} record${totalLinks !== 1 ? 's' : ''}. Remove those links first, then delete the supplier.`
        )
      }

      const { error: deleteError } = await supabase
        .from('suppliers')
        .delete()
        .eq('tenant_id', tenantId)
        .eq('id', supplierId)

      if (deleteError) {
        if (deleteError.code === '23503') {
          throw new Error(
            supplierName
              ? `“${supplierName}” is still linked to another record. Remove the link first, then try again.`
              : 'This supplier is still linked to another record. Remove the link first, then try again.'
          )
        }
        throw deleteError
      }

      setSuppliers((current) => current.filter((supplier) => supplier.id !== supplierId))
    },
    []
  )

  const mergeSupplier = useCallback(
    async (keeperId: string, loserId: string) => {
      const result = await mergeSuppliers({ keeperId, loserId })

      if (!result.ok) {
        throw new Error(result.error ?? 'Unable to merge supplier')
      }

      await refreshSuppliers()
      return result
    },
    [refreshSuppliers]
  )

  return {
    suppliers,
    loading,
    error,
    refreshSuppliers,
    createSupplier,
    updateSupplier,
    deleteSupplier,
    mergeSupplier,
  }
}
