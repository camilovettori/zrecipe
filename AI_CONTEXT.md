# ZRecipe — AI Context Brief

This file is a project briefing for AI assistants working on this codebase (not
human-facing setup docs — see `README.md` for that, and `CLAUDE.md` for
Claude-Code-specific behavioral rules). Read this before making changes.

## What ZRecipe is

A premium food-costing SaaS for bakeries, cafés, restaurants, and food
businesses. It is **not** a generic recipe app — the core promise is:

> Know the real cost and margin of every recipe as supplier prices change.

Primary workflow: import supplier invoices → AI extracts line items → update
ingredient price history → recalculate recipe costs → show margin/profit
impact → print kitchen cards and allergen labels.

## Tech stack

- Next.js 16 (App Router, Turbopack) — **breaking changes vs. training data**;
  check `node_modules/next/dist/docs/` before assuming an API still works
  the way it used to.
- TypeScript, Tailwind CSS 3
- React 19
- Supabase (Postgres, Auth, RLS, Storage) via `@supabase/supabase-js` +
  `@supabase/ssr`
- Claude API (`@anthropic-ai/sdk`) for invoice/recipe extraction and AI
  insights — model constant `CLAUDE_MODEL` in
  `src/app/api/invoices/extract/route.ts`
- Stripe for billing, Resend for transactional email
- `pdfjs-dist` for client-side PDF text/image rendering (no server-side PDF
  rasterization library — deliberately, to avoid native-module build risk on
  Vercel serverless)

## Design language (do not deviate without asking)

Warm paper / soft white backgrounds, emerald accents, soft borders, rounded
cards, subtle shadows, Playfair Display headings, DM Sans body. No generic
admin-template look, no heavy colors, no Windows-style UI. Preserve existing
layout structure when polishing — improve hierarchy/spacing/copy, don't
redesign.

## Repo map

```
src/app/(dashboard)/        Authenticated app pages (recipes, ingredients,
                             invoices, suppliers, reports, settings, ...)
src/app/api/                Route handlers — see list below
src/components/             UI components, grouped by feature
src/lib/                    Pure business logic + Supabase client wrappers
  invoices.ts                Invoice/costing domain logic — unit conversion,
                              quantity-evidence resolution, pricing math,
                              post-extraction validation. THE place to look
                              for costing formulas.
  invoices-client.ts          Client-only PDF rendering + item normalization
  supabase/admin.ts           Service-role client (bypasses RLS)
  supabase/client.ts          Browser client (RLS-scoped)
  supabase/server.ts          Server-component client (RLS-scoped)
supabase/migrations/        34 migrations — no consolidated schema.sql; the
                             base schema predates migration tracking, so
                             some columns/tables won't show up in a grep here
tests/                      node:test files, run via `npm test`
```

Key API routes:
- `invoices/extract` — the AI extraction pipeline (biggest, most
  business-logic-dense route in the app)
- `invoices/save` — persists a reviewed invoice + items
- `recipes/save` — persists a recipe + its ingredients (atomic RPC, see below)
- `recipes/extract` — AI recipe-import (ingredients/instructions only, never
  invents prices)
- `ingredients/supplier-import`, `ai/recipe-ideas`, `reports/insights`,
  `billing/*`, `team/*`

## Data model essentials

Multi-tenant: every table is scoped by `tenant_id`, enforced by RLS. Server
routes mostly use the **admin (service-role) client**, which bypasses RLS —
tenant scoping in those routes is done explicitly in application code
(`.eq('tenant_id', tenantId)`), not inherited from RLS.

Core tables: `recipes`, `recipe_ingredients`, `ingredients`,
`ingredient_price_history`, `ingredient_supplier_codes`, `invoices`,
`invoice_items`, `invoice_item_memory` (remembers user corrections per
supplier+description), `suppliers`, `tenants`, `tenant_users`, `ai_usage`.

## Non-negotiable costing rules

These are enforced by both the AI extraction prompt and deterministic code —
**never relax them just because a prompt seems verbose**:

1. **Invoice line price ≠ ingredient normalized price.** The invoice line
   total preserves what's on the invoice; `ingredients.current_price` is the
   separately-normalized price used in recipe costing.
2. **Ingredient identity = name.** Brand/supplier belong to price history,
   not identity.
3. **Unit families are sealed.** weight (g/kg) / volume (ml/L) / count
   (unit/dozen) never cross without an explicit density. Unsafe conversion →
   `Needs Review`, never a faked value. See `getInvoiceUnitFamily`,
   `resolveInvoiceIngredientPricing` in `src/lib/invoices.ts`.
4. Missing `package_unit` never silently defaults to kg.
5. Sub-recipe costing: `costPerBaseUnit = totalRecipeCost / recipeWeightInBaseUnit`;
   `parentRecipeCost = costPerBaseUnit * usedQuantityInBaseUnit`.
6. A recipe marked `is_sub_ingredient` hides selling price/VAT/margin/profit —
   shows internal cost only.
