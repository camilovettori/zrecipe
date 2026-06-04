'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from '@/lib/toast'
import { createClient } from '@/lib/supabase/client'
import { resolveTenantId } from '@/hooks/useTenant'
import { cn } from '@/lib/utils'
import type { IngredientRow } from '@/hooks/useIngredients'
import { CustomSelect } from '@/components/ui/CustomSelect'

export const CATEGORIES = [
  'Dairy',
  'Flour',
  'Sugar',
  'Spice',
  'Meat',
  'Vegetable',
  'Fruit',
  'Other',
]

export const UNITS = [
  'kg',
  'g',
  'lb',
  'oz',
  'L',
  'ml',
  'cup',
  'tbsp',
  'tsp',
  'unit',
  'dozen',
  'pack',
]

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  brand: z.string().optional(),
  category: z.string().min(1, 'Category is required'),
  current_price: z.number().positive('Must be positive').optional(),
  base_unit: z.string().min(1, 'Unit is required'),
  package_size: z.number().positive().optional(),
  package_unit: z.string().optional(),
  notes: z.string().optional(),
})

type FormData = z.infer<typeof schema>

export type AutoSaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

const field =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800/60 dark:text-white dark:placeholder-slate-500'

const label = 'mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300'

interface IngredientFormProps {
  ingredient: IngredientRow | null
  onSubmittingChange?: (submitting: boolean) => void
  onSaved?: (ingredient: IngredientRow) => void
  onAutoSaveStatus?: (status: AutoSaveStatus) => void
}

type IngredientDbRow = {
  id: string
  name: string
  category: string | null
  current_price: number | null
  price_unit?: string | null
  package_size: number | null
  package_unit: string | null
  notes: string | null
  image_url: string | null
  supplier_id: string | null
  supplier: { name: string } | null
  created_at: string
  updated_at: string
}

// Serialize FormData to a stable string for dirty-state comparison.
function serialize(d: Partial<FormData>): string {
  return JSON.stringify({
    name: d.name ?? '',
    brand: d.brand ?? '',
    category: d.category ?? '',
    current_price: d.current_price ?? null,
    base_unit: d.base_unit ?? '',
    package_size: d.package_size ?? null,
    package_unit: d.package_unit ?? '',
    notes: d.notes ?? '',
  })
}

