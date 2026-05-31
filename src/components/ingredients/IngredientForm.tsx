'use client'

import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from '@/lib/toast'
import { createClient } from '@/lib/supabase/client'
import { resolveTenantId } from '@/hooks/useTenant'
import { cn } from '@/lib/utils'
import type { IngredientRow } from '@/hooks/useIngredients'

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
  category: z.string().min(1, 'Category is required'),
  current_price: z.number().positive('Must be positive').optional(),
  base_unit: z.string().min(1, 'Unit is required'),
  package_size: z.number().positive().optional(),
  package_unit: z.string().optional(),
  notes: z.string().optional(),
})

type FormData = z.infer<typeof schema>

const field =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800/60 dark:text-white dark:placeholder-slate-500'

const label = 'mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300'

interface IngredientFormProps {
  ingredient: IngredientRow | null
  onSubmittingChange?: (submitting: boolean) => void
  onSaved?: (ingredient: IngredientRow) => void
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

export default function IngredientForm({
  ingredient,
  onSubmittingChange,
  onSaved,
}: IngredientFormProps) {
  const router = useRouter()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: ingredient?.name ?? '',
      category: ingredient?.category ?? '',
      current_price: ingredient?.current_price ?? undefined,
      base_unit: ingredient?.base_unit ?? 'kg',
      package_size: ingredient?.package_size ?? undefined,
      package_unit: ingredient?.package_unit ?? '',
      notes: ingredient?.notes ?? '',
    },
  })

  const onSubmit = async (data: FormData) => {
    onSubmittingChange?.(true)
    const supabase = createClient()
    const payload = {
      name: data.name,
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
        toast.success('Ingredient updated')
        const savedRow = row as IngredientDbRow

        if (priceChanged && data.current_price != null) {
          try {
            const tenantId = await resolveTenantId()
            const historyPayload = {
              ingredient_id: ingredient.id,
              tenant_id: tenantId,
              price: data.current_price,
              unit: data.base_unit,
              recorded_at: new Date().toISOString().slice(0, 10),
            }
            console.log('[ingredient] price history payload (update):', historyPayload)
            const { data: historyData, error: historyError } = await supabase
              .from('ingredient_price_history')
              .insert(historyPayload)
              .select('id, ingredient_id, tenant_id, price, unit, recorded_at')
              .single()
            console.log('[ingredient] price history result (update):', historyData)
            console.log(
              '[ingredient] price history error (update):',
              historyError ? JSON.stringify(historyError) : 'null'
            )
            if (historyError) throw historyError
          } catch {
            // Price history is best-effort — don't fail the ingredient save
          }
        }

        onSaved?.({
          ...savedRow,
          base_unit: savedRow.price_unit ?? data.base_unit,
        } as IngredientRow)
      } else {
        // Resolve tenant before insert — tenant_id is NOT NULL and RLS-enforced
        const tenantId = await resolveTenantId()

        const { data: row, error } = await supabase
          .from('ingredients')
          .insert({ ...payload, tenant_id: tenantId })
          .select()
          .single()
        if (error) throw error

        const newId = (row as IngredientDbRow).id
        toast.success('Ingredient created')

        // Record initial price history entry (best-effort, never blocks save)
        if (data.current_price != null && data.current_price > 0) {
          try {
            const historyPayload = {
              ingredient_id: newId,
              tenant_id: tenantId,
              price: data.current_price,
              unit: data.base_unit,
              recorded_at: new Date().toISOString().slice(0, 10),
            }
            console.log('[ingredient] price history payload (create):', historyPayload)
            const { data: historyData, error: historyError } = await supabase
              .from('ingredient_price_history')
              .insert(historyPayload)
              .select('id, ingredient_id, tenant_id, price, unit, recorded_at')
              .single()
            console.log('[ingredient] price history result (create):', historyData)
            console.log(
              '[ingredient] price history error (create):',
              historyError ? JSON.stringify(historyError) : 'null'
            )
            if (historyError) throw historyError
          } catch (e) {
            console.warn('[ingredient] price history insert failed:', e)
          }
        }

        router.push(`/ingredients/${newId}`)
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Unable to save ingredient')
    } finally {
      onSubmittingChange?.(false)
    }
  }

  const selectClass = cn(field, '[&>option]:bg-white dark:[&>option]:bg-slate-800')

  return (
    <form id="ingredient-form" onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* Name */}
      <div>
        <label className={label}>Name *</label>
        <input {...register('name')} placeholder="e.g. Whole Milk" className={field} />
        {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>}
      </div>

      {/* Category */}
      <div>
        <label className={label}>Category *</label>
        <select {...register('category')} className={selectClass}>
          <option value="">Select category...</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        {errors.category && (
          <p className="mt-1 text-xs text-red-500">{errors.category.message}</p>
        )}
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
          <select {...register('base_unit')} className={selectClass}>
            <option value="">Select...</option>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
          {errors.base_unit && (
            <p className="mt-1 text-xs text-red-500">{errors.base_unit.message}</p>
          )}
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
          <select {...register('package_unit')} className={selectClass}>
            <option value="">Select...</option>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
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
