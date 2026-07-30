'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AlertTriangle, ArrowUpRight, Check, Package, Pencil, Plus } from 'lucide-react'
import { toast } from '@/lib/toast'
import { createClient } from '@/lib/supabase/client'
import { resolveTenantId } from '@/hooks/useTenant'
import { cn } from '@/lib/utils'
import type { IngredientRow } from '@/hooks/useIngredients'
import { CustomSelect } from '@/components/ui/CustomSelect'
import DeleteCategoryModal from '@/components/ingredients/DeleteCategoryModal'
import RenameCategoryModal from '@/components/shared/RenameCategoryModal'
import { useIngredientCategories } from '@/hooks/useIngredientCategories'
import { useIngredientBrands } from '@/hooks/useIngredientBrands'
import { useSuppliers } from '@/hooks/useSuppliers'
import {
  calculateNormalizedIngredientPrice,
  calculatePackagePriceFromUnitPrice,
  formatIngredientUnitPrice,
  getDefaultIngredientPriceUnit,
  hasMeaningfulPriceChange,
  type IngredientPricingResult,
} from '@/lib/utils/ingredient-pricing'

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
export type IngredientCostPreview = IngredientPricingResult & { isOverride: boolean }

const field =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800/60 dark:text-white dark:placeholder-slate-500'

const label = 'mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300'