export default function IngredientForm({
  ingredient,
  onSubmittingChange,
  onSaved,
  onAutoSaveStatus,
}: IngredientFormProps) {
  const router = useRouter()
  const isExisting = !!ingredient?.id

  const defaultValues: FormData = {
    name: ingredient?.name ?? '',
    brand: ingredient?.brand ?? '',
    category: ingredient?.category ?? '',
    current_price: ingredient?.current_price ?? undefined,
    base_unit: ingredient?.base_unit ?? 'kg',
    package_size: ingredient?.package_size ?? undefined,
    package_unit: ingredient?.package_unit ?? '',
    notes: ingredient?.notes ?? '',
  }

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues,
  })

  // Tracks the form values as seen at the last successful save.
  const lastSavedRef = useRef<FormData>(defaultValues)

  // Watch all fields — triggers re-render (and re-runs the debounce effect) on any change.
  const watched = useWatch({ control }) as FormData
  const categoryValue = (watched.category ?? '') as string
  const baseUnitValue = (watched.base_unit ?? '') as string
  const packageUnitValue = (watched.package_unit ?? '') as string

  // ── Core save function ────────────────────────────────────────────────────
  // silent=true: used by autosave (no toast, reports status via onAutoSaveStatus)
  // silent=false: used by manual Save button (shows toast)
  const performSave = useCallback(async (data: FormData, silent: boolean) => {
    onSubmittingChange?.(true)
    if (silent) onAutoSaveStatus?.('saving')

    const supabase = createClient()
    const payload = {
      name: data.name,
      brand: data.brand?.trim() || null,
      category: data.category,
      current_price: data.current_price ?? null,
      price_unit: data.base_unit,
      package_size: data.package_size ?? null,
      package_unit: data.package_unit ?? null,
      notes: data.notes ?? null,
    }

    try {
      if (ingredient) {
        const priceChanged =
          data.current_price != null &&
          data.current_price !== ingredient.current_price

        const { data: row, error } = await supabase
          .from('ingredients')
          .update(payload)
          .eq('id', ingredient.id)
          .select()
          .single()
        if (error) throw error

        if (!silent) toast.success('Ingredient updated')

        const savedRow = row as IngredientDbRow

        if (priceChanged && data.current_price != null) {
          // Only insert a price_history entry when the price actually changed
          // vs the last save (prevents duplicates on non-price autosaves).
          const lastSavedPrice = lastSavedRef.current.current_price ?? null
          if (data.current_price !== lastSavedPrice) {
            try {
              const tenantId = await resolveTenantId()
              const historyPayload = {
                ingredient_id: ingredient.id,
                tenant_id: tenantId,
                price: data.current_price,
                unit: data.base_unit,
                recorded_at: new Date().toISOString().slice(0, 10),
              }
              await supabase.from('ingredient_price_history').insert(historyPayload)
            } catch {
              // Best-effort — never blocks the ingredient save
            }
          }
        }

        lastSavedRef.current = { ...data }
        onAutoSaveStatus?.('saved')
        onSaved?.({
          ...savedRow,
          base_unit: savedRow.price_unit ?? data.base_unit,
        } as IngredientRow)
      } else {
        // New ingredient — should never be called via autosave (guarded by isExisting),
        // but keep the create path for manual Save on /ingredients/new.
        const tenantId = await resolveTenantId()
        const { data: row, error } = await supabase
          .from('ingredients')
          .insert({ ...payload, tenant_id: tenantId })
          .select()
          .single()
        if (error) throw error

        const newId = (row as IngredientDbRow).id
        toast.success('Ingredient created')

        if (data.current_price != null && data.current_price > 0) {
          try {
            const historyPayload = {
              ingredient_id: newId,
              tenant_id: tenantId,
              price: data.current_price,
              unit: data.base_unit,
              recorded_at: new Date().toISOString().slice(0, 10),
            }
            await supabase.from('ingredient_price_history').insert(historyPayload)
          } catch (e) {
            console.warn('[ingredient] price history insert failed:', e)
          }
        }

        router.push(`/ingredients/${newId}`)
      }
    } catch (err: unknown) {
      if (!silent) toast.error(err instanceof Error ? err.message : 'Unable to save ingredient')
      onAutoSaveStatus?.('error')
    } finally {
      onSubmittingChange?.(false)
    }
  }, [ingredient, onSubmittingChange, onSaved, onAutoSaveStatus, router])

  // Ref that always points to the current autosave callback — avoids stale closures
  // inside the setTimeout below.
  const autoSaveFnRef = useRef<() => void>(() => {})
  autoSaveFnRef.current = () => {
    void handleSubmit((data) => performSave(data, true))()
  }

  // ── Debounced autosave — only for existing ingredients ────────────────────
  useEffect(() => {
    if (!isExisting) return
    if (serialize(watched) === serialize(lastSavedRef.current)) return

    onAutoSaveStatus?.('dirty')

    const timer = setTimeout(() => {
      autoSaveFnRef.current()
    }, 2000)

    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watched, isExisting])

  // ── beforeunload guard — warn if pending changes exist ───────────────────
  useEffect(() => {
    if (!isExisting) return

    const handler = (e: BeforeUnloadEvent) => {
      if (serialize(watched) !== serialize(lastSavedRef.current)) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watched, isExisting])

  const onSubmit = useCallback((data: FormData) => performSave(data, false), [performSave])

  const selectClass = cn(field, '[&>option]:bg-white dark:[&>option]:bg-slate-800')

  return (
    <form id="ingredient-form" onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* Name */}
      <div>
        <label className={label}>Name *</label>
        <input {...register('name')} placeholder="e.g. Whole Milk" className={field} />
        {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>}
      </div>

      {/* Brand */}
      <div>
        <label className={label}>Brand <span className="font-normal text-slate-400">(optional)</span></label>
        <input {...register('brand')} placeholder="e.g. Lurpak, RHM, KTC" className={field} />
      </div>

      {/* Category */}
      <div>
        <label className={label}>Category *</label>
        <CustomSelect
          value={categoryValue}
          onChange={(v) => setValue('category', v, { shouldValidate: true })}
          placeholder="Select category…"
          options={CATEGORIES.map((c) => ({ value: c, label: c }))}
          error={errors.category?.message}
        />
      </div>

      {/* Price + Unit */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label}>Price per unit</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">€</span>
            <input
              {...register('current_price', {
                setValueAs: (v: string) => (v === '' ? undefined : parseFloat(v)),
              })}
              type="number"
              step="0.0001"
              min="0"
              placeholder="0.00"
              className={cn(field, 'pl-7')}
            />
          </div>
          {errors.current_price && (
            <p className="mt-1 text-xs text-red-500">{errors.current_price.message}</p>
          )}
        </div>
        <div>
          <label className={label}>Unit *</label>
          <CustomSelect
            value={baseUnitValue}
            onChange={(v) => setValue('base_unit', v, { shouldValidate: true })}
            placeholder="Select…"
            options={UNITS.map((u) => ({ value: u, label: u }))}
            error={errors.base_unit?.message}
          />
        </div>
      </div>

      {/* Package size + unit */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label}>Package size</label>
          <input
            {...register('package_size', {
              setValueAs: (v: string) => (v === '' ? undefined : parseFloat(v)),
            })}
            type="number"
            step="0.01"
            min="0"
            placeholder="e.g. 1000"
            className={field}
          />
        </div>
        <div>
          <label className={label}>Package unit</label>
          <CustomSelect
            value={packageUnitValue}
            onChange={(v) => setValue('package_unit', v)}
            placeholder="Select…"
            options={UNITS.map((u) => ({ value: u, label: u }))}
          />
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className={label}>Notes</label>
        <textarea
          {...register('notes')}
          rows={3}
          placeholder="Storage conditions, preferred supplier, substitutions..."
          className={cn(field, 'resize-none')}
        />
      </div>
    </form>
  )
}
