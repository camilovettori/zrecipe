'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AlertCircle, Check, Pencil } from 'lucide-react'
import { toast } from '@/lib/toast'
import { createClient } from '@/lib/supabase/client'
import { resolveTenantId } from '@/hooks/useTenant'
import { cn } from '@/lib/utils'
import type { IngredientRow } from '@/hooks/useIngredients'
import { CustomSelect } from '@/components/ui/CustomSelect'
import {
  buildCostExamples,
  calculateNormalizedIngredientPrice,
  calculatePackagePriceFromUnitPrice,
  formatIngredientMoney,
  formatIngredientUnitPrice,
  getDefaultIngredientPriceUnit,
  hasMeaningfulPriceChange,
} from '@/lib/utils/ingredient-pricing'

export const CATEGORIES = [
  'Dairy',
  'Flour',
  'Sugar',
  'Spice',
  'Meat',
  'Vegetable',
  'Fruit',
  'Produce',
  'Bakery',
  'Condiments',
  'Beverages',
  'Eggs',
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
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800/60 dark:text-white dark:placeholder-slate-500'

const label = 'mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300'

interface IngredientFormProps {
  ingredient: IngredientRow | null
  onSubmittingChange?: (submitting: boolean) => void
  onSaved?: (ingredient: IngredientRow) => void
  onAutoSaveStatus?: (status: AutoSaveStatus) => void
  onValidityChange?: (valid: boolean) => void
}

type IngredientDbRow = {
  id: string
  name: string
  category: string | null
  current_price: number | null
  price_unit?: string | null
  package_size: number | null
  package_unit: string | null
  last_purchase_date: string | null
  last_supplier_id: string | null
  notes: string | null
  image_url: string | null
  supplier_id: string | null
  supplier: { name: string } | null
  created_at: string
  updated_at: string
}

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

function parsePositiveNumber(value: string) {
  if (value.trim() === '') return null
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function formatCount(value: number) {
  return Number.isInteger(value) ? value.toString() : value.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

export default function IngredientForm({
  ingredient,
  onSubmittingChange,
  onSaved,
  onAutoSaveStatus,
  onValidityChange,
}: IngredientFormProps) {
  const router = useRouter()
  const isExisting = !!ingredient?.id

  const [categoryMode, setCategoryMode] = useState<'select' | 'custom'>('select')
  const [customCategoryInput, setCustomCategoryInput] = useState('')
  const [overrideUnitPrice, setOverrideUnitPrice] = useState(false)
  const [packagePriceInput, setPackagePriceInput] = useState('')
  const priceUnitTouchedRef = useRef(false)

  const defaultValues: FormData = {
    name: ingredient?.name ?? '',
    brand: ingredient?.brand ?? '',
    category: ingredient?.category ?? '',
    current_price: ingredient?.current_price ?? undefined,
    base_unit: ingredient?.base_unit ?? getDefaultIngredientPriceUnit(ingredient?.package_unit) ?? 'kg',
    package_size: ingredient?.package_size ?? undefined,
    package_unit: ingredient?.package_unit ?? '',
    notes: ingredient?.notes ?? '',
  }

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues,
    mode: 'onChange',
  })

  const lastSavedRef = useRef<FormData>(defaultValues)
  const watched = useWatch({ control }) as FormData
  const categoryValue = (watched.category ?? '') as string
  const baseUnitValue = (watched.base_unit ?? '') as string
  const packageUnitValue = (watched.package_unit ?? '') as string
  const packageQuantity = watched.package_size ?? null
  const currentUnitPrice = watched.current_price ?? null

  useEffect(() => {
    if (!ingredient) {
      setPackagePriceInput('')
      setOverrideUnitPrice(false)
      priceUnitTouchedRef.current = false
      return
    }

    const derived = calculatePackagePriceFromUnitPrice(
      ingredient.current_price,
      ingredient.package_size,
      ingredient.package_unit,
      ingredient.base_unit
    )
    setPackagePriceInput(derived != null ? derived.toFixed(2) : '')
    setOverrideUnitPrice(false)
    priceUnitTouchedRef.current = false
  }, [ingredient])

  const pricingPreview = useMemo(() => {
    const parsedPackagePrice = parsePositiveNumber(packagePriceInput)
    return calculateNormalizedIngredientPrice({
      packagePrice: parsedPackagePrice,
      packageQuantity,
      packageUnit: packageUnitValue,
      priceUnit: baseUnitValue,
    })
  }, [packagePriceInput, packageQuantity, packageUnitValue, baseUnitValue])

  useEffect(() => {
    if (overrideUnitPrice) return

    if (!pricingPreview.isValid || pricingPreview.normalizedPrice == null) {
      if (packagePriceInput.trim() === '' && ingredient?.current_price == null) {
        setValue('current_price', undefined, { shouldDirty: true, shouldValidate: true })
      }
      return
    }

    const next = Number(pricingPreview.normalizedPrice.toFixed(6))
    if (watched.current_price !== next) {
      setValue('current_price', next, { shouldDirty: true, shouldValidate: true })
    }
  }, [ingredient?.current_price, overrideUnitPrice, packagePriceInput, pricingPreview, pricingPreview.normalizedPrice, setValue, watched.current_price])

  useEffect(() => {
    const hasPackagePricing =
      packagePriceInput.trim() !== '' &&
      packageQuantity != null &&
      packageQuantity > 0 &&
      Boolean((watched.package_unit ?? '').trim())

    const priceReady = overrideUnitPrice
      ? currentUnitPrice != null && currentUnitPrice > 0
      : hasPackagePricing
        ? pricingPreview.isValid && pricingPreview.normalizedPrice != null
        : ingredient?.current_price != null

    const valid =
      formState.isValid &&
      Boolean(watched.name.trim()) &&
      Boolean(watched.category.trim()) &&
      Boolean(watched.base_unit.trim()) &&
      priceReady

    onValidityChange?.(valid)
  }, [
    currentUnitPrice,
    formState.isValid,
    ingredient?.current_price,
    onValidityChange,
    overrideUnitPrice,
    packagePriceInput,
    packageQuantity,
    pricingPreview.isValid,
    pricingPreview.normalizedPrice,
    watched.base_unit,
    watched.category,
    watched.name,
    watched.package_unit,
  ])

  const performSave = useCallback(
    async (data: FormData, silent: boolean) => {
      onSubmittingChange?.(true)
      if (silent) onAutoSaveStatus?.('saving')

      const supabase = createClient()
      const effectiveCurrentPrice = overrideUnitPrice
        ? data.current_price ?? null
        : pricingPreview.normalizedPrice ?? ingredient?.current_price ?? data.current_price ?? null

      const payload = {
        name: data.name,
        brand: data.brand?.trim() || null,
        category: data.category,
        current_price: effectiveCurrentPrice ?? null,
        price_unit: data.base_unit,
        package_size: data.package_size ?? null,
        package_unit: data.package_unit ?? null,
        notes: data.notes ?? null,
      }

      try {
        if (!payload.current_price || payload.current_price <= 0) {
          throw new Error('Enter a valid purchase cost so ZRecipe can calculate the unit price.')
        }

        if (ingredient) {
          const priceChanged = hasMeaningfulPriceChange(ingredient.current_price, payload.current_price)

          const { data: row, error } = await supabase
            .from('ingredients')
            .update(payload)
            .eq('id', ingredient.id)
            .select()
            .single()
          if (error) throw error

          if (!silent) toast.success('Ingredient updated')

          const savedRow = row as IngredientDbRow

          if (priceChanged) {
            const lastSavedPrice = lastSavedRef.current.current_price ?? null
            if (hasMeaningfulPriceChange(lastSavedPrice, payload.current_price)) {
              try {
                const tenantId = await resolveTenantId()
                await supabase.from('ingredient_price_history').insert({
                  ingredient_id: ingredient.id,
                  tenant_id: tenantId,
                  price: payload.current_price,
                  unit: data.base_unit,
                  recorded_at: new Date().toISOString().slice(0, 10),
                })
              } catch {
                // Best effort: ingredient save should never fail because history did.
              }
            }
          }

          lastSavedRef.current = { ...data, current_price: payload.current_price }
          onAutoSaveStatus?.('saved')
          onSaved?.({
            ...savedRow,
            base_unit: savedRow.price_unit ?? data.base_unit,
          } as IngredientRow)
        } else {
          const tenantId = await resolveTenantId()
          const { data: row, error } = await supabase
            .from('ingredients')
            .insert({ ...payload, tenant_id: tenantId })
            .select()
            .single()
          if (error) throw error

          const newId = (row as IngredientDbRow).id
          toast.success('Ingredient created')

          try {
            await supabase.from('ingredient_price_history').insert({
              ingredient_id: newId,
              tenant_id: tenantId,
              price: payload.current_price,
              unit: data.base_unit,
              recorded_at: new Date().toISOString().slice(0, 10),
            })
          } catch {
            // Best effort.
          }

          router.push(`/ingredients/${newId}`)
        }
      } catch (err: unknown) {
        if (!silent) toast.error(err instanceof Error ? err.message : 'Unable to save ingredient')
        onAutoSaveStatus?.('error')
      } finally {
        onSubmittingChange?.(false)
      }
    },
    [ingredient, onSubmittingChange, onSaved, onAutoSaveStatus, overrideUnitPrice, pricingPreview.normalizedPrice, router]
  )

  const autoSaveFnRef = useRef<() => void>(() => {})
  autoSaveFnRef.current = () => {
    void handleSubmit((data) => performSave(data, true))()
  }

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

  const isCustomCategory = categoryValue && !CATEGORIES.includes(categoryValue)
  const packagePriceLabel = packagePriceInput.trim() === '' ? '—' : formatIngredientMoney(Number(packagePriceInput))
  const currentPriceLabel = currentUnitPrice != null && Number.isFinite(currentUnitPrice)
    ? formatIngredientUnitPrice(currentUnitPrice, baseUnitValue)
    : '—'
  const previewExamples = buildCostExamples(pricingPreview.normalizedPrice, pricingPreview.normalizedUnit)
  const hasPackagePricing =
    packagePriceInput.trim() !== '' &&
    packageQuantity != null &&
    packageQuantity > 0 &&
    Boolean(packageUnitValue.trim())
  const previewStatus = pricingPreview.isValid
    ? 'Ready to save'
    : ingredient?.current_price != null && !hasPackagePricing
      ? 'Using existing price'
      : pricingPreview.warnings[0] ?? 'Missing package price'

  const confirmCustomCategory = () => {
    const trimmed = customCategoryInput.trim()
    if (!trimmed) return
    setValue('category', trimmed, { shouldValidate: true })
    setCategoryMode('select')
    setCustomCategoryInput('')
  }

  return (
    <form id="ingredient-form" onSubmit={handleSubmit(onSubmit)}>
      <div className={cn('grid gap-6', !isExisting && 'lg:grid-cols-[minmax(0,1fr)_320px]')}>
        <div className="space-y-5">
          {/* Name */}
          <div>
            <label className={label}>Name *</label>
            <input {...register('name')} placeholder="e.g. Whole Milk" className={field} />
            {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>}
          </div>

          {/* Brand */}
          <div>
            <label className={label}>
              Brand <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input {...register('brand')} placeholder="e.g. Lurpak, RHM, KTC" className={field} />
          </div>

          {/* Category */}
          <div>
            <label className={label}>
              Category *
              {isCustomCategory && categoryMode === 'select' && (
                <button
                  type="button"
                  onClick={() => {
                    setCustomCategoryInput(categoryValue)
                    setCategoryMode('custom')
                  }}
                  className="ml-1 text-gray-400 transition-colors hover:text-emerald-600"
                  title="Edit custom category"
                >
                  <Pencil className="inline h-3 w-3" />
                </button>
              )}
            </label>
            {categoryMode === 'select' ? (
              <CustomSelect
                value={isCustomCategory ? '__custom__' : categoryValue}
                onChange={(v) => {
                  if (v === '__create__') {
                    setCategoryMode('custom')
                    setCustomCategoryInput('')
                  } else {
                    setValue('category', v, { shouldValidate: true })
                  }
                }}
                placeholder="Select category…"
                options={[
                  ...CATEGORIES.map((c) => ({ value: c, label: c })),
                  ...(isCustomCategory ? [{ value: '__custom__', label: categoryValue }] : []),
                  { value: '__create__', label: '+ Create category...' },
                ]}
                error={errors.category?.message}
              />
            ) : (
              <div className="flex gap-2">
                <input
                  autoFocus
                  type="text"
                  value={customCategoryInput}
                  onChange={(e) => setCustomCategoryInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      confirmCustomCategory()
                    }
                    if (e.key === 'Escape') setCategoryMode('select')
                  }}
                  placeholder="Category name..."
                  className="flex-1 rounded-lg border border-emerald-400 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-100"
                />
                <button
                  type="button"
                  onClick={confirmCustomCategory}
                  className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white"
                >
                  <Check className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setCategoryMode('select')}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-500"
                >
                  ×
                </button>
              </div>
            )}
          </div>

          {/* Purchase cost */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-900/40">
            <div className="mb-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                Purchase cost
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Enter what you paid for the full package. ZRecipe calculates the unit cost automatically.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className={label}>Supplier/package price (€)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">€</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={packagePriceInput}
                    onChange={(e) => setPackagePriceInput(e.target.value)}
                    placeholder="0.00"
                    className={cn(field, 'pl-7')}
                  />
                </div>
              </div>

              <div>
                <label className={label}>Package quantity</label>
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
                  onChange={(v) => {
                    setValue('package_unit', v, { shouldValidate: true })
                    if (!priceUnitTouchedRef.current) {
                      setValue('base_unit', getDefaultIngredientPriceUnit(v), { shouldValidate: true })
                    }
                  }}
                  placeholder="Select…"
                  options={UNITS.map((u) => ({ value: u, label: u }))}
                  error={errors.package_unit?.message}
                />
              </div>

              <div>
                <label className={label}>Normalized price unit</label>
                <CustomSelect
                  value={baseUnitValue}
                  onChange={(v) => {
                    priceUnitTouchedRef.current = true
                    setValue('base_unit', v, { shouldValidate: true })
                  }}
                  placeholder="Select…"
                  options={UNITS.map((u) => ({ value: u, label: u }))}
                  error={errors.base_unit?.message}
                />
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800/60">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                    Calculated unit price
                  </p>
                  <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
                    {overrideUnitPrice ? currentPriceLabel : formatIngredientUnitPrice(pricingPreview.normalizedPrice, pricingPreview.normalizedUnit)}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setOverrideUnitPrice((prev) => {
                      const next = !prev
                      if (!next && pricingPreview.normalizedPrice != null) {
                        setValue('current_price', Number(pricingPreview.normalizedPrice.toFixed(6)), {
                          shouldDirty: true,
                          shouldValidate: true,
                        })
                      }
                      return next
                    })
                  }}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                    overrideUnitPrice
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-200 hover:text-emerald-700'
                  )}
                >
                  {overrideUnitPrice ? 'Override active' : 'Override calculated unit price'}
                </button>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div>
                  <label className={label}>Unit price</label>
                  {overrideUnitPrice ? (
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">€</span>
                      <input
                        {...register('current_price', {
                          setValueAs: (v: string) => (v === '' ? undefined : parseFloat(v)),
                        })}
                        type="number"
                        step="0.000001"
                        min="0"
                        placeholder="0.00"
                        className={cn(field, 'pl-7')}
                      />
                    </div>
                  ) : (
                    <input
                      value={currentPriceLabel}
                      readOnly
                      className={cn(field, 'cursor-default bg-slate-50 text-slate-900 dark:bg-slate-900/60')}
                    />
                  )}
                  {errors.current_price && (
                    <p className="mt-1 text-xs text-red-500">{errors.current_price.message}</p>
                  )}
                </div>

                <div>
                  <label className={label}>Validation</label>
                  <div
                    className={cn(
                      'flex h-[42px] items-center justify-between rounded-xl border px-3 text-sm font-medium',
                      pricingPreview.isValid
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-amber-200 bg-amber-50 text-amber-700'
                    )}
                  >
                    <span>{pricingPreview.isValid ? 'Ready to save' : 'Needs review'}</span>
                    <span className="text-[11px] font-semibold uppercase tracking-wider">
                      {pricingPreview.isValid ? 'OK' : 'Check units'}
                    </span>
                  </div>
                </div>
              </div>

              {pricingPreview.conversionUsed && (
                <p className="mt-3 text-xs text-slate-500">
                  {pricingPreview.conversionUsed}
                </p>
              )}

              {pricingPreview.warnings.length > 0 && (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{pricingPreview.warnings[0]}</span>
                  </div>
                </div>
              )}

              <p className="mt-3 text-xs text-slate-500">
                Package price: <span className="font-medium text-slate-700">{packagePriceLabel}</span>
                {'  '}·{'  '}
                Package size: <span className="font-medium text-slate-700">
                  {packageQuantity != null ? formatCount(packageQuantity) : '—'} {packageUnitValue || ''}
                </span>
              </p>
            </div>
          </div>

          {overrideUnitPrice && (
            <p className="text-xs text-slate-500">
              Manual override is active. ZRecipe will save the unit price exactly as entered.
            </p>
          )}

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
        </div>

        {!isExisting && (
          <aside className="space-y-4 lg:sticky lg:top-6 self-start">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                    Cost Intelligence
                  </p>
                  <h3 className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                    Live preview
                  </h3>
                </div>
                <span
                  className={cn(
                    'rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider',
                    pricingPreview.isValid
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-amber-50 text-amber-700'
                  )}
                >
                  {previewStatus}
                </span>
              </div>

              <div className="space-y-3">
                <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900/40">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Current unit cost</p>
                  <p className="mt-1 text-2xl font-black text-slate-900 dark:text-white">
                    {overrideUnitPrice
                      ? formatIngredientUnitPrice(currentUnitPrice, baseUnitValue)
                      : formatIngredientUnitPrice(pricingPreview.normalizedPrice, pricingPreview.normalizedUnit)}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900/40">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">100g / 100ml</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                      {previewExamples[0] ?? '—'}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900/40">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">1 full unit</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                      {previewExamples[1] ?? previewExamples[0] ?? '—'}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/40">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Validation</p>
                  <p className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-300">
                    {previewStatus}
                  </p>
                  {pricingPreview.warnings.length > 0 ? (
                    <p className="mt-1 text-xs text-amber-700">{pricingPreview.warnings[0]}</p>
                  ) : (
                    <p className="mt-1 text-xs text-slate-500">Safe conversion and unit math.</p>
                  )}
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>
    </form>
  )
}
