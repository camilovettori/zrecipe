// Shared name-token matching engine, extracted verbatim (same logic, same
// scoring) from AiImportRecipeModal.tsx so it can be reused for a second
// candidate type (recipes, for Square-item-to-recipe mapping) without
// duplicating it — the exact kind of drift that duplicating
// src/lib/square/auth.ts's tenant-lookup logic already caused once.
//
// Generic over any candidate with a `name` — the original functions never
// read anything else off a candidate (kind/price fields were untouched), so
// genericizing the type signature does not change behavior.

export type NamedCandidate = { name: string }

function normalizeName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const INGREDIENT_NAME_ALIASES: Record<string, string> = {
  'all purpose flour': 'plain flour',
  'all purpose wheat flour': 'plain flour',
  'baking soda': 'bicarbonate of soda',
  'confectioners sugar': 'icing sugar',
  'confectioner sugar': 'icing sugar',
  'full cream milk': 'whole milk',
  'full fat milk': 'whole milk',
  'powdered sugar': 'icing sugar',
  'sodium bicarbonate': 'bicarbonate of soda',
  'superfine sugar': 'caster sugar',
}

function canonicalIngredientName(value: string) {
  const normalized = normalizeName(value)
  return INGREDIENT_NAME_ALIASES[normalized] ?? normalized
}

// Conservative, symmetric: only strips a trailing "s" on words long enough
// that it's unlikely to be part of the root word itself.
function singularizeToken(t: string) {
  return t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t
}

export function nameTokens(name: string): string[] {
  return canonicalIngredientName(name).split(' ').filter(Boolean).map(singularizeToken)
}

// Order-independent identity for a name: same words in any order produce
// the same key, so "salted butter" and "Butter Salted" are equivalent.
export function tokenKey(name: string): string {
  return Array.from(new Set(nameTokens(name))).sort().join(' ')
}

/**
 * Match by name only (word-order independent), case-insensitive. Only
 * auto-matches when exactly one candidate shares the same token key —
 * ambiguous cases stay unmatched so the caller can offer a choice instead.
 */
export function findCandidateMatch<T extends NamedCandidate>(name: string, candidates: T[]): T | undefined {
  const key = tokenKey(name)
  if (!key) return undefined
  const sameKey = candidates.filter((candidate) => tokenKey(candidate.name) === key)
  return sameKey.length === 1 ? sameKey[0] : undefined
}

/**
 * Ranked, token-aware search: 3 = identical token set (any order), 2 = every
 * query token is a member of the candidate's token set, 1 = some query token
 * is a substring of some candidate token.
 */
export function rankCandidates<T extends NamedCandidate>(query: string, candidates: T[], limit = 8): T[] {
  const queryTokens = nameTokens(query)
  if (queryTokens.length === 0) {
    return [...candidates].sort((a, b) => a.name.localeCompare(b.name)).slice(0, limit)
  }

  const queryKey = tokenKey(query)

  return candidates
    .map((candidate) => {
      const candidateTokens = nameTokens(candidate.name)
      const candidateTokenSet = new Set(candidateTokens)

      let score = 0
      if (tokenKey(candidate.name) === queryKey) score = 3
      else if (queryTokens.every((t) => candidateTokenSet.has(t))) score = 2
      else if (queryTokens.some((qt) => candidateTokens.some((ct) => ct.includes(qt)))) score = 1

      return { candidate, score }
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.candidate.name.localeCompare(b.candidate.name))
    .slice(0, limit)
    .map(({ candidate }) => candidate)
}
