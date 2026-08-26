// Regression guard for the kitchen-card silent-truncation bug reported on
// "Lemon Peanut Butter Meringue Cups" (method step 4 was cut off mid-sentence
// because overflow:hidden clipped rendered pixels — a JS-level guess about
// font size, never a measurement, decided what got clipped).
//
// buildKitchenCardHtml itself never had a DOM to measure against — that's
// KitchenCardOptionsModal's job (a hidden iframe drives the shrink/measure/
// paginate loop). What these tests hold buildKitchenCardHtml to is the
// contract the measurement loop depends on:
//   - it never drops text, at any sizing the loop might choose
//   - its floor clamp actually holds for every protected field
//   - its paginated CSS actually removes the clipping/anti-break rules
//   - its default (no override) output is byte-identical to before this fix
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildKitchenCardHtml,
  DEFAULT_KITCHEN_CARD_OPTIONS,
  DENSE_MIN_SCALE,
  pickSizeTier,
  type KitchenCardData,
  type ResolvedKitchenCardSizing,
} from '../src/lib/print/kitchenCard'

const LONG_METHOD_STEPS = [
  'Cream the butter and sugar together in a stand mixer until pale and fluffy, scraping down the sides of the bowl twice to make sure nothing is left unmixed at the bottom.',
  'Add the eggs one at a time, beating well after each addition, then mix in the vanilla extract and lemon zest until the batter is smooth and fully combined.',
  'Fold in the sifted flour, baking powder and salt in three additions, alternating with the buttermilk, mixing on low speed just until no streaks of flour remain.',
  'Divide the batter evenly between the prepared cups and bake at 175C for 18-20 minutes, until a skewer inserted into the centre comes out clean and the tops spring back.',
  'Let the cups cool completely on a wire rack before piping the peanut butter filling into the centre of each one using a small round piping tip.',
  'Whisk the egg whites and sugar over a double boiler until the sugar fully dissolves and the mixture is warm to the touch, then whip to stiff, glossy peaks.',
  'Pipe the meringue generously over the top of each filled cup in a swirled peak, making sure to fully cover the peanut butter filling underneath.',
  'Finish by lightly torching the meringue peaks until golden in spots, then chill for at least 30 minutes before serving so the filling can set firm enough to hold its shape.',
]
const FINAL_STEP_CLOSING_WORDS = 'set firm enough to hold its shape.'

function makeData(overrides: Partial<KitchenCardData> = {}): KitchenCardData {
  return {
    name: 'Lemon Peanut Butter Meringue Cups',
    category: 'Dessert',
    yieldQuantity: 12,
    yieldUnit: 'cups',
    prepTimeMinutes: 35,
    cookTimeMinutes: 20,
    imageUrls: [],
    description: 'A bright, tangy lemon cup base topped with a peanut butter core and torched meringue.',
    ingredients: Array.from({ length: 14 }, (_, i) => ({
      name: `Ingredient ${i + 1}`,
      quantity: String(100 + i * 10),
      unit: 'g',
      notes: i % 2 === 0 ? `Room temperature, sifted if needed for ingredient ${i + 1}` : '',
    })),
    instructions: LONG_METHOD_STEPS,
    allergensContains: ['egg', 'milk', 'peanut'],
    allergensMayContain: ['tree nuts'],
    batchLabel: null,
    batchMultiplier: 1,
    ...overrides,
  }
}

const LOGO_URL = 'https://example.com/logo.png'

// ── (a) full final instruction text always survives ────────────────────────

test('a long-method recipe never loses the final instruction — full closing words present at default sizing', () => {
  const data = makeData()
  const html = buildKitchenCardHtml(data, DEFAULT_KITCHEN_CARD_OPTIONS, LOGO_URL)
  assert.ok(
    html.includes(FINAL_STEP_CLOSING_WORDS),
    'final instruction text is missing from the generated HTML at default sizing'
  )
})

