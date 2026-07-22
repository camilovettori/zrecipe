'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import InvoiceEditor, { DescriptionCombobox } from '@/components/invoices/InvoiceEditor'
import {
  INVOICE_UNITS,
  PACKAGE_UNIT_OPTIONS,
  normalizeText,
  scoreIngredientMatch,
  type InvoiceFormState,
  type InvoiceLineItem,
} from '@/lib/invoices'
import type { ExtractedInvoiceItem } from '@/lib/invoices-client'
import type { IngredientLookup, SupplierLookup } from '@/hooks/useInvoices'
import { cn } from '@/lib/utils'
import { CustomSelect } from '@/components/ui/CustomSelect'

export type InvoiceFileKind = 'pdf' | 'csv' | 'image'

export type BulkInvoiceDraft = {
  id: string
  fileName: string
  file: File | null
  fileKind: InvoiceFileKind
  meta: InvoiceFormState
  items: ExtractedInvoiceItem[]
  extractionError?: string
}

type IngredientMatch =
  | { type: 'existing'; id: string; name: string }
  | { type: 'create'; name: string }

export type GroupOccurrence = {
  id: string
  draftId: string
  fileName: string
  invoiceDate: string
  brand: string
  price: number
  quantity: number
  unit: string
  skip: boolean
}

export type ConsolidatedGroup = {
  id: string
  name: string
  unit: string
  packageSize: number | null
  packageUnit: string | null
  category: string
  ingredientMatch: IngredientMatch
  skip: boolean
  occurrences: GroupOccurrence[]
}

function buildInitialGroups(
  drafts: BulkInvoiceDraft[],
  ingredients: IngredientLookup[]
): ConsolidatedGroup[] {
  const groups: ConsolidatedGroup[] = []
  const groupByNormalizedName = new Map<string, ConsolidatedGroup>()

  for (const draft of drafts) {
    for (const item of draft.items) {
      if (!item.description.trim()) continue
      const normalized = normalizeText(item.description)
      let group = groupByNormalizedName.get(normalized)

      if (!group) {
        const best = ingredients
          .map((ing) => ({ ing, score: scoreIngredientMatch(item.description, ing.name) }))
          .filter(({ score }) => score >= 70)
          .sort((a, b) => b.score - a.score)[0]?.ing

        group = {
          id: crypto.randomUUID(),
          name: item.description.trim(),
          unit: item.unit || 'unit',
          packageSize: item.packageSize ?? null,
          packageUnit: item.packageUnit ?? 'kg',
          category: 'Other',
          ingredientMatch: best
            ? { type: 'existing', id: best.id, name: best.name }
            : { type: 'create', name: item.description.trim() },
          skip: false,
          occurrences: [],
        }
        groups.push(group)
        groupByNormalizedName.set(normalized, group)
      }

      group.occurrences.push({
        id: crypto.randomUUID(),
        draftId: draft.id,
        fileName: draft.fileName,
        invoiceDate: draft.meta.invoiceDate,
        brand: item.brand?.trim() || '',
        price: item.unitPrice,
        quantity: item.quantity,
        unit: item.unit,
        skip: false,
      })
    }
  }

  return groups
}

type Props = {
  drafts: BulkInvoiceDraft[]
  onUpdateDraftMeta: (draftId: string, meta: InvoiceFormState) => void
  suppliers: SupplierLookup[]
  ingredients: IngredientLookup[]
  onBack: () => void
  onConfirm: (drafts: BulkInvoiceDraft[], groups: ConsolidatedGroup[]) => void
  saving: boolean
  saveStatus?: { index: number; total: number; failures: Array<{ fileName: string; error: string }> } | null
}

