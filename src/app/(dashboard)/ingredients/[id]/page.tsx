'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Save, Trash2 } from 'lucide-react'
import { toast } from '@/lib/toast'
import { createClient } from '@/lib/supabase/client'
import IngredientForm from '@/components/ingredients/IngredientForm'
import PriceHistoryChart, { type PricePoint } from '@/components/ingredients/PriceHistoryChart'
import ConfirmDelete from '@/components/shared/ConfirmDelete'
import type { IngredientRow } from '@/hooks/useIngredients'

function PageSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-9 w-24 rounded-lg bg-slate-200 dark:bg-slate-700" />
        <div className="h-8 flex-1 rounded bg-slate-200 dark:bg-slate-700" />
        <div className="h-9 w-20 rounded-lg bg-slate-200 dark:bg-slate-700" />
        <div className="h-9 w-20 rounded-lg bg-slate-200 dark:bg-slate-700" />
      </div>
      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 rounded-lg bg-slate-200 dark:bg-slate-700" />
          ))}
        </div>
        <div className="h-64 rounded-xl bg-slate-200 dark:bg-slate-700" />
      </div>
    </div>
  )
}

export default function IngredientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const isNew = id === 'new'

  const [ingredient, setIngredient] = useState<IngredientRow | null>(null)
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([])
  const [loading, setLoading] = useState(!isNew)
  const [isSaving, setIsSaving] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  type IngredientDbRow = IngredientRow & {
    price_unit?: string | null
  }

  useEffect(() => {
    if (isNew) return

    const supabase = createClient()
    Promise.all([
      supabase
        .from('ingredients')
        .select('*, supplier:suppliers!last_supplier_id(name)')
        .eq('id', id)
        .single(),
      supabase
        .from('ingredient_price_history')
        .select('*')
        .eq('ingredient_id', id)
        .order('effective_date'),
    ]).then(([ingRes, histRes]) => {
      if (ingRes.error) {
        toast.error('Ingredient not found')
        router.replace('/ingredients')
        return
      }
      setIngredient({
        ...(ingRes.data as IngredientDbRow),
        base_unit: (ingRes.data as IngredientDbRow).price_unit ?? 'unit',
      } as IngredientRow)
      setPriceHistory((histRes.data ?? []) as PricePoint[])
      setLoading(false)
    })
  }, [id, isNew, router])

  const handleDelete = async () => {
    if (!ingredient) return
    setDeleting(true)
    const supabase = createClient()
    const { error } = await supabase.from('ingredients').delete().eq('id', ingredient.id)
    if (error) {
      toast.error(error.message)
      setDeleting(false)
    } else {
      toast.success(`"${ingredient.name}" deleted`)
      router.push('/ingredients')
    }
  }

  if (loading) return <PageSkeleton />

  const pageTitle = isNew ? 'New Ingredient' : (ingredient?.name ?? 'Ingredient')

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => router.push('/ingredients')}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        <h1 className="font-display flex-1 truncate text-xl font-bold text-slate-900 dark:text-white">
          {pageTitle}
        </h1>

        <button
          form="ingredient-form"
          type="submit"
          disabled={isSaving}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {isSaving ? 'Saving…' : 'Save'}
        </button>

        {!isNew && ingredient && (
          <button
            onClick={() => setDeleteOpen(true)}
            className="flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        )}
      </div>

      {/* Main layout */}
      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        {/* Left: form */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
          <IngredientForm
            ingredient={ingredient}
            onSubmittingChange={setIsSaving}
            onSaved={(updated) => setIngredient(updated)}
          />
        </div>

        {/* Right: price history */}
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
            <h2 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">
              Price History
            </h2>
            <PriceHistoryChart
              priceHistory={priceHistory}
              unit={ingredient?.base_unit ?? 'unit'}
            />
          </div>

          {!isNew && ingredient && (
            <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
              <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">
                Details
              </h2>
              <dl className="space-y-2 text-sm">
                {ingredient.package_size && (
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Package size</dt>
                    <dd className="font-medium text-slate-900 dark:text-white">
                      {ingredient.package_size} {ingredient.package_unit}
                    </dd>
                  </div>
                )}
                {ingredient.supplier?.name && (
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Supplier</dt>
                    <dd className="font-medium text-slate-900 dark:text-white">
                      {ingredient.supplier.name}
                    </dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-slate-500">Price entries</dt>
                  <dd className="font-medium text-slate-900 dark:text-white">
                    {priceHistory.length}
                  </dd>
                </div>
              </dl>
            </div>
          )}
        </div>
      </div>

      {/* Delete modal */}
      <ConfirmDelete
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        itemName={ingredient?.name ?? ''}
        loading={deleting}
      />
    </div>
  )
}