test('the final instruction survives at the dense floor scale, and even when paginated', () => {
  const data = makeData()
  const floorSizing: ResolvedKitchenCardSizing = { tier: 'dense', scale: DENSE_MIN_SCALE, paginate: false }
  const paginatedSizing: ResolvedKitchenCardSizing = { tier: 'dense', scale: DENSE_MIN_SCALE, paginate: true }

  const floorHtml = buildKitchenCardHtml(data, DEFAULT_KITCHEN_CARD_OPTIONS, LOGO_URL, false, floorSizing)
  const paginatedHtml = buildKitchenCardHtml(data, DEFAULT_KITCHEN_CARD_OPTIONS, LOGO_URL, false, paginatedSizing)

  assert.ok(floorHtml.includes(FINAL_STEP_CLOSING_WORDS), 'final instruction missing at the floor scale')
  assert.ok(paginatedHtml.includes(FINAL_STEP_CLOSING_WORDS), 'final instruction missing in the paginated output')
})

// ── (b) body font-size never drops below the 10px floor ────────────────────

function extractFontSizePx(css: string, selector: string): number {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(escaped + '\\s*\\{[^}]*?font-size:(\\d+(?:\\.\\d+)?)px')
  const match = css.match(re)
  assert.ok(match, `selector not found in generated CSS: ${selector}`)
  return Number(match![1])
}

test('sizing never emits a body font-size below the 10px floor, even at an extreme scale', () => {
  const data = makeData()
  // Force a scale far below DENSE_MIN_SCALE to prove the clamp — not just the
  // search loop's own restraint — is what holds the floor.
  const extreme: ResolvedKitchenCardSizing = { tier: 'dense', scale: 0.2, paginate: false }
  const html = buildKitchenCardHtml(data, DEFAULT_KITCHEN_CARD_OPTIONS, LOGO_URL, false, extreme)

  assert.ok(extractFontSizePx(html, 'ol.method li') >= 10, 'methodLi below floor')
  assert.ok(extractFontSizePx(html, 'table.ingredients td') >= 10, 'ingName below floor')
  assert.ok(extractFontSizePx(html, '.notes-text') >= 10, 'notesText below floor')
  assert.ok(extractFontSizePx(html, 'ul.notes-list li') >= 10, 'notesListLi below floor')
  assert.ok(extractFontSizePx(html, '.shopping-name') >= 10, 'shoppingName below floor')
})

test('the floor scale (DENSE_MIN_SCALE) lands exactly at 10px for the smallest body field, never under', () => {
  const data = makeData()
  const floorSizing: ResolvedKitchenCardSizing = { tier: 'dense', scale: DENSE_MIN_SCALE, paginate: false }
  const html = buildKitchenCardHtml(data, DEFAULT_KITCHEN_CARD_OPTIONS, LOGO_URL, false, floorSizing)

  const sizes = [
    extractFontSizePx(html, 'ol.method li'),
    extractFontSizePx(html, 'table.ingredients td'),
    extractFontSizePx(html, '.notes-text'),
    extractFontSizePx(html, 'ul.notes-list li'),
    extractFontSizePx(html, '.shopping-name'),
  ]
  for (const size of sizes) {
    assert.ok(size >= 9.999, `body field rendered below floor: ${size}px`)
  }
  assert.ok(Math.min(...sizes) <= 10.001, 'DENSE_MIN_SCALE should bring the smallest body field to exactly the floor')
})

// ── (c) paginated CSS drops the clipping / anti-break rules ────────────────

test('when content is paginated, generated CSS has no overflow:hidden on .page and no break-after:avoid', () => {
  const data = makeData()
  const paginatedSizing: ResolvedKitchenCardSizing = { tier: 'dense', scale: DENSE_MIN_SCALE, paginate: true }
  const html = buildKitchenCardHtml(data, DEFAULT_KITCHEN_CARD_OPTIONS, LOGO_URL, false, paginatedSizing)

  assert.doesNotMatch(html, /\.page\s*\{[^}]*overflow:hidden/, 'paginated .page must not clip content')
  assert.doesNotMatch(html, /break-after:avoid/, 'paginated output must not forbid a second page')
  assert.doesNotMatch(html, /page-break-after:avoid/, 'paginated output must not forbid a second page (legacy prop)')
})

