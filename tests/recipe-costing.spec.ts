import { expect, test } from 'playwright/test'
import { calculateCost, calculateIngredientCost } from '../src/lib/utils/cost-calculator'
import { computeLiveSubRecipeCost, type SubRecipeCostRow } from '../src/lib/recipes/subRecipeCost'

test.describe('missing ingredient price', () => {
  test('never priced (null) is flagged missing_price, not a real €0 cost', () => {
    const line = calculateIngredientCost({
      quantity: 100,
      unit: 'g',
      name: 'Truffle oil',
      current_price: null,
      price_unit: 'g',
    })
    expect(line.status).toBe('missing_price')
    expect(line.cost).toBe(0)
    expect(line.isCostComplete).toBe(false)
    expect(line.message).toBe('Needs price')
    expect(line.warning).toContain('Truffle oil')
  })

  test('an undefined current_price is treated the same as null (missing), not €0', () => {
    const line = calculateIngredientCost({
      quantity: 100,
      unit: 'g',
      name: 'Saffron',
      price_unit: 'g',
    })
    expect(line.status).toBe('missing_price')
    expect(line.isCostComplete).toBe(false)
    expect(line.message).toBe('Needs price')
  })

  test('an explicit price of exactly 0 is a genuine free ingredient, not "missing"', () => {
    const line = calculateIngredientCost({
      quantity: 50,
      unit: 'g',
      name: 'Tap water',
      current_price: 0,
      price_unit: 'g',
    })
    expect(line.status).toBe('ok')
    expect(line.isCostComplete).toBe(true)
    expect(line.isZeroPrice).toBe(true)
    expect(line.message).toBeUndefined()
    expect(line.cost).toBe(0)
    expect(line.warning).toBeUndefined()
  })

  test('a normal non-zero price is neither missing nor flagged as zero-priced', () => {
    const line = calculateIngredientCost({
      quantity: 50,
      unit: 'g',
      name: 'Butter',
      current_price: 0.01,
      price_unit: 'g',
    })
    expect(line.status).toBe('ok')
    expect(line.isCostComplete).toBe(true)
    expect(line.isZeroPrice).toBeFalsy()
    expect(line.cost).toBe(0.5)
  })

  test('recipe totals expose incompleteCost when any ingredient is missing a price', () => {
    const result = calculateCost({
      ingredients: [
        { id: 'a', name: 'Flour', quantity: 500, unit: 'g', current_price: 0.002, price_unit: 'g' },
        { id: 'b', name: 'Saffron', quantity: 2, unit: 'g', current_price: null, price_unit: 'g' },
      ],
      sellingPrice: 10,
      yieldQty: 1,
    })
    expect(result.hasMissingPrices).toBe(true)
    expect(result.hasUnitMismatches).toBe(false)
    expect(result.incompleteCost).toBe(true)
    expect(result.affectedLines.map((l) => l.id)).toEqual(['b'])
    // Margin/food-cost still compute a number, but callers must treat it as
    // unreliable via incompleteCost rather than presenting it as accurate.
    expect(result.ingredientCost).toBe(1) // 500g * 0.002 only — saffron excluded, not invented
  })
})

test.describe('unit-family mismatch', () => {
  test('recipe unit and price unit in different families never fake a €0 cost silently', () => {
    // Priced per litre, used by weight — grams and litres don't convert.
    const line = calculateIngredientCost({
      quantity: 200,
      unit: 'kg',
      name: 'Olive oil',
      current_price: 5,
      price_unit: 'L',
    })
    expect(line.status).toBe('unit_mismatch')
    expect(line.cost).toBe(0)
    expect(line.isCostComplete).toBe(false)
    expect(line.message).toBe('Unit mismatch')
    expect(line.warning).toMatch(/kg.*L|needs review/i)
  })

  test('recipe totals expose incompleteCost and hasUnitMismatches distinctly from hasMissingPrices', () => {
    const result = calculateCost({
      ingredients: [
        { id: 'a', name: 'Olive oil', quantity: 200, unit: 'kg', current_price: 5, price_unit: 'L' },
      ],
      sellingPrice: 10,
      yieldQty: 1,
    })
    expect(result.hasUnitMismatches).toBe(true)
    expect(result.hasMissingPrices).toBe(false)
    expect(result.incompleteCost).toBe(true)
  })
})

