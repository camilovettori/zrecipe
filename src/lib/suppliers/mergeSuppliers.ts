import { createClient } from '@/lib/supabase/client'

export interface MergeSuppliersOptions {
  keeperId: string
  loserId: string
}

export interface MergeSuppliersResult {
  ok: boolean
  invoicesMoved: number
  ingredientSupplierMoved: number
  ingredientLastSupplierMoved: number
  supplierCodesInserted: number
  invoiceMemoryUpserted: number
  error?: string
}

export async function mergeSuppliers(opts: MergeSuppliersOptions): Promise<MergeSuppliersResult> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('merge_suppliers', {
    keeper_id: opts.keeperId,
    loser_id: opts.loserId,
  })

  if (error) {
    return {
      ok: false,
      invoicesMoved: 0,
      ingredientSupplierMoved: 0,
      ingredientLastSupplierMoved: 0,
      supplierCodesInserted: 0,
      invoiceMemoryUpserted: 0,
      error: error.message,
    }
  }

  const result = data as {
    invoices_moved?: number
    ingredient_supplier_moved?: number
    ingredient_last_supplier_moved?: number
    supplier_codes_inserted?: number
    invoice_memory_upserted?: number
  } | null

  return {
    ok: true,
    invoicesMoved: result?.invoices_moved ?? 0,
    ingredientSupplierMoved: result?.ingredient_supplier_moved ?? 0,
    ingredientLastSupplierMoved: result?.ingredient_last_supplier_moved ?? 0,
    supplierCodesInserted: result?.supplier_codes_inserted ?? 0,
    invoiceMemoryUpserted: result?.invoice_memory_upserted ?? 0,
  }
}
