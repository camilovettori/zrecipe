// Regression guard for AI recipe import inventing a recipe name. With no title
// in the source, the extraction prompt's JSON shape ("recipe_name": "string")
// pushed the model to return a made-up name instead of null — measured on
// claude-sonnet-4-6 with an untitled Portuguese recipe card: 5 of 10 runs
// returned "Receita sem nome" / "Receita sem título". A non-empty name skips
// the import modal's file-name fallback and is pre-filled as the recipe name.
// A section label ("Ingredients") is the same failure with a different string.
//
// The prompt lives in a route file (only route exports are allowed there), so —
// matching this repo's convention for such wiring — these inspect the source.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const repoRoot = join(import.meta.dirname, '..')
const routeSrc = readFileSync(join(repoRoot, 'src/app/api/recipes/extract/route.ts'), 'utf8')
const modalSrc = readFileSync(join(repoRoot, 'src/components/recipes/AiImportRecipeModal.tsx'), 'utf8')

const instructionMatch = routeSrc.match(/const TEXT_INSTRUCTION = `([\s\S]*?)`/)
assert.ok(instructionMatch, 'could not find TEXT_INSTRUCTION in the extract route')
const instruction = instructionMatch[1]

test('recipe_name is declared nullable, with null when the source has no title', () => {
  assert.match(instruction, /- recipe_name \(string \| null\)/)
  assert.match(instruction, /If the source has no title, return null\./)
})

test('section labels are explicitly ruled out as the recipe name, in English and Portuguese', () => {
  for (const label of ['Ingredients', 'Ingredientes', 'Method', 'Instructions', 'Directions', 'Modo de preparo']) {
    assert.ok(instruction.includes(`"${label}"`), `prompt does not rule out "${label}" as recipe_name`)
  }
  assert.match(instruction, /A section label is never the recipe name/)
})

test('made-up placeholder names are ruled out in favor of null', () => {
  assert.match(instruction, /Do not make up a placeholder name/)
  assert.ok(instruction.includes('"Receita sem nome"'), 'prompt should name the placeholder actually observed')
})

test('the JSON shape example no longer presents recipe_name as always a string', () => {
  const shape = instruction.slice(instruction.indexOf('Return ONLY valid JSON'))
  assert.match(shape, /"recipe_name": "string or null"/)
  assert.doesNotMatch(shape, /"recipe_name": "string",/)
})

test('a null recipe_name reaches the client as an empty string…', () => {
  assert.match(routeSrc, /recipe_name: parsed\.recipe_name \?\? ''/)
})

test('…which the import modal replaces with the file name', () => {
  assert.match(modalSrc, /setRecipeName\(data\.recipe_name\?\.trim\(\) \|\| file\.name\.replace\(/)
})