test.describe('normal valid recipe — unaffected by the new checks', () => {
  test('fully priced, unit-consistent recipe still calculates a real cost with no warnings', () => {
    const result = calculateCost({
      ingredients: [
        { id: 'a', name: 'Flour', quantity: 500, unit: 'g', current_price: 0.002, price_unit: 'g' },
        { id: 'b', name: 'Butter', quantity: 250, unit: 'g', current_price: 0.01, price_unit: 'g' },
      ],
      laborEnabled: true,
      laborMode: 'fixed',
      laborCostFixed: 2,
      sellingPrice: 8,
      yieldQty: 4,
    })
    expect(result.hasMissingPrices).toBe(false)
    expect(result.hasUnitMismatches).toBe(false)
    expect(result.incompleteCost).toBe(false)
    expect(result.hasZeroPricedIngredients).toBe(false)
    expect(result.affectedLines).toEqual([])
    expect(result.ingredientCost).toBe(3.5) // 1 + 2.5
    expect(result.totalCost).toBe(5.5) // + 2 fixed labor
    expect(result.costPerUnit).toBeCloseTo(1.375, 4)
  })

  test('an explicit €0 ingredient is surfaced via hasZeroPricedIngredients, not incompleteCost', () => {
    const result = calculateCost({
      ingredients: [
        { id: 'a', name: 'Flour', quantity: 500, unit: 'g', current_price: 0.002, price_unit: 'g' },
        { id: 'b', name: 'Tap water', quantity: 200, unit: 'g', current_price: 0, price_unit: 'g' },
      ],
      sellingPrice: 10,
      yieldQty: 1,
    })
    expect(result.hasZeroPricedIngredients).toBe(true)
    expect(result.hasMissingPrices).toBe(false)
    expect(result.incompleteCost).toBe(false)
  })
})

test.describe('live sub-recipe cost', () => {
  function baseSubRecipeRow(ingredientPrice: number): SubRecipeCostRow {
    return {
      id: 'sub-1',
      sub_ingredient_cost_per_unit: 0.5, // stale snapshot from an old save
      sub_ingredient_unit: 'kg',
      yield_quantity: 1,
      yield_unit: 'kg',
      recipe_ingredients: [
        {
          id: 'ri-1',
          quantity: 1000,
          unit: 'g',
          yield_percent: 100,
          ingredient: { current_price: ingredientPrice, price_unit: 'g' },
        },
      ],
    }
  }

  test('parent recipe cost recalculates live when the sub-recipe ingredient price changes', () => {
    const before = computeLiveSubRecipeCost(baseSubRecipeRow(0.01))
    const after = computeLiveSubRecipeCost(baseSubRecipeRow(0.02))

    expect(before.source).toBe('live')
    expect(after.source).toBe('live')
    expect(before.costPerUnit).toBe(10) // 1000g * 0.01/g = €10 per kg yield
    expect(after.costPerUnit).toBe(20) // price doubled -> live cost doubles too
    expect(after.costPerUnit).not.toBe(before.costPerUnit)
    // Neither number is the frozen snapshot (0.5) — live data always wins.
    expect(before.costPerUnit).not.toBe(0.5)
  })

  test('falls back to the stored snapshot (and flags it) when no live ingredient rows are available', () => {
    const row: SubRecipeCostRow = {
      id: 'sub-2',
      sub_ingredient_cost_per_unit: 3.25,
      sub_ingredient_unit: 'kg',
      yield_quantity: 1,
      yield_unit: 'kg',
      recipe_ingredients: [],
    }
    const result = computeLiveSubRecipeCost(row)
    expect(result.source).toBe('snapshot')
    expect(result.costPerUnit).toBe(3.25)
  })

  test('reports unavailable (not a fake number) when neither live data nor a snapshot exist', () => {
    const row: SubRecipeCostRow = {
      id: 'sub-3',
      sub_ingredient_cost_per_unit: null,
      sub_ingredient_unit: 'kg',
      recipe_ingredients: [],
    }
    const result = computeLiveSubRecipeCost(row)
    expect(result.source).toBe('unavailable')
    expect(result.costPerUnit).toBeNull()
  })

  test('a sub-recipe whose own ingredients are incomplete is flagged live_incomplete, not silently ok', () => {
    const row: SubRecipeCostRow = {
      id: 'sub-4',
      sub_ingredient_cost_per_unit: 1,
      sub_ingredient_unit: 'kg',
      yield_quantity: 1,
      yield_unit: 'kg',
      recipe_ingredients: [
        { id: 'ri-1', quantity: 500, unit: 'g', ingredient: { current_price: 0.01, price_unit: 'g' } },
        { id: 'ri-2', quantity: 10, unit: 'g', ingredient: { current_price: null, price_unit: 'g' } },
      ],
    }
    const result = computeLiveSubRecipeCost(row)
    expect(result.source).toBe('live_incomplete')
    expect(result.costPerUnit).toBe(5) // only the priced ingredient counted
  })
})
