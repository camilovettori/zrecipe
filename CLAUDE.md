\# ZRecipe — Claude Project Instructions



You are working on ZRecipe, a premium food-costing SaaS for bakeries, cafés, restaurants, and food businesses.



\## Product identity



ZRecipe is not a generic recipe app.

ZRecipe is food cost intelligence.



Core promise:

Know the real cost and margin of every recipe as supplier prices change.



Primary workflows:

1\. Import invoices

2\. Extract invoice items with AI

3\. Update ingredient price history

4\. Recalculate recipe costs

5\. Show margin/profit impact

6\. Print kitchen cards and allergen labels



\## Design rules



Preserve the premium ZRecipe visual language:

\- Emerald accents

\- Warm paper / soft white backgrounds

\- Soft borders

\- Rounded cards

\- Subtle shadows

\- Minimalist SaaS UI

\- Playfair Display for headings

\- DM Sans for body

\- No generic admin-template look

\- No heavy colors

\- No Windows-style UI

\- Do not redesign pages unless explicitly asked



When polishing UI:

\- Keep the existing layout structure

\- Improve hierarchy, spacing, copy, and consistency

\- Do not change unrelated components



\## Architecture rules



Stack:

\- Next.js 14 App Router

\- TypeScript

\- Tailwind CSS

\- Supabase Postgres/Auth/RLS/Storage

\- Claude API for extraction and AI insights

\- Stripe for payments

\- Resend for transactional email



Always be careful with:

\- Supabase RLS

\- Auth

\- Stripe/billing

\- Tenant isolation

\- Invoice save logic

\- Ingredient price history

\- Recipe costing formulas



Do not change database schema unless absolutely necessary.

If schema change is needed, explain why first.



\### Migration files do not reliably reflect production

The get\_user\_tenant\_ids() function defined in

supabase/migrations/20260528150000\_tenant\_data\_policies.sql (returns

table(tenant\_id text), used via an exists()/alias/::text pattern) does NOT

match what is actually live on the zconnect Supabase project (returns setof

uuid, used via \`tenant\_id in (select get\_user\_tenant\_ids())\`) — confirmed by

direct pg\_get\_functiondef/pg\_policies inspection, not by reading the

migration. This project's migrations are applied manually in the SQL

Editor, so a file existing in git is not proof of what ran, and what ran is

not guaranteed to match the file.

Do not trust 20260528150000, or any other migration file, as the source of

truth for a function's real signature or a policy's real condition. Before

writing any new RLS policy or anything that calls an existing Postgres

function, verify the live definition first — \`select pg\_get\_functiondef(oid)

from pg\_proc where proname = '...'\` and \`select \* from pg\_policies where

tablename = '...'\` — and match that, not the git history.



\## Core costing rules



Never violate these rules:



1\. Invoice line price is not ingredient normalized price.

&#x20;  - Invoice line total must preserve what came from the invoice.

&#x20;  - Ingredient current\_price is the normalized price used in recipes.



2\. Ingredient identity = name.

&#x20;  - Brand belongs to purchase/price history.

&#x20;  - Supplier belongs to purchase/price history.



3\. Unit conversion must stay inside compatible families:

&#x20;  - weight: g, kg

&#x20;  - volume: ml, L

&#x20;  - count: unit, dozen

&#x20;  - Never convert L to kg without explicit density.

&#x20;  - Never convert kg to L without explicit density.

&#x20;  - Unsafe conversion should show Needs Review, not fake a value.



4\. A sub-recipe has exactly one canonical rate for weight-based use in a parent recipe:

&#x20;  - costPerGram = totalCost / totalEpWeightInGrams

&#x20;  - totalCost includes labour, overhead and waste.

&#x20;  - A parent line costs: quantityConvertedToGrams \* costPerGram.

&#x20;  - NEVER reconstruct this from a per-yield-unit rate. The per-yield-unit rate (sub\_ingredient\_cost\_per\_unit) is only for count-based parent usage.

&#x20;  - When costPerGram cannot be computed, show Needs Review. Never fall back to a reconstruction, and never emit a silently understated cost.

&#x20;  - TEST FIXTURE RULE: any test covering sub-recipe costing MUST use a fixture with yield > 1. At yield = 1 the correct and incorrect formulas coincide, so a yield-1 fixture cannot detect this class of bug. This is not a style preference — it is the specific blind spot that let the same bug ship three times (€995, €0.00, €0.01).



5\. Missing package\_unit must not default silently to kg.



6\. Sub-recipe costing canonical formula:

&#x20;  - subRecipeCostPerBaseUnit = totalRecipeCost / recipeWeightInBaseUnit

&#x20;  - parentRecipeCost = subRecipeCostPerBaseUnit \* usedQuantityInBaseUnit



7\. If a recipe is marked as sub-recipe:

&#x20;  - Hide selling price

&#x20;  - Hide VAT

&#x20;  - Hide margin

&#x20;  - Hide profit

&#x20;  - Show internal cost only



8\. Needs price is derived state:

&#x20;  - current\_price null/zero or no valid selected/latest history

&#x20;  - Do not maintain random boolean flags for this.



\## AI extraction rules



Invoice AI:

\- Extract invoice text literally.

\- Do not invent item names, prices, quantities, or units.

\- If unsure, mark Needs Review.

\- User corrections should be remembered per supplier.



Recipe AI:

\- Recipe import should extract ingredients/instructions.

\- Do not invent ingredient prices from recipe files.

\- New ingredients from recipe import should become Needs Price.



\## UX rules



Autosave must never interrupt active user flows:

\- AI import

\- Invoice upload/review

\- File upload

\- Checkout/payment

\- Confirmation dialogs

\- Critical editing modals



If autosave could remount the page or close a modal, pause/defer it.



\## Development rules



For every coding task:

1\. Inspect existing patterns before changing code.

2\. Reuse existing components/helpers where possible.

3\. Do not duplicate calculation logic.

4\. Keep changes scoped.

5\. Run:

&#x20;  npm run build

6\. Return:

&#x20;  - files changed

&#x20;  - root cause, if bug

&#x20;  - what changed

&#x20;  - how to test

&#x20;  - build result



Avoid:

\- broad refactors

\- unrelated style changes

\- silent fallbacks

\- fake calculations

\- changing auth/RLS/billing without explicit approval


<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
