'use client'

import { useEffect, useMemo } from 'react'
import { EU_ALLERGENS, type RecipeAllergenSummary } from '@/lib/allergens'
import type { RecipeIngredientDraft } from '@/hooks/useRecipes'

interface Props {
  ingredients: RecipeIngredientDraft[]
  onAllergenChange?: (summary: RecipeAllergenSummary) => void
}

export default function AllergenPanel({ ingredients, onAllergenChange }: Props) {
  // Compute allergens synchronously from the embedded allergen data on each ingredient.
  // "contains" overrides "may_contain" when both are present for the same allergen.
  const summary = useMemo((): RecipeAllergenSummary => {
    const containsIds = new Set<number>()
    const mayContainIds = new Set<number>()

    for (const ing of ingredients) {
      for (const { allergenId, status } of (ing.allergens ?? [])) {
        if (status === 'contains') {
          containsIds.add(allergenId)
          mayContainIds.delete(allergenId)
        } else if (status === 'may_contain' && !containsIds.has(allergenId)) {
          mayContainIds.add(allergenId)
        }
      }
    }

    return {
      contains:   EU_ALLERGENS.filter((a) => containsIds.has(a.id)),
      mayContain: EU_ALLERGENS.filter((a) => mayContainIds.has(a.id)),
    }
  }, [ingredients])

  // Notify parent (used to pass allergen data to PDF generator)
  useEffect(() => {
    onAllergenChange?.(summary)
  }, [summary]) // eslint-disable-line react-hooks/exhaustive-deps

  const hasIngredients = ingredients.length > 0
  const hasAllergens = summary.contains.length > 0 || summary.mayContain.length > 0

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Allergens</h3>
        <span className="text-xs text-slate-400">EU Reg. 1169/2011 — auto-calculated</span>
      </div>

      {!hasIngredients ? (
        <p className="text-xs text-slate-400">Add ingredients to see allergen information.</p>
      ) : !hasAllergens ? (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2">
          <span className="text-emerald-600">✓</span>
          <p className="text-xs font-medium text-emerald-700">
            No allergens detected. Tag ingredients with allergens on their detail pages.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {summary.contains.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-600">
                Contains
              </p>
              <div className="flex flex-wrap gap-1.5">
                {summary.contains.map((a) => (
                  <span
                    key={a.id}
                    className="flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700"
                  >
                    {a.icon} {a.shortName}
                  </span>
                ))}
              </div>
            </div>
          )}
          {summary.mayContain.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-600">
                May contain
              </p>
              <div className="flex flex-wrap gap-1.5">
                {summary.mayContain.map((a) => (
                  <span
                    key={a.id}
                    className="flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700"
                  >
                    {a.icon} {a.shortName}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
