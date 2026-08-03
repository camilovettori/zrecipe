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



4\. Missing package\_unit must not default silently to kg.



5\. Sub-recipe costing canonical formula:

&#x20;  - subRecipeCostPerBaseUnit = totalRecipeCost / recipeWeightInBaseUnit

&#x20;  - parentRecipeCost = subRecipeCostPerBaseUnit \* usedQuantityInBaseUnit



6\. If a recipe is marked as sub-recipe:

&#x20;  - Hide selling price

&#x20;  - Hide VAT

&#x20;  - Hide margin

&#x20;  - Hide profit

&#x20;  - Show internal cost only



7\. Needs price is derived state:

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

