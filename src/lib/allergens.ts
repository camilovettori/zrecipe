export type AllergenStatus = 'contains' | 'may_contain'

export interface Allergen {
  id: number
  name: string
  shortName: string
  icon: string
}

export interface IngredientAllergen {
  allergenId: number
  status: AllergenStatus
}

export interface RecipeAllergenSummary {
  contains: Allergen[]
  mayContain: Allergen[]
}

// Matches insertion order in the migration (SERIAL IDs 1-14)
export const EU_ALLERGENS: Allergen[] = [
  { id: 1,  name: 'Celery',                    shortName: 'Celery',     icon: '🥬' },
  { id: 2,  name: 'Cereals containing gluten', shortName: 'Gluten',     icon: '🌾' },
  { id: 3,  name: 'Crustaceans',               shortName: 'Crustaceans',icon: '🦐' },
  { id: 4,  name: 'Eggs',                      shortName: 'Eggs',       icon: '🥚' },
  { id: 5,  name: 'Fish',                      shortName: 'Fish',       icon: '🐟' },
  { id: 6,  name: 'Lupin',                     shortName: 'Lupin',      icon: '🌸' },
  { id: 7,  name: 'Milk',                      shortName: 'Milk',       icon: '🥛' },
  { id: 8,  name: 'Molluscs',                  shortName: 'Molluscs',   icon: '🦪' },
  { id: 9,  name: 'Mustard',                   shortName: 'Mustard',    icon: '🟡' },
  { id: 10, name: 'Nuts',                      shortName: 'Nuts',       icon: '🥜' },
  { id: 11, name: 'Peanuts',                   shortName: 'Peanuts',    icon: '🥜' },
  { id: 12, name: 'Sesame seeds',              shortName: 'Sesame',     icon: '🫘' },
  { id: 13, name: 'Soybeans',                  shortName: 'Soy',        icon: '🫘' },
  { id: 14, name: 'Sulphur dioxide/sulphites', shortName: 'Sulphites',  icon: '🧪' },
]

export function computeRecipeAllergens(
  ingredientAllergenMap: Record<string, IngredientAllergen[]>
): RecipeAllergenSummary {
  const containsIds = new Set<number>()
  const mayContainIds = new Set<number>()

  for (const allergens of Object.values(ingredientAllergenMap)) {
    for (const { allergenId, status } of allergens) {
      if (status === 'contains') {
        containsIds.add(allergenId)
        mayContainIds.delete(allergenId) // "contains" overrides "may contain"
      } else if (status === 'may_contain' && !containsIds.has(allergenId)) {
        mayContainIds.add(allergenId)
      }
    }
  }

  return {
    contains:   EU_ALLERGENS.filter((a) => containsIds.has(a.id)),
    mayContain: EU_ALLERGENS.filter((a) => mayContainIds.has(a.id)),
  }
}

export function formatAllergenSummaryText(summary: RecipeAllergenSummary): string {
  const parts: string[] = []
  if (summary.contains.length > 0) {
    parts.push(`Contains: ${summary.contains.map((a) => a.name).join(', ')}`)
  }
  if (summary.mayContain.length > 0) {
    parts.push(`May contain: ${summary.mayContain.map((a) => a.name).join(', ')}`)
  }
  return parts.join('. ')
}
