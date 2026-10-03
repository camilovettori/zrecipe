import type { createClient } from '@/lib/supabase/client'

type BrowserSupabase = ReturnType<typeof createClient>

export type SupplierCodeLinkResult = 'saved' | 'skipped' | 'duplicate' | 'failed'

/**
 * Links a supplier's product code to an ingredient that was just created
 * manually (IngredientForm's /ingredients/new, NewIngredientModal). A
 * (supplier, code) pair is a definitive match for future invoices — see
 * migration 20260803100000_add_ingredient_supplier_codes.sql.
 *
 * A plain insert, same as the ingredient page's "Supplier codes" panel — not
 * the invoice route's upsert: a code typed by hand that already belongs to
 * another ingredient must not silently move off it. That case comes back as
 * 'duplicate' and the existing mapping stays as it is.
 *
 * Best-effort: never throws, so a failure here can't fail an ingredient that
 * was already created. Callers report the outcome with supplierCodeLinkNotice.
 */
export async function linkSupplierCodeToNewIngredient(
  supabase: BrowserSupabase,
  args: { tenantId: string; supplierId: string | null; ingredientId: string; productCode: string | null | undefined }
): Promise<SupplierCodeLinkResult> {
  const productCode = args.productCode?.trim() ?? ''
  // supplier_id is NOT NULL on ingredient_supplier_codes — a code only means
  // something for a specific supplier.
  if (!productCode || !args.supplierId) return 'skipped'

  try {
    const { error } = await supabase.from('ingredient_supplier_codes').insert({
      tenant_id: args.tenantId,
      supplier_id: args.supplierId,
      ingredient_id: args.ingredientId,
      product_code: productCode,
    })
    if (!error) return 'saved'
    if (error.code === '23505') return 'duplicate'
    console.error('[linkSupplierCodeToNewIngredient] insert failed:', error)
    return 'failed'
  } catch (err) {
    console.error('[linkSupplierCodeToNewIngredient] insert failed:', err)
    return 'failed'
  }
}

/** Toast copy for an outcome the user needs to know about; null when there's nothing to say. */
export function supplierCodeLinkNotice(
  result: SupplierCodeLinkResult,
  productCode: string
): { title: string; description: string } | null {
  const code = productCode.trim()
  if (result === 'duplicate') {
    return {
      title: `Product code "${code}" was not linked`,
      description: 'This supplier already has that code linked to another ingredient. The ingredient was created without it.',
    }
  }
  if (result === 'failed') {
    return {
      title: `Product code "${code}" could not be saved`,
      description: 'The ingredient was created. You can add the code from its Supplier codes panel.',
    }
  }
  return null
}