export default function BulkInvoiceReview({
  drafts,
  onUpdateDraftMeta,
  suppliers,
  ingredients,
  onBack,
  onConfirm,
  saving,
  saveStatus,
}: Props) {
  const [groups, setGroups] = useState<ConsolidatedGroup[]>(() => buildInitialGroups(drafts, ingredients))
  const [invoicesExpanded, setInvoicesExpanded] = useState(false)

  const updateGroup = (groupId: string, patch: Partial<ConsolidatedGroup>) => {
    setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, ...patch } : g)))
  }

  const updateOccurrence = (groupId: string, occId: string, patch: Partial<GroupOccurrence>) => {
    setGroups((prev) =>
      prev.map((g) =>
        g.id !== groupId
          ? g
          : { ...g, occurrences: g.occurrences.map((o) => (o.id === occId ? { ...o, ...patch } : o)) }
      )
    )
  }

  const moveOccurrence = (fromGroupId: string, occId: string, destination: string) => {
    setGroups((prev) => {
      const fromGroup = prev.find((g) => g.id === fromGroupId)
      const occ = fromGroup?.occurrences.find((o) => o.id === occId)
      if (!fromGroup || !occ) return prev

      let next = prev.map((g) =>
        g.id === fromGroupId ? { ...g, occurrences: g.occurrences.filter((o) => o.id !== occId) } : g
      )

      if (destination === 'new') {
        next = [
          ...next,
          {
            id: crypto.randomUUID(),
            name: occ.fileName.replace(/\.[^.]+$/, ''),
            unit: occ.unit || 'unit',
            packageSize: null,
            packageUnit: 'kg',
            category: 'Other',
            ingredientMatch: { type: 'create', name: occ.fileName.replace(/\.[^.]+$/, '') },
            skip: false,
            occurrences: [occ],
          },
        ]
      } else {
        next = next.map((g) => (g.id === destination ? { ...g, occurrences: [...g.occurrences, occ] } : g))
      }

      return next.filter((g) => g.occurrences.length > 0)
    })
  }

  const activeGroups = groups.filter((g) => !g.skip)
  const totalOccurrences = groups.reduce((sum, g) => sum + g.occurrences.length, 0)
  const invoiceCount = drafts.length

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
            Bulk import
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold text-slate-900">
            Review &amp; match ingredients
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            {invoiceCount} invoice{invoiceCount === 1 ? '' : 's'} processed into {groups.length} ingredient
            {groups.length === 1 ? '' : 's'}
            {totalOccurrences !== groups.length ? ` from ${totalOccurrences} line items` : ''}. Nothing is
            saved until you confirm.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={onBack}
            disabled={saving}
            className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => onConfirm(drafts, groups)}
            disabled={saving || activeGroups.length === 0}
            className="inline-flex items-center justify-center rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving
              ? saveStatus
                ? `Saving ${saveStatus.index} of ${saveStatus.total}…`
                : 'Saving…'
              : `Confirm & save ${invoiceCount} invoice${invoiceCount === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>

      {saveStatus && saveStatus.failures.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-semibold">{saveStatus.failures.length} invoice(s) failed to save:</p>
          <ul className="mt-1 list-disc pl-5">
            {saveStatus.failures.map((f) => (
              <li key={f.fileName}>
                {f.fileName}: {f.error}
              </li>
            ))}
          </ul>
        </div>
      )}

      <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setInvoicesExpanded((v) => !v)}
          className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
        >
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900">
              Source invoices ({invoiceCount})
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Supplier, invoice number, date &amp; total per file — edit if needed.
            </p>
          </div>
          {invoicesExpanded ? (
            <ChevronDown className="h-5 w-5 shrink-0 text-slate-400" />
          ) : (
            <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
          )}
        </button>
        {invoicesExpanded && (
          <div className="space-y-4 border-t border-slate-100 px-5 py-4">
            {drafts.map((draft) => (
              <div key={draft.id} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {draft.fileName}
                </p>
                {draft.extractionError ? (
                  <p className="text-sm text-rose-600">{draft.extractionError}</p>
                ) : (
                  <InvoiceEditor
                    title=""
                    draft={draft.meta}
                    onChange={(next) => onUpdateDraftMeta(draft.id, next)}
                    suppliers={suppliers}
                    ingredients={ingredients}
                    onSave={() => {}}
                    onBack={() => {}}
                    showHeader={false}
                    showItemsTable={false}
                    className="space-y-0"
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        {groups.map((group) => {
          const latestOccurrence = [...group.occurrences]
            .filter((o) => !o.skip)
            .sort((a, b) => new Date(b.invoiceDate).getTime() - new Date(a.invoiceDate).getTime())[0]

          const comboboxItem: InvoiceLineItem = {
            id: group.id,
            description: group.name,
            quantity: 1,
            unit: group.unit,
            packageSize: group.packageSize,
            packageUnit: group.packageUnit,
            unitPrice: 0,
            total: 0,
            ingredientId: group.ingredientMatch.type === 'existing' ? group.ingredientMatch.id : null,
            ingredientMatch: group.ingredientMatch,
            ingredientQuery: group.name,
            createIngredient: group.ingredientMatch.type === 'create',
            newIngredientName: group.ingredientMatch.type === 'create' ? group.name : '',
            newIngredientCategory: group.category,
            newIngredientUnit: group.unit,
          }

          return (
            <div
              key={group.id}
              className={cn(
                'rounded-3xl border bg-white p-5 shadow-sm transition',
                group.skip ? 'border-slate-100 opacity-50' : 'border-slate-200'
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-[260px] flex-1 space-y-2">
                  <DescriptionCombobox
                    item={comboboxItem}
                    ingredients={ingredients}
                    onUpdate={(patch) =>
                      updateGroup(group.id, {
                        name: patch.description ?? group.name,
                        ingredientMatch:
                          patch.ingredientMatch !== undefined
                            ? (patch.ingredientMatch ?? { type: 'create', name: patch.description ?? group.name })
                            : group.ingredientMatch,
                      })
                    }
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <CustomSelect
                      value={group.unit}
                      onChange={(v) => updateGroup(group.id, { unit: v })}
                      options={INVOICE_UNITS.map((u) => ({ value: u, label: u }))}
                      size="sm"
                      className="w-24"
                    />
                    <input
                      type="number"
                      step="0.001"
                      value={group.packageSize ?? ''}
                      onChange={(e) =>
                        updateGroup(group.id, {
                          packageSize: e.target.value === '' ? null : Number.parseFloat(e.target.value),
                        })
                      }
                      placeholder="Pkg size"
                      className="h-9 w-20 rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
                    />
                    <CustomSelect
                      value={group.packageUnit ?? 'kg'}
                      onChange={(v) => updateGroup(group.id, { packageUnit: v })}
                      options={PACKAGE_UNIT_OPTIONS.map((u) => ({ value: u, label: u }))}
                      size="sm"
                      className="w-20"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {latestOccurrence && (
                    <div className="text-right">
                      <p className="text-xs uppercase tracking-wide text-slate-400">Current price</p>
                      <p className="font-semibold text-slate-900">
                        {'€'}
                        {latestOccurrence.price.toFixed(2)} / {group.unit}
                      </p>
                      <p className="text-xs text-slate-400">from {latestOccurrence.invoiceDate}</p>
                    </div>
                  )}
                  <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                    <input
                      type="checkbox"
                      checked={group.skip}
                      onChange={(e) => updateGroup(group.id, { skip: e.target.checked })}
                    />
                    Skip
                  </label>
                </div>
              </div>

              <div className="mt-4 space-y-1.5">
                {group.occurrences.map((occ) => (
                  <div
                    key={occ.id}
                    className={cn(
                      'flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm',
                      occ.skip && 'opacity-50'
                    )}
                  >
                    <span className="w-32 shrink-0 truncate text-xs text-slate-400" title={occ.fileName}>
                      {occ.fileName}
                    </span>
                    <input
                      type="date"
                      value={occ.invoiceDate}
                      onChange={(e) => updateOccurrence(group.id, occ.id, { invoiceDate: e.target.value })}
                      className="h-8 w-36 rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
                    />
                    <input
                      type="text"
                      value={occ.brand}
                      onChange={(e) => updateOccurrence(group.id, occ.id, { brand: e.target.value })}
                      placeholder="Brand"
                      className="h-8 w-28 rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
                    />
                    <input
                      type="number"
                      step="0.01"
                      value={occ.price}
                      onChange={(e) =>
                        updateOccurrence(group.id, occ.id, { price: Number.parseFloat(e.target.value || '0') })
                      }
                      className="h-8 w-24 rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
                    />
                    <CustomSelect
                      value="move"
                      onChange={(v) => {
                        if (v !== 'move') moveOccurrence(group.id, occ.id, v)
                      }}
                      options={[
                        { value: 'move', label: 'Move to…' },
                        ...groups.filter((g) => g.id !== group.id).map((g) => ({ value: g.id, label: g.name })),
                        { value: 'new', label: '+ New ingredient' },
                      ]}
                      size="sm"
                      className="w-36"
                    />
                    <label className="ml-auto flex items-center gap-1 text-xs text-slate-400">
                      <input
                        type="checkbox"
                        checked={occ.skip}
                        onChange={(e) => updateOccurrence(group.id, occ.id, { skip: e.target.checked })}
                      />
                      Skip
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </section>
    </div>
  )
}
