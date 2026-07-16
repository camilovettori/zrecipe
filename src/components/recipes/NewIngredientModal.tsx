'use client'

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Check, Loader2, Pencil, X } from 'lucide-react'
import { CustomSelect } from '@/components/ui/CustomSelect'
import { useIngredientCategories } from '@/hooks/useIngredientCategories'

export type NewIngredientFormData = {
  name: string
  brand: string
  category: string
  pricePerUnit: number
  unit: string
  packageSize: number | null
  packageUnit: string
  recipeQuantity: number
  recipeUnit: string
}

interface NewIngredientModalProps {
  open: boolean
  initialName: string
  saving: boolean
  error: string | null
  onClose: () => void
  onSave: (data: NewIngredientFormData) => Promise<void> | void
}

const PRICE_UNITS = ['kg', 'g', 'L', 'ml', 'unit']
const RECIPE_UNITS = ['g', 'kg', 'ml', 'L', 'unit']

function parsePositiveNumber(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

export default function NewIngredientModal({
  open,
  initialName,
  saving,
  error,
  onClose,
  onSave,
}: NewIngredientModalProps) {
  const categories = useIngredientCategories()
  const nameInputRef = useRef<HTMLInputElement | null>(null)
  const [name, setName] = useState(initialName)
  const [brand, setBrand] = useState('')
  const [category, setCategory] = useState('Other')
  const [categoryMode, setCategoryMode] = useState<'select' | 'custom'>('select')
  const [customCategoryInput, setCustomCategoryInput] = useState('')
  const [pricePerUnit, setPricePerUnit] = useState('')
  const [unit, setUnit] = useState('kg')
  const [packageSize, setPackageSize] = useState('')
  const [packageUnit, setPackageUnit] = useState('kg')
  const [recipeQuantity, setRecipeQuantity] = useState('')
  const [recipeUnit, setRecipeUnit] = useState('kg')
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(initialName)
    setBrand('')
    setCategory('Other')
    setCategoryMode('select')
    setCustomCategoryInput('')
    setPricePerUnit('')
    setUnit('kg')
    setPackageSize('')
    setPackageUnit('kg')
    setRecipeQuantity('')
    setRecipeUnit('kg')
    setSubmitted(false)
    window.setTimeout(() => nameInputRef.current?.focus(), 0)
  }, [initialName, open])

  useEffect(() => {
    setRecipeUnit(unit)
    setPackageUnit(unit)
  }, [unit])

  const dirty = useMemo(
    () =>
      name.trim() !== initialName.trim() ||
      Boolean(brand.trim()) ||
      category !== 'Other' ||
      Boolean(pricePerUnit) ||
      unit !== 'kg' ||
      Boolean(packageSize) ||
      packageUnit !== 'kg' ||
      Boolean(recipeQuantity) ||
      recipeUnit !== 'kg',
    [brand, category, initialName, name, packageSize, packageUnit, pricePerUnit, recipeQuantity, recipeUnit, unit]
  )

  const trimmedName = name.trim()
  const parsedPrice = parsePositiveNumber(pricePerUnit)
  const parsedRecipeQuantity = parsePositiveNumber(recipeQuantity)
  const parsedPackageSize = packageSize ? parsePositiveNumber(packageSize) : null

  const isCustomCategory = Boolean(category) && !categories.includes(category)

  const confirmCustomCategory = () => {
    const trimmed = customCategoryInput.trim()
    if (!trimmed) return
    setCategory(trimmed)
    setCategoryMode('select')
    setCustomCategoryInput('')
  }

  const nameError = submitted && !trimmedName ? 'Name is required' : null
  const priceError = submitted && parsedPrice == null ? 'Price is required to calculate costs' : null
  const recipeQuantityError = submitted && parsedRecipeQuantity == null ? 'Quantity is required' : null

  const requestClose = () => {
    if (saving) return
    if (dirty && !window.confirm('Discard this new ingredient?')) return
    onClose()
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitted(true)

    if (!trimmedName || parsedPrice == null || parsedRecipeQuantity == null) return

    await onSave({
      name: trimmedName,
      brand: brand.trim(),
      category,
      pricePerUnit: parsedPrice,
      unit,
      packageSize: parsedPackageSize,
      packageUnit,
      recipeQuantity: parsedRecipeQuantity,
      recipeUnit,
    })
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) requestClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-sm" />
        <Dialog.Content
          onPointerDownOutside={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => {
            event.preventDefault()
            requestClose()
          }}
          className="fixed left-1/2 top-1/2 z-50 w-[min(94vw,760px)] max-h-[90vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-xl font-semibold text-slate-900">
                New Ingredient
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-slate-500">
                Fill in the purchase details so costs calculate correctly.
              </Dialog.Description>
            </div>
            <button
              type="button"
              onClick={requestClose}
              disabled={saving}
              className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-6">
            {error && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="grid gap-6 md:grid-cols-[1.35fr_0.85fr]">
              <section className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Ingredient details</h3>
                  <p className="mt-1 text-xs text-slate-500">Saved to your ingredients catalog.</p>
                </div>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-slate-600">Name</span>
                  <input
                    ref={nameInputRef}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                  />
                  {nameError && <p className="mt-1 text-xs text-red-600">{nameError}</p>}
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-slate-600">Brand</span>
                    <input
                      value={brand}
                      onChange={(event) => setBrand(event.target.value)}
                      placeholder="Lakeland, KTC..."
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-emerald-500"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1.5 flex items-center gap-1 text-xs font-medium text-slate-600">
                      Category
                      {isCustomCategory && categoryMode === 'select' && (
                        <button
                          type="button"
                          onClick={() => {
                            setCustomCategoryInput(category)
                            setCategoryMode('custom')
                          }}
                          className="text-gray-400 transition-colors hover:text-emerald-600"
                          title="Edit custom category"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      )}
                    </span>
                    {categoryMode === 'select' ? (
                      <CustomSelect
                        value={isCustomCategory ? '__custom__' : category}
                        onChange={(v) => {
                          if (v === '__create__') {
                            setCategoryMode('custom')
                            setCustomCategoryInput('')
                          } else {
                            setCategory(v)
                          }
                        }}
                        options={[
                          ...categories.map((c) => ({ value: c, label: c })),
                          ...(isCustomCategory ? [{ value: '__custom__', label: category }] : []),
                          { value: '__create__', label: '+ Create category...' },
                        ]}
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
                          className="flex-1 rounded-lg border border-emerald-400 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-100"
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
                  </label>
                </div>

                <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-slate-600">Price per unit</span>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                        {'\u20ac'}
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={pricePerUnit}
                        onChange={(event) => setPricePerUnit(event.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-8 py-2 text-sm outline-none transition focus:border-emerald-500"
                      />
                    </div>
                    {priceError && <p className="mt-1 text-xs text-red-600">{priceError}</p>}
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-slate-600">Unit</span>
                    <CustomSelect
                      value={unit}
                      onChange={setUnit}
                      options={PRICE_UNITS.map((o) => ({ value: o, label: o }))}
                    />
                  </label>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-slate-600">Package size</span>
                    <input
                      type="number"
                      min="0"
                      step="0.001"
                      value={packageSize}
                      onChange={(event) => setPackageSize(event.target.value)}
                      placeholder="6, 10, 2.5"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-emerald-500"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-slate-600">Package unit</span>
                    <CustomSelect
                      value={packageUnit}
                      onChange={setPackageUnit}
                      options={PRICE_UNITS.map((o) => ({ value: o, label: o }))}
                    />
                  </label>
                </div>
              </section>

              <section className="space-y-4 border-t border-slate-100 pt-5 md:border-l md:border-t-0 md:pl-6 md:pt-0">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Add to recipe</h3>
                  <p className="mt-1 text-xs text-slate-500">How much this recipe uses.</p>
                </div>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-slate-600">Quantity</span>
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={recipeQuantity}
                    onChange={(event) => setRecipeQuantity(event.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-emerald-500"
                  />
                  {recipeQuantityError && (
                    <p className="mt-1 text-xs text-red-600">{recipeQuantityError}</p>
                  )}
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-slate-600">Unit</span>
                  <CustomSelect
                    value={recipeUnit}
                    onChange={setRecipeUnit}
                    options={RECIPE_UNITS.map((o) => ({ value: o, label: o }))}
                  />
                </label>
              </section>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={requestClose}
                disabled={saving}
                className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Save & Add to Recipe
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