interface IngredientFormProps {
  ingredient: IngredientRow | null
  onSubmittingChange?: (submitting: boolean) => void
  onSaved?: (ingredient: IngredientRow) => void
  onAutoSaveStatus?: (status: AutoSaveStatus) => void
  onValidityChange?: (valid: boolean) => void
  onPricingPreviewChange?: (preview: IngredientCostPreview) => void
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
  needs_verification?: boolean | null
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

function TypeaheadDropdown<T>({
  items,
  getKey,
  getLabel,
  onSelect,
  icon: Icon = Plus,
  header,
}: {
  items: T[]
  getKey: (item: T) => string
  getLabel: (item: T) => string
  onSelect: (item: T) => void
  icon?: ComponentType<{ className?: string }>
  header?: ReactNode
}) {
  if (items.length === 0) return null
  return (
    <div className="absolute z-20 mt-1.5 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800">
      {header && (
        <div className="flex items-center gap-1.5 border-b border-slate-100 bg-amber-50/60 px-4 py-2 text-xs font-semibold text-amber-700 dark:border-slate-700 dark:bg-amber-950/20 dark:text-amber-400">
          {header}
        </div>
      )}
      {items.map((item) => (
        <button
          key={getKey(item)}
          type="button"
          onClick={() => onSelect(item)}
          className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition hover:bg-slate-50 dark:hover:bg-slate-700"
        >
          <span className="font-medium text-slate-900 dark:text-white">{getLabel(item)}</span>
          <Icon className="h-4 w-4 shrink-0 text-slate-400" />
        </button>
      ))}
    </div>
  )
}

export default function IngredientForm({
  ingredient,
  onSubmittingChange,
  onSaved,
  onAutoSaveStatus,
  onValidityChange,
  onPricingPreviewChange,
}: IngredientFormProps) {
  const router = useRouter()
  const isExisting = !!ingredient?.id
  const { categories, refetch: refetchCategories } = useIngredientCategories()
  const brands = useIngredientBrands()
  const { suppliers, createSupplier } = useSuppliers()

  const [categoryMode, setCategoryMode] = useState<'select' | 'custom'>('select')
  const [customCategoryInput, setCustomCategoryInput] = useState('')
  const [categoryToDelete, setCategoryToDelete] = useState<{ name: string; count: number } | null>(null)
  const [deleteCategoryModalOpen, setDeleteCategoryModalOpen] = useState(false)
  // RenameCategoryModal owns the input's live value, so only the category
  // being renamed needs to be tracked here.
  const [categoryRenameState, setCategoryRenameState] = useState<{ oldName: string } | null>(null)
  const [overrideUnitPrice, setOverrideUnitPrice] = useState(false)
  const [packagePriceInput, setPackagePriceInput] = useState('')
  const [supplierQuery, setSupplierQuery] = useState(ingredient?.supplier?.name ?? '')
  const [supplierId, setSupplierId] = useState<string | null>(ingredient?.last_supplier_id ?? null)
  const [supplierDropdownOpen, setSupplierDropdownOpen] = useState(false)
  const [brandDropdownOpen, setBrandDropdownOpen] = useState(false)
  const [nameDropdownOpen, setNameDropdownOpen] = useState(false)
  const [duplicateMatches, setDuplicateMatches] = useState<Array<{ id: string; name: string }>>([])
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

  const nameField = register('name')
  const lastSavedRef = useRef<FormData>(defaultValues)
  const watched = useWatch({ control }) as FormData
  const categoryValue = (watched.category ?? '') as string
  const baseUnitValue = (watched.base_unit ?? '') as string
  const packageUnitValue = (watched.package_unit ?? '') as string
  const packageQuantity = watched.package_size ?? null
  const currentUnitPrice = watched.current_price ?? null
  const brandValue = (watched.brand ?? '') as string
  const nameValue = (watched.name ?? '') as string

  useEffect(() => {
    if (!ingredient) {
      setPackagePriceInput('')
      setOverrideUnitPrice(false)
      priceUnitTouchedRef.current = false
      setSupplierQuery('')
      setSupplierId(null)
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
    setSupplierQuery(ingredient.supplier?.name ?? '')
    setSupplierId(ingredient.last_supplier_id ?? null)
  }, [ingredient])

  const supplierSuggestions = useMemo(() => {
    const q = supplierQuery.trim().toLowerCase()
    if (!q) return []
    return suppliers.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 6)
  }, [suppliers, supplierQuery])

  const brandSuggestions = useMemo(() => {
    const q = brandValue.trim().toLowerCase()
    if (!q) return []
    return brands.filter((b) => b.toLowerCase().includes(q)).slice(0, 6)
  }, [brands, brandValue])

  useEffect(() => {
    const originalName = ingredient?.name?.trim().toLowerCase() ?? ''
    const currentName = nameValue.trim().toLowerCase()
    const shouldCheckDuplicate = currentName.length > 0 && currentName !== originalName

    if (!shouldCheckDuplicate) {
      setDuplicateMatches([])
      return
    }

    const query = nameValue.trim()

    let cancelled = false
    const timer = setTimeout(async () => {
      const supabase = createClient()
      let request = supabase
        .from('ingredients')
        .select('id, name')
        .ilike('name', `%${query}%`)
      if (ingredient?.id) {
        request = request.neq('id', ingredient.id)
      }
      const { data } = await request.limit(5)
      if (cancelled) return
      setDuplicateMatches(data ?? [])
    }, 400)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [nameValue, ingredient])

  const pricingPreview = useMemo(() => {
    const parsedPackagePrice = parsePositiveNumber(packagePriceInput)
    return calculateNormalizedIngredientPrice({
      packagePrice: parsedPackagePrice,
      packageQuantity,
      packageUnit: packageUnitValue,
      priceUnit: baseUnitValue,
    })
  }, [packagePriceInput, packageQuantity, packageUnitValue, baseUnitValue])

  const effectivePricingPreview = useMemo<IngredientCostPreview>(() => {
    if (!overrideUnitPrice) return { ...pricingPreview, isOverride: false }

    const isValid = currentUnitPrice != null && Number.isFinite(currentUnitPrice) && currentUnitPrice > 0
    return {
      ...pricingPreview,
      normalizedPrice: isValid ? currentUnitPrice : null,
      normalizedUnit: baseUnitValue,
      warnings: isValid ? [] : ['Enter a valid manual unit price.'],
      isValid,
      isOverride: true,
    }
  }, [baseUnitValue, currentUnitPrice, overrideUnitPrice, pricingPreview])

  useEffect(() => {
    onPricingPreviewChange?.(effectivePricingPreview)
  }, [effectivePricingPreview, onPricingPreviewChange])

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

      try {
        const trimmedSupplierQuery = supplierQuery.trim()
        let resolvedSupplierId: string | null = supplierId

        if (trimmedSupplierQuery && !resolvedSupplierId) {
          const created = await createSupplier({ name: trimmedSupplierQuery })
          resolvedSupplierId = created.id
          setSupplierId(created.id)
        } else if (!trimmedSupplierQuery) {
          resolvedSupplierId = null
        }

        const payload = {
          name: data.name,
          brand: data.brand?.trim() || null,
          category: data.category,
          current_price: effectiveCurrentPrice ?? null,
          price_unit: data.base_unit,
          package_size: data.package_size ?? null,
          package_unit: data.package_unit ?? null,
          notes: data.notes ?? null,
          last_supplier_id: resolvedSupplierId,
        }

        if (!payload.current_price || payload.current_price <= 0) {
          throw new Error('Enter a valid purchase cost so ZRecipe can calculate the unit price.')
        }

        if (ingredient) {
          const priceChanged = hasMeaningfulPriceChange(ingredient.current_price, payload.current_price)

          // Manual verification is implicit: saving a valid price (already
          // guaranteed > 0 by the check above) on a flagged ingredient is
          // the verification action — no separate "mark as verified" toggle.
          const updatePayload = ingredient.needs_verification
            ? { ...payload, needs_verification: false }
            : payload

          const { data: row, error } = await supabase
            .from('ingredients')
            .update(updatePayload)
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
            // .update().select() doesn't join suppliers — carry the display name through
            // manually so the Supplier field doesn't blank out after a successful save.
            supplier: resolvedSupplierId ? { name: trimmedSupplierQuery } : null,
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
    [
      ingredient,
      onSubmittingChange,
      onSaved,
      onAutoSaveStatus,
      overrideUnitPrice,
      pricingPreview.normalizedPrice,
      router,
      supplierId,
      supplierQuery,
      createSupplier,
    ]
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

  const isCustomCategory = categoryValue && !categories.includes(categoryValue)

  const confirmCustomCategory = () => {
    const trimmed = customCategoryInput.trim()
    if (!trimmed) return
    setValue('category', trimmed, { shouldValidate: true })
    setCategoryMode('select')
    setCustomCategoryInput('')
  }

  const hideCategoryForTenant = async (categoryName: string) => {
    const supabase = createClient()
    const tenantId = await resolveTenantId()
    const { data: tenantRow } = await supabase
      .from('tenants')
      .select('hidden_ingredient_categories')
      .eq('id', tenantId)
      .single()
    const current: string[] = tenantRow?.hidden_ingredient_categories ?? []
    if (!current.some((c) => c.toLowerCase() === categoryName.toLowerCase())) {
      await supabase
        .from('tenants')
        .update({ hidden_ingredient_categories: [...current, categoryName] })
        .eq('id', tenantId)
    }
    toast.success(`"${categoryName}" removed from category list`)
    await refetchCategories()
  }

  const handleDeleteCategory = async (categoryName: string) => {
    const supabase = createClient()

    // Count ingredients currently using this category (case-insensitive)
    const { count } = await supabase
      .from('ingredients')
      .select('id', { count: 'exact', head: true })
      .ilike('category', categoryName)

    if ((count ?? 0) > 0) {
      // Open the reassignment modal instead of deleting immediately
      setCategoryToDelete({ name: categoryName, count: count ?? 0 })
      setDeleteCategoryModalOpen(true)
      return
    }

    // No ingredients use it — hide it immediately
    await hideCategoryForTenant(categoryName)
  }

  const handleReassignAndRemoveCategory = async (replacementCategory: string) => {
    if (!categoryToDelete) return
    const supabase = createClient()

    const { error } = await supabase
      .from('ingredients')
      .update({ category: replacementCategory })
      .ilike('category', categoryToDelete.name)

    if (error) {
      toast.error('Unable to move ingredients to the new category')
      return
    }

    await hideCategoryForTenant(categoryToDelete.name)

    // If the deleted category was the one currently selected on this ingredient,
    // fall back to the replacement so the form doesn't keep pointing at a hidden value.
    if (categoryValue.toLowerCase() === categoryToDelete.name.toLowerCase()) {
      setValue('category', replacementCategory, { shouldValidate: true })
    }

    setDeleteCategoryModalOpen(false)
    setCategoryToDelete(null)
  }

  const handleRenameCategory = async (oldName: string, newName: string) => {
    const trimmed = newName.trim()
    if (!trimmed || trimmed.toLowerCase() === oldName.toLowerCase()) return

    const supabase = createClient()

    // Update ALL ingredients with this category to the new name
    const { error } = await supabase
      .from('ingredients')
      .update({ category: trimmed })
      .ilike('category', oldName)

    if (error) {
      toast.error('Failed to rename category')
      return
    }

    toast.success(`Category renamed to "${trimmed}"`)

    // If this ingredient currently uses the old category, update the form
    if (categoryValue.toLowerCase() === oldName.toLowerCase()) {
      setValue('category', trimmed, { shouldValidate: true })
    }

    setCategoryRenameState(null)
    await refetchCategories()
  }

  return (
    <>
    <form id="ingredient-form" onSubmit={handleSubmit(onSubmit)}>
      <div className="space-y-5">
          {/* Name */}
          <div className="relative">
            <label className={label}>Name *</label>
            <input
              {...nameField}
              onFocus={() => setNameDropdownOpen(true)}
              onBlur={(e) => {
                nameField.onBlur(e)
                setTimeout(() => setNameDropdownOpen(false), 150)
              }}
              placeholder="e.g. Whole Milk"
              className={field}
            />
            {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>}
            {nameDropdownOpen && (
              <TypeaheadDropdown
                items={duplicateMatches}
                getKey={(m) => m.id}
                getLabel={(m) => m.name}
                icon={ArrowUpRight}
                header={
                  <>
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    Similar ingredients already exist
                  </>
                }
                onSelect={(m) => window.open(`/ingredients/${m.id}`, '_blank')}
              />
            )}
          </div>

          {/* Brand */}
          <div className="relative">
            <label className={label}>
              Brand <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input
              value={brandValue}
              onChange={(e) => {
                setValue('brand', e.target.value, { shouldDirty: true, shouldValidate: true })
                setBrandDropdownOpen(true)
              }}
              onFocus={() => setBrandDropdownOpen(true)}
              onBlur={() => setTimeout(() => setBrandDropdownOpen(false), 150)}
              placeholder="e.g. Lurpak, RHM, KTC"
              className={field}
            />
            {brandDropdownOpen && (
              <TypeaheadDropdown
                items={brandSuggestions}
                getKey={(b) => b}
                getLabel={(b) => b}
                onSelect={(b) => {
                  setValue('brand', b, { shouldDirty: true, shouldValidate: true })
                  setBrandDropdownOpen(false)
                }}
              />
            )}
            <p className="mt-1 text-xs text-slate-400">
              Brand is now tracked per purchase in your invoice history. This field is legacy —
              leave it blank unless you always buy this ingredient from the same brand.
            </p>
          </div>

          {/* Supplier */}
          <div className="relative">
            <label className={label}>
              Supplier <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input
              value={supplierQuery}
              onChange={(e) => {
                setSupplierQuery(e.target.value)
                setSupplierId(null)
                setSupplierDropdownOpen(true)
              }}
              onFocus={() => setSupplierDropdownOpen(true)}
              onBlur={() => setTimeout(() => setSupplierDropdownOpen(false), 150)}
              placeholder="e.g. Elliotts Cash & Carry"
              className={field}
            />
            {supplierDropdownOpen && (
              <TypeaheadDropdown
                items={supplierSuggestions}
                getKey={(s) => s.id}
                getLabel={(s) => s.name}
                onSelect={(s) => {
                  setSupplierId(s.id)
                  setSupplierQuery(s.name)
                  setSupplierDropdownOpen(false)
                }}
              />
            )}
            {!supplierId && supplierQuery.trim() && (
              <p className="mt-1.5 text-xs text-slate-400">
                Will create a new supplier &quot;{supplierQuery.trim()}&quot; on save.
              </p>
            )}
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
                  ...categories.map((c) => ({
                    value: c,
                    label: c,
                    onDelete: c === 'Other' ? undefined : () => handleDeleteCategory(c),
                    onEdit: c === 'Other' ? undefined : () => setCategoryRenameState({ oldName: c }),
                  })),
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
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/40 dark:border-slate-700 dark:bg-slate-900/40 dark:shadow-none">
            <div className="flex items-start gap-3 rounded-t-2xl border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4 dark:border-slate-800 dark:from-slate-900 dark:to-slate-900/40">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                <Package className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                  Purchase cost
                </p>
                <h3 className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">
                  What did the full package cost?
                </h3>
                <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-500">
                  Enter what you paid for the full package. ZRecipe calculates the unit cost automatically.
                </p>
              </div>
            </div>

            <div className="grid gap-x-4 gap-y-5 px-5 py-5 md:grid-cols-2">
              <div>
                <label className={label}>Full package price (€)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-400">€</span>
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
                <p className="mt-1.5 text-xs text-slate-400">Use the total shown on the supplier invoice.</p>
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
                <p className="mt-1.5 text-xs text-slate-400">The amount contained in one package.</p>
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
                <p className="mt-1.5 text-xs text-slate-400">How the supplier describes the package.</p>
              </div>

              <div>
                <label className={label}>Calculate cost per</label>
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
                <p className="mt-1.5 text-xs text-slate-400">The standard unit used in recipe costing.</p>
              </div>
            </div>

            <div className="mx-5 mb-5 border-t border-slate-100 pt-4 dark:border-slate-800">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-500">
                  Calculated:{' '}
                  <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                    {formatIngredientUnitPrice(
                      effectivePricingPreview.normalizedPrice,
                      effectivePricingPreview.normalizedUnit
                    )}
                  </span>
                </p>
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
                    'text-xs font-medium transition-colors',
                    overrideUnitPrice
                      ? 'text-amber-700 hover:text-amber-800'
                      : 'text-slate-400 hover:text-emerald-700'
                  )}
                >
                  {overrideUnitPrice ? 'Use automatic calculation' : 'Override unit cost'}
                </button>
              </div>

              {overrideUnitPrice && (
                <div className="mt-3 max-w-xs">
                  <label className={label}>Manual unit cost</label>
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
                  {errors.current_price && (
                    <p className="mt-1 text-xs text-red-500">{errors.current_price.message}</p>
                  )}
                </div>
              )}
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
      </div>
    </form>

    {categoryToDelete && (
      <DeleteCategoryModal
        open={deleteCategoryModalOpen}
        categoryName={categoryToDelete.name}
        count={categoryToDelete.count}
        categories={categories}
        onClose={() => {
          setDeleteCategoryModalOpen(false)
          setCategoryToDelete(null)
        }}
        onConfirm={handleReassignAndRemoveCategory}
      />
    )}

    {categoryRenameState && (
      <RenameCategoryModal
        open={Boolean(categoryRenameState)}
        categoryName={categoryRenameState.oldName}
        onClose={() => setCategoryRenameState(null)}
        onConfirm={(newName) => handleRenameCategory(categoryRenameState.oldName, newName)}
      />
    )}
    </>
  )
}