7. "Needs price" is **derived state** (`current_price` null/zero or no valid
   selected price history row) — never a stored boolean flag.

## AI extraction: the "documentary evidence" principle

This is the most important architectural pattern in the codebase, and it has
been the subject of several real bugs/fixes. Internalize it before touching
`invoices/extract/route.ts` or `InvoiceEditor.tsx`:

- **Claude's raw JSON output for price/total is never trusted as final.**
  `parseAndValidateExtraction` in `route.ts` treats `unit_price`/`total` as
  documentary evidence — arithmetic mismatches get flagged
  (`needs_verification`, `needs_review_reason`), never silently rewritten.
- **`package_size`/`package_unit` are recomputed deterministically**, not
  trusted from Claude's JSON. `resolveInvoiceQuantityEvidence` in
  `src/lib/invoices.ts` parses `raw_size_text` (e.g. `"24 X 330ML"`) plus
  `quantity_source` (CASES/UNITS/KG/...) and *overwrites* whatever Claude put
  in `package_size`. Rule of thumb: **CASES multiplies pack-count × unit-size,
  UNITS does not** (you bought one individual item, not the whole pack) — this
  was a real, previously-fixed bug (see "HENDERSON OVERRIDE" history) and it's
  easy to accidentally reintroduce when writing new prompt examples.
- **Post-extraction validation layer** (`applyExtractionWarnings` and
  friends in `src/lib/invoices.ts`) can *suggest* a corrected price/quantity
  in `item.warnings[]`, but never auto-applies it — same principle.
- **Supplier-specific prompt templates** (e.g. `HENDERSON_TEMPLATE` in
  `route.ts`) are appended unconditionally to the shared prompt, self-gated
  ("IF this is a Henderson invoice, follow these rules — ignore otherwise").
  No runtime supplier-detection branch; token cost is small and it's simpler.
- **UI matching an item to an existing ingredient must never touch price
  fields.** `selectIngredient` in `InvoiceEditor.tsx` only sets
  description/ingredientId/match metadata. `updateItem`'s total-recalculation
  is gated to only run when the patch contains `quantity` or `unitPrice` —
  don't remove that gate, it fixed a real bug where matching silently
  corrupted a correct AI-extracted total.

## PDF extraction pipeline

PDFs are rendered to images **client-side** (`extractPdfContent` in
`invoices-client.ts`, via `pdfjs-dist` + `<canvas>` — no server dependency,
deliberately, to avoid native-module build risk). Up to 5 pages are rasterized
and sent to Claude vision as the *primary* read; the naive y-position text
reconstruction is kept only as supplementary/fallback text (multi-column
invoice layouts garble badly under pure text extraction). A client-side size
budget (~3.5MB) guards against Vercel's Node serverless body-size limit when
multiple page images are attached to one request.

## Testing conventions

**No jsdom/component test runner, no live Supabase/Claude test infra in this
repo.** All tests run via:
```
npm test   # node --import tsx --test <explicit file list in package.json>
```
Two valid patterns, both already used throughout `tests/`:
1. **Real unit tests** against pure functions exported from `src/lib/*.ts`
   (preferred whenever the logic is DOM/DB/network-free — see
   `invoiceExtractionWarnings.test.ts` for the shape).
2. **Source-inspection tests** (`readFileSync` + regex/AST-lite assertions)
   for React components or route wiring that can't be exercised directly —
   see `invoiceMatchPreservesTotal.test.ts` for the pattern (extracts a named
   function's body by brace-matching, asserts on its text).

New test files must be added to the `test` script's file list in
`package.json` — it's an explicit list, not a glob.

## Build & verify

```
npm run build   # must pass clean before calling anything done
npm test
```
Next.js 16 route handlers (`route.ts`) should only export recognized names
(`GET`/`POST`/etc., `runtime`, `maxDuration`, ...) — put new pure helper
functions in `src/lib/*.ts` instead of exporting them from a route file, both
for testability and to avoid route-export validation issues.

## Recent significant work (for context, not a changelog to maintain)

- Atomic `recipe_ingredients` save via a Postgres RPC (`save_recipe_ingredients`,
  `SECURITY INVOKER`) — fixed a data-loss bug where delete-then-insert ran as
  two separate non-transactional calls.
- Vision-first PDF invoice extraction (multi-page rasterization + Claude
  vision as primary read) — fixed garbled text from multi-column invoice
  layouts.
- Post-extraction validation/warnings layer (price sanity, line-total
  reconciliation, duplicate detection, invoice-total banner) — advisory only,
  never auto-corrects.
- Henderson-specific extraction template, consolidating scattered prompt
  patches into one self-gated block.
- Fixed ingredient-match silently corrupting invoice line totals.

## Known rough edges

- `README.md` still has an unresolved git merge-conflict marker in it
  (`<<<<<<< HEAD` / `=======` / `>>>>>>>`) — harmless (not consumed by
  tooling) but worth cleaning up if you're ever touching that file.
- Some early migrations predate the `supabase/migrations` folder itself, so
  grepping for a column there isn't proof it doesn't exist.
