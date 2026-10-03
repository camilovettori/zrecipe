// Coverage for "Product code" on manual ingredient creation (IngredientForm's
// /ingredients/new flow and the in-recipe NewIngredientModal flow).
//
// linkSupplierCodeToNewIngredient() is exercised for real against a fake
// Supabase client. The form/modal wiring is checked structurally against the
// source — no jsdom/testing-library runner exists in this repo, matching
// priceHistoryEntryDelete.test.ts / newIngredientModalDuplicateCheck.test.ts.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  linkSupplierCodeToNewIngredient,
  supplierCodeLinkNotice,
} from '../src/lib/ingredients/linkSupplierCode'

const repoRoot = join(import.meta.dirname, '..')
// Normalize CRLF so multi-line markers match on Windows checkouts too.
const read = (p: string) => readFileSync(join(repoRoot, p), 'utf8').replace(/\r\n/g, '\n')

type InsertCall = { table: string; row: Record<string, unknown> }
function fakeSupabase(result: { error: { code?: string; message: string } | null } | Error) {
  const calls: InsertCall[] = []
  const client = {
    from(table: string) {
      return {
        insert(row: Record<string, unknown>) {
          calls.push({ table, row })
          if (result instanceof Error) return Promise.reject(result)
          return Promise.resolve(result)
        },
      }
    },
  }
  return { client: client as unknown as Parameters<typeof linkSupplierCodeToNewIngredient>[0], calls }
}

const base = { tenantId: 't1', supplierId: 's1', ingredientId: 'i1' }

// ── The write itself ──────────────────────────────────────────────────────

test('inserts the (supplier, code) → ingredient row with the trimmed code', async () => {
  const { client, calls } = fakeSupabase({ error: null })
  const result = await linkSupplierCodeToNewIngredient(client, { ...base, productCode: '  BUT-250 ' })
  assert.equal(result, 'saved')
  assert.deepEqual(calls, [{
    table: 'ingredient_supplier_codes',
    row: { tenant_id: 't1', supplier_id: 's1', ingredient_id: 'i1', product_code: 'BUT-250' },
  }])
})

test('a blank code or a missing supplier writes nothing (supplier_id is NOT NULL)', async () => {
  for (const args of [
    { ...base, productCode: '   ' },
    { ...base, productCode: '' },
    { ...base, supplierId: null, productCode: 'BUT-250' },
  ]) {
    const { client, calls } = fakeSupabase({ error: null })
    assert.equal(await linkSupplierCodeToNewIngredient(client, args), 'skipped')
    assert.equal(calls.length, 0)
  }
})

test('a code already linked for that supplier is reported, never re-pointed', async () => {
  const { client, calls } = fakeSupabase({ error: { code: '23505', message: 'duplicate key' } })
  assert.equal(await linkSupplierCodeToNewIngredient(client, { ...base, productCode: 'BUT-250' }), 'duplicate')
  // A plain insert (no upsert / onConflict) — the existing mapping stays put.
  assert.equal(calls.length, 1)
})

test('any other failure is reported, and never throws — ingredient creation must not fail', async () => {
  const errored = fakeSupabase({ error: { code: '42501', message: 'permission denied' } })
  assert.equal(await linkSupplierCodeToNewIngredient(errored.client, { ...base, productCode: 'X' }), 'failed')
  const thrown = fakeSupabase(new Error('network down'))
  assert.equal(await linkSupplierCodeToNewIngredient(thrown.client, { ...base, productCode: 'X' }), 'failed')
})

test('only duplicate / failed outcomes produce a user notice, naming the code', () => {
  assert.equal(supplierCodeLinkNotice('saved', 'BUT-250'), null)
  assert.equal(supplierCodeLinkNotice('skipped', 'BUT-250'), null)
  assert.match(supplierCodeLinkNotice('duplicate', 'BUT-250')!.title, /BUT-250/)
  assert.match(supplierCodeLinkNotice('failed', 'BUT-250')!.title, /BUT-250/)
})

// ── Wiring: IngredientForm (/ingredients/new) ─────────────────────────────

const formSrc = read('src/components/ingredients/IngredientForm.tsx')

test('IngredientForm links the code only in the create branch, after the ingredient insert', () => {
  const createBranch = formSrc.slice(formSrc.indexOf('} else {\n          const tenantId = await resolveTenantId()'))
  const insertIdx = createBranch.indexOf(".from('ingredients')")
  const linkIdx = createBranch.indexOf('linkSupplierCodeToNewIngredient(')
  const pushIdx = createBranch.indexOf('router.push(`/ingredients/${newId}`)')
  assert.ok(insertIdx !== -1 && linkIdx > insertIdx && linkIdx < pushIdx,
    'code must be linked after the ingredient insert and before navigating away')
  assert.match(createBranch.slice(0, pushIdx), /limits\.canUseSupplierCodes/)
  assert.match(createBranch.slice(0, pushIdx), /supplierId: resolvedSupplierId/)
})

test('IngredientForm shows the Product code field only when creating, gated on canUseSupplierCodes', () => {
  assert.match(formSrc, /\{!isExisting && \(\s*limits\.canUseSupplierCodes \?/)
  // Disabled until a supplier is entered (selected, or typed to be created on save).
  assert.match(formSrc, /disabled=\{!supplierQuery\.trim\(\)\}/)
})

// ── Wiring: NewIngredientModal → RecipeBuilder.createIngredient ───────────

const modalSrc = read('src/components/recipes/NewIngredientModal.tsx')
const builderSrc = read('src/components/recipes/RecipeBuilder.tsx')

test('NewIngredientModal passes the code only with a resolved supplier on a Pro-tier plan', () => {
  assert.match(modalSrc, /productCode\?: string/)
  assert.match(modalSrc, /productCode:\s*limits\.canUseSupplierCodes && resolvedSupplierId/)
  assert.match(modalSrc, /disabled=\{!supplierQuery\.trim\(\)\}/)
})

test('RecipeBuilder.createIngredient links the code after the ingredient insert, best-effort', () => {
  const start = builderSrc.indexOf('const createIngredient = async (formData: NewIngredientFormData) => {')
  const body = builderSrc.slice(start, builderSrc.indexOf('const removeIngredient = (id: string) => {', start))
  const insertIdx = body.indexOf(".from('ingredients')")
  const linkIdx = body.indexOf('linkSupplierCodeToNewIngredient(')
  // The call itself, at the start of its line — an earlier comment mentions "addIngredient()'s".
  const addIdx = body.indexOf('\n      addIngredient(')
  assert.ok(insertIdx !== -1 && linkIdx > insertIdx && linkIdx < addIdx)
  assert.match(body, /limits\.canUseSupplierCodes/)
})
