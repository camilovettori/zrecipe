// Regression guard for a data-loss bug: the recipe save route used to
// `.delete()` all recipe_ingredients then `.insert()` the new set as two
// separate PostgREST calls. If the insert failed after the delete committed,
// a recipe's ingredients were gone for good. Fixed by wrapping delete+insert
// in a single save_recipe_ingredients() RPC (one Postgres transaction) — see
// supabase/migrations/20260806100000_atomic_recipe_ingredients_save.sql.
// There's no live-Supabase test infra in this repo, so this checks the
// actual source text of the route rather than exercising a real save.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const repoRoot = join(import.meta.dirname, '..')
const src = readFileSync(join(repoRoot, 'src/app/api/recipes/save/route.ts'), 'utf8')

test('recipe save route calls the atomic save_recipe_ingredients RPC', () => {
  assert.match(
    src,
    /admin[^)]*\)?\s*\.rpc\(\s*['"]save_recipe_ingredients['"]/,
    'expected route.ts to call admin.rpc(\'save_recipe_ingredients\', ...)'
  )
})

test('recipe save route no longer does a standalone delete on recipe_ingredients', () => {
  assert.doesNotMatch(
    src,
    /\.from\(['"]recipe_ingredients['"]\)\s*\.delete\(\)/,
    'found a direct .from(\'recipe_ingredients\').delete() call outside the atomic RPC — ' +
      'this reintroduces the delete-then-insert data-loss bug'
  )
})

test('RPC ingredient payload is passed as a plain array, not JSON.stringify\'d', () => {
  const rpcCallMatch = src.match(/admin[^)]*\)?\s*\.rpc\(\s*['"]save_recipe_ingredients['"][\s\S]*?\)\s*$/m)
  assert.ok(rpcCallMatch, 'expected to find the save_recipe_ingredients rpc call block')

  const rpcBlockStart = src.indexOf(rpcCallMatch![0])
  const rpcBlock = src.slice(rpcBlockStart, rpcBlockStart + 400)

  assert.doesNotMatch(
    rpcBlock,
    /p_ingredients:\s*JSON\.stringify/,
    'p_ingredients must be passed as a plain JS array — PostgREST already JSON-encodes rpc params, ' +
      'so JSON.stringify()-ing it here double-encodes it into a jsonb scalar string, ' +
      'breaking jsonb_array_length() in the function body'
  )
})
