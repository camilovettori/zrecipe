// Regression baseline for the matching engine extracted from
// AiImportRecipeModal.tsx into src/lib/matching/nameTokenMatch.ts (Square
// Phase 1, Step 1). These fixtures capture the exact behavior the inline
// version had before extraction — word-order independence, singularization,
// ingredient aliasing, and the 3/2/1 ranking scores — so a future change to
// this shared module can't silently drift for either caller (ingredient
// import matching, or Square-item-to-recipe matching).
import test from 'node:test'
import assert from 'node:assert/strict'
import { findCandidateMatch, nameTokens, rankCandidates, tokenKey } from '../src/lib/matching/nameTokenMatch'

type Candidate = { name: string }

test('tokenKey is word-order independent', () => {
  assert.equal(tokenKey('salted butter'), tokenKey('Butter Salted'))
})

test('tokenKey singularizes trailing s on long-enough words only', () => {
  assert.deepEqual(nameTokens('eggs'), ['egg'])
  assert.deepEqual(nameTokens('gas'), ['gas']) // too short to strip (length <= 3)
})

test('tokenKey applies ingredient name aliases before tokenizing', () => {
  assert.equal(tokenKey('Confectioners Sugar'), tokenKey('Icing Sugar'))
  assert.equal(tokenKey('Baking Soda'), tokenKey('Bicarbonate of Soda'))
})

test('findCandidateMatch auto-matches only when exactly one candidate shares the token key', () => {
  const candidates: Candidate[] = [{ name: 'Salted Butter' }, { name: 'Plain Flour' }]
  assert.equal(findCandidateMatch('Butter Salted', candidates), candidates[0])
  assert.equal(findCandidateMatch('Sugar', candidates), undefined)
})

test('findCandidateMatch stays unmatched (ambiguous) when two candidates share the same token key', () => {
  const candidates: Candidate[] = [{ name: 'Vanilla Extract' }, { name: 'Extract Vanilla' }]
  assert.equal(findCandidateMatch('vanilla extract', candidates), undefined)
})

test('rankCandidates scores an exact token-set match (any order) as 3, highest', () => {
  const candidates: Candidate[] = [
    { name: 'Croissant' },
    { name: 'Chocolate Croissant' },
    { name: 'Croissant Chocolate' },
  ]
  const ranked = rankCandidates('Chocolate Croissant', candidates)
  assert.equal(ranked[0].name, 'Chocolate Croissant')
  // The word-order-swapped exact match ties at score 3 too — both must
  // outrank the plain "Croissant" partial match.
  assert.ok(ranked.slice(0, 2).some((c) => c.name === 'Croissant Chocolate'))
  assert.equal(ranked[ranked.length - 1].name, 'Croissant')
})

test('rankCandidates scores a superset match (all query tokens present) as 2', () => {
  const candidates: Candidate[] = [{ name: 'Sourdough Loaf' }]
  const ranked = rankCandidates('Sourdough', candidates)
  assert.equal(ranked.length, 1)
  assert.equal(ranked[0].name, 'Sourdough Loaf')
})

test('rankCandidates scores a substring-token match as 1, lowest, still returned', () => {
  const candidates: Candidate[] = [{ name: 'Sourdough Baguette' }]
  const ranked = rankCandidates('Sour', candidates)
  assert.equal(ranked.length, 1)
  assert.equal(ranked[0].name, 'Sourdough Baguette')
})

test('rankCandidates excludes non-matches entirely (score 0 is filtered out)', () => {
  const candidates: Candidate[] = [{ name: 'Croissant' }, { name: 'Bagel' }]
  const ranked = rankCandidates('Muffin', candidates)
  assert.deepEqual(ranked, [])
})

test('rankCandidates with an empty query falls back to alphabetical, respecting limit', () => {
  const candidates: Candidate[] = [{ name: 'Zucchini Bread' }, { name: 'Apple Pie' }, { name: 'Banana Bread' }]
  const ranked = rankCandidates('', candidates, 2)
  assert.deepEqual(ranked.map((c) => c.name), ['Apple Pie', 'Banana Bread'])
})

test('rankCandidates is generic over any named candidate type, not just the ingredient-import shape', () => {
  type RecipeCandidate = { name: string; id: string; costPerUnit: number }
  const candidates: RecipeCandidate[] = [
    { id: 'r1', name: 'Sourdough Loaf', costPerUnit: 1.2 },
    { id: 'r2', name: 'Croissant', costPerUnit: 0.6 },
  ]
  const ranked = rankCandidates('Sourdough', candidates)
  assert.equal(ranked[0].id, 'r1')
})
