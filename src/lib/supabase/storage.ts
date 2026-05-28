import { createClient } from '@/lib/supabase/client'

export async function uploadInvoiceFile(tenantId: string, file: File, invoiceId = crypto.randomUUID()) {
  const supabase = createClient()
  const safeName = file.name.replace(/\s+/g, '-')
  const path = `${tenantId}/${invoiceId}/${safeName}`

  const { error } = await supabase.storage.from('invoices').upload(path, file, {
    cacheControl: '3600',
    upsert: true,
    contentType: file.type || undefined,
  })

  if (error) {
    throw error
  }

  const { data } = supabase.storage.from('invoices').getPublicUrl(path)
  return {
    publicUrl: data.publicUrl,
    path,
    invoiceId,
  }
}