test('paginated portrait output also drops overflow:hidden on .page', () => {
  const data = makeData()
  const options = { ...DEFAULT_KITCHEN_CARD_OPTIONS, orientation: 'portrait' as const }
  const paginatedSizing: ResolvedKitchenCardSizing = { tier: 'dense', scale: DENSE_MIN_SCALE, paginate: true }
  const html = buildKitchenCardHtml(data, options, LOGO_URL, false, paginatedSizing)

  assert.doesNotMatch(html, /\.page\s*\{[^}]*overflow:hidden/)
  assert.doesNotMatch(html, /break-after:avoid/)
})

// ── (d) fitting content: single-page CSS unchanged from today ──────────────

test('when content fits (no override), the single-page CSS is unchanged — same overflow:hidden/break-after:avoid guards as before', () => {
  const data = makeData({ instructions: ['One short step.'], ingredients: [] })
  const html = buildKitchenCardHtml(data, DEFAULT_KITCHEN_CARD_OPTIONS, LOGO_URL)

  assert.match(html, /\.page\s*\{[^}]*overflow:hidden/, 'default single-page output should still clip via .page')
  assert.match(html, /break-after:avoid/, 'default single-page output should still forbid a second page')
  assert.match(html, /page-break-after:avoid/)
})

test('an explicit sizingOverride matching the heuristic tier at scale 1 produces byte-identical output to omitting the override', () => {
  const data = makeData({ instructions: ['One short step.'], ingredients: [] })
  const tier = pickSizeTier(data, DEFAULT_KITCHEN_CARD_OPTIONS)
  const explicit: ResolvedKitchenCardSizing = { tier, scale: 1, paginate: false }

  const defaultHtml = buildKitchenCardHtml(data, DEFAULT_KITCHEN_CARD_OPTIONS, LOGO_URL)
  const explicitHtml = buildKitchenCardHtml(data, DEFAULT_KITCHEN_CARD_OPTIONS, LOGO_URL, false, explicit)

  assert.equal(explicitHtml, defaultHtml)
})

// ── (e) allergen text size is never below the body floor ───────────────────

test('allergen text size is never below the body floor, even at an extreme scale', () => {
  const data = makeData()
  const extreme: ResolvedKitchenCardSizing = { tier: 'dense', scale: 0.2, paginate: false }
  const html = buildKitchenCardHtml(data, DEFAULT_KITCHEN_CARD_OPTIONS, LOGO_URL, false, extreme)

  const allergenContains = extractFontSizePx(html, '.allergen-contains')
  const allergenMay = extractFontSizePx(html, '.allergen-may')
  assert.ok(allergenContains >= 10, `allergen-contains below floor: ${allergenContains}px`)
  assert.ok(allergenMay >= 10, `allergen-may below floor: ${allergenMay}px`)

  // "must never become the smallest thing on the card" — never smaller than
  // the body-text floor fields at the same sizing.
  const methodLi = extractFontSizePx(html, 'ol.method li')
  assert.ok(allergenContains >= methodLi - 0.001)
  assert.ok(allergenMay >= methodLi - 0.001)
})

test('the meta bar (badge) and title also never drop below the floor at an extreme scale', () => {
  const data = makeData()
  const extreme: ResolvedKitchenCardSizing = { tier: 'dense', scale: 0.2, paginate: false }
  const html = buildKitchenCardHtml(data, DEFAULT_KITCHEN_CARD_OPTIONS, LOGO_URL, false, extreme)

  assert.ok(extractFontSizePx(html, '.badge') >= 10)
  assert.ok(extractFontSizePx(html, '.title') >= 10)
})
