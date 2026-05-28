'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { resolveTenantId } from '@/hooks/useTenant'
import { toast } from '@/lib/toast'
import InvoiceEditor from '@/components/invoices/InvoiceEditor'
import {
  createEmptyInvoiceItem,
  type InvoiceFormState,
  recalculateInvoiceTotals,
} from '@/lib/invoices'
import type { IngredientLookup, SupplierLookup } from '@/hooks/useInvoices'

function createInitialDraft(): InvoiceFormState {
  return {
    supplierName: '',
    supplierId: null,
    supplierMatch: null,
    invoiceNumber: '',
    invoiceDate: new Date().toISOString().slice(0, 10),
    currency: 'EUR',
    notes: '',
    totalAmount: 0,
    subtotalAmount: null,
    vatAmount: null,
    vatRate: null,
    fileUrl: null,
    fileType: null,
    items: [createEmptyInvoiceItem()],
  }
}

export default function NewInvoicePage() {
  const router = useRouter()
  const [draft, setDraft] = useState<InvoiceFormState>(createInitialDraft)
  const [suppliers, setSuppliers] = useState<SupplierLookup[]>([])
  const [ingredients, setIngredients] = useState<IngredientLookup[]>([])
  const [loadingLookups, setLoadingLookups] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const loadLookups = async () => {
      try {
        const supabase = createClient()
        const tenantId = await resolveTenantId()
        const [supplierResult, ingredientResult] = await Promise.all([
          supabase
            .from('suppliers')
            .select('id, name, contact_email, contact_phone, address')
            .eq('tenant_id', tenantId)
            .order('name', { ascending: true }),
          supabase
            .from('ingredients')
            .select('id, name, current_price, price_unit')
            .eq('tenant_id', tenantId)
            .order('name', { ascending: true }),
        ])

        setSuppliers(
          (supplierResult.data ?? []).map((item) => ({
            id: item.id,
            name: item.name,
            contactEmail: item.contact_email ?? null,
            contactPhone: item.contact_phone ?? null,
            address: item.address ?? null,
          }))
        )
        setIngredients(
          (ingredientResult.data ?? []).map((item) => ({
            id: item.id,
            name: item.name,
            currentPrice: item.current_price ?? null,
            priceUnit: item.price_unit ?? null,
          }))
        )
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Unable to load invoice lookups')
      } finally {
        setLoadingLookups(false)
      }
    }

    loadLookups()
  }, [])

  const handleSave = async () => {
    try {
      setSaving(true)
      const totals = recalculateInvoiceTotals(draft.items, draft.totalAmount)
      const response = await fetch('/api/invoices/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: crypto.randomUUID(),
          supplier_name: draft.supplierName,
          supplier_id: draft.supplierId,
          supplier_match: draft.supplierMatch ?? null,
          invoice_number: draft.invoiceNumber,
          invoice_date: draft.invoiceDate,
          currency: draft.currency,
          notes: draft.notes,
          total_amount: totals.totalAmount,
          file_url: draft.fileUrl,
          file_type: draft.fileType,
          items: draft.items,
        }),
      })

      const payload = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to save invoice')
      }

      toast.success('Invoice saved')
      router.push('/invoices?success=1')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save invoice')
    } finally {
      setSaving(false)
    }
  }

  if (loadingLookups) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="h-8 w-48 animate-pulse rounded-full bg-slate-100" />
        <div className="mt-6 h-[42rem] animate-pulse rounded-3xl bg-slate-100" />
      </div>
    )
  }

  return (
    <InvoiceEditor
      title="New Invoice"
      subtitle="Create an invoice manually, attach items, and let the system update ingredient pricing for matched rows."
      draft={draft}
      onChange={(next) => setDraft(next)}
      suppliers={suppliers}
      ingredients={ingredients}
      onSave={handleSave}
      onBack={() => router.push('/invoices')}
      saving={saving}
      saveLabel="Save Invoice"
      showSummary
    />
  )
}
