'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from '@/lib/toast'
import { Upload, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { IngredientRow } from '@/hooks/useIngredients'

export const CATEGORIES = [
  'Dairy', 'Flour', 'Sugar', 'Spice', 'Meat', 'Vegetable', 'Fruit', 'Other',
]
export const UNITS = [
  'kg', 'g', 'lb', 'oz', 'L', 'ml', 'cup', 'tbsp', 'tsp', 'unit', 'dozen', 'pack',
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

export default function IngredientForm({
  ingredient,
  onSubmittingChange,
  onSaved,
}: IngredientFormProps) {
  const router = useRouter()
  const [imageUrl, setImageUrl] = useState<string | undefined>(
    ingredient?.image_url ?? undefined
  )
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

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

  const uploadImage = async (file: File) => {
    if (!file.type.startsWith('image/')) return
    setUploading(true)
    const supabase = createClient()
    const path = `${Date.now()}-${file.name.replace(/\s+/g, '-')}`
    const { error } = await supabase.storage.from('ingredient-images').upload(path, file)
    if (error) {
      toast.error('Image upload failed')
    } else {
      const { data } = supabase.storage.from('ingredient-images').getPublicUrl(path)
      setImageUrl(data.publicUrl)
    }
    setUploading(false)
  }

  const onSubmit = async (data: FormData) => {
    onSubmittingChange?.(true)
    const supabase = createClient()
    const payload = { ...data, image_url: imageUrl ?? null }

    try {
      if (ingredient) {
        const { data: row, error } = await supabase
          .from('ingredients')
          .update(payload)
          .eq('id', ingredient.id)
          .select()
          .single()
        if (error) throw error
        toast.success('Ingredient updated')
        onSaved?.(row as IngredientRow)
      } else {
        const { data: row, error } = await supabase
          .from('ingredients')
          .insert(payload)
          .select()
          .single()
        if (error) throw error
        toast.success('Ingredient created')
        router.push(`/ingredients/${(row as IngredientRow).id}`)
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
          <option value="">Select category…</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
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
            <option value="">Select…</option>
            {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
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
            <option value="">Select…</option>
            {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
      </div>

      {/* Image upload */}
      <div>
        <label className={label}>Image</label>
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={(e) => { e.preventDefault(); setIsDragging(false) }}
          onDrop={(e) => {
            e.preventDefault()
            setIsDragging(false)
            const file = e.dataTransfer.files[0]
            if (file) uploadImage(file)
          }}
          onClick={() => fileRef.current?.click()}
          className={cn(
            'flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-5 transition-colors',
            isDragging
              ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/10'
              : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600'
          )}
        >
          {imageUrl ? (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt="Ingredient" className="h-24 w-24 rounded-lg object-cover" />
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setImageUrl(undefined) }}
                className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-400"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : uploading ? (
            <div className="flex flex-col items-center gap-2">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
              <p className="text-xs text-slate-500">Uploading…</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-slate-400">
              <Upload className="h-7 w-7" />
              <p className="text-sm">
                Drop image or{' '}
                <span className="font-medium text-emerald-600">browse</span>
              </p>
              <p className="text-xs">PNG, JPG, WebP up to 5 MB</p>
            </div>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f) }}
        />
      </div>

      {/* Notes */}
      <div>
        <label className={label}>Notes</label>
        <textarea
          {...register('notes')}
          rows={3}
          placeholder="Storage conditions, preferred supplier, substitutions…"
          className={cn(field, 'resize-none')}
        />
      </div>
    </form>
  )
}
