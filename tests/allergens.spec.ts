import { expect, test } from 'playwright/test'
import {
  createIngredientAllergenRows,
  normalizeIngredientAllergenSelection,
} from '../src/lib/allergens'

test.describe('ingredient allergen persistence payload', () => {
  test('includes tenant ownership on every row', () => {
    const rows = createIngredientAllergenRows('ingredient-1', 'tenant-1', [
      { allergenId: 4, status: 'contains' },
      { allergenId: 7, status: 'may_contain' },
    ])

    expect(rows).toEqual([
      {
        ingredient_id: 'ingredient-1',
        allergen_id: 4,
        status: 'contains',
        tenant_id: 'tenant-1',
      },
      {
        ingredient_id: 'ingredient-1',
        allergen_id: 7,
        status: 'may_contain',
        tenant_id: 'tenant-1',
      },
    ])
  })

  test('deduplicates allergens and rejects invalid selections', () => {
    const selection = normalizeIngredientAllergenSelection([
      { allergenId: 7, status: 'contains' },
      { allergenId: 7, status: 'may_contain' },
      { allergenId: 0, status: 'contains' },
      { allergenId: 4, status: 'invalid' as 'contains' },
    ])

    expect(selection).toEqual([{ allergenId: 7, status: 'may_contain' }])
  })
})
