-- Public marketing blog. Posts are authored in the admin panel
-- (/adminziffera/blog) and read publicly at /blog and /blog/{slug}.
-- Writes always go through the service-role admin client in
-- src/app/adminziffera/blog/actions.ts (requireSuperAdmin-gated), so the
-- only RLS policy needed here is public read of published posts.
CREATE TABLE IF NOT EXISTS blog_posts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             TEXT NOT NULL UNIQUE,
  title            TEXT NOT NULL,
  category         TEXT NOT NULL DEFAULT 'Guide'
    CHECK (category IN ('Guide', 'Tips', 'News', 'Case Study')),
  excerpt          TEXT,
  content          TEXT NOT NULL DEFAULT '',
  cover_image_url  TEXT,
  author_name      TEXT NOT NULL DEFAULT 'ZRecipe Team',
  seo_title        TEXT,
  seo_description  TEXT,
  tags             TEXT[] NOT NULL DEFAULT '{}',
  published        BOOLEAN NOT NULL DEFAULT false,
  published_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blog_posts_published
  ON blog_posts (published, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_blog_posts_category
  ON blog_posts (category);

ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_published_blog_posts" ON blog_posts;
CREATE POLICY "public_read_published_blog_posts" ON blog_posts
  FOR SELECT
  TO anon, authenticated
  USING (published = true);

-- Public bucket for cover images / in-article images. Uploads go through
-- /api/admin/blog/upload-image using the service-role client (requireSuperAdmin
-- gated), which bypasses storage RLS, so no INSERT policy is needed — the
-- bucket only needs public:true so getPublicUrl() reads work unauthenticated.
INSERT INTO storage.buckets (id, name, public)
VALUES ('blog', 'blog', true)
ON CONFLICT (id) DO NOTHING;

-- ── Seed: 3 starter posts ────────────────────────────────────────────────────

INSERT INTO blog_posts (slug, title, category, excerpt, content, author_name, tags, published, published_at)
VALUES (
  'how-to-calculate-food-cost-percentage-ireland',
  'How to Calculate Food Cost Percentage for Your Irish Food Business',
  'Guide',
  'Food cost percentage is the single most important number for any food business. Here''s how to calculate it accurately — and how to use it to price your menu profitably.',
  $post1$<p>If you run a bakery, café or restaurant, one number decides whether you're profitable or slowly losing money on every sale: your food cost percentage. Get it wrong and even a busy, popular menu can quietly bleed margin. Get it right and you can price with confidence, spot problem recipes early, and react the moment a supplier raises prices.</p>

<h2>What is food cost percentage?</h2>
<p>Food cost percentage is the proportion of a dish's selling price that goes toward the raw ingredients used to make it. The formula is simple:</p>
<p><strong>Food Cost % = (Cost of ingredients ÷ Selling price) × 100</strong></p>
<p>So if a slice of cake costs you €1.20 in ingredients and you sell it for €4.00, your food cost is 30% — meaning 70% of that €4.00 is left to cover labour, rent, overheads, VAT and profit.</p>

<h2>What's a good food cost % for bakeries and cafés in Ireland?</h2>
<p>Most Irish bakeries and cafés target a food cost of <strong>28–35%</strong>. Restaurants with more labour-intensive plates often run slightly higher, closer to 30–38%, while high-volume bakery items (bread, traybakes) can sit lower, around 20–28%, because ingredient cost is low relative to price. There's no single "correct" number — it depends on your labour costs, rent, and how much hands-on preparation each item needs. The point of tracking it isn't to hit a magic figure; it's to know your number for <em>every</em> recipe, so you can spot the ones quietly dragging your margin down.</p>

<h2>How to calculate it per recipe</h2>
<p>Do this for every item on your menu, not just a few:</p>
<ol>
  <li>List every ingredient in the recipe with its exact quantity.</li>
  <li>Price each ingredient at its <em>current</em> cost per unit — not what you paid six months ago.</li>
  <li>Add up the total ingredient cost for the recipe.</li>
  <li>Divide by the number of portions the recipe yields to get cost per portion.</li>
  <li>Divide cost per portion by your selling price, then multiply by 100.</li>
</ol>
<p>Repeat this every time a supplier price changes. A recipe that was 28% in January can drift to 34% by June if flour, butter or dairy prices move and nobody re-checks it.</p>

<h2>Common mistakes</h2>
<ul>
  <li><strong>Not including labour.</strong> Ingredient cost alone doesn't tell you if a dish is profitable — a labour-intensive item can look cheap on paper and still lose money.</li>
  <li><strong>Ignoring waste and yield.</strong> Trim loss, peeling, reduction during cooking — the price you pay per kilo isn't the cost per usable kilo.</li>
  <li><strong>Forgetting VAT.</strong> Your selling price includes VAT, but your food cost calculation should be based on the net (VAT-excl.) selling price, or your percentage will look artificially healthy. Our free <a href="/vat-calculator-ireland">VAT calculator</a> makes it quick to check net vs gross Irish VAT rates.</li>
  <li><strong>Pricing from memory.</strong> Ingredient prices change constantly. A price that was accurate when you built the recipe six months ago is a guess today.</li>
</ul>

<h2>How ZRecipe automates this</h2>
<p>Manually recalculating food cost across a full menu every time a supplier invoice changes isn't realistic for most kitchens — so it rarely happens, and margins drift unnoticed. ZRecipe reads your supplier invoices, updates ingredient prices automatically, and recalculates the true cost and margin of every recipe that uses them — instantly, across your whole catalogue, including labour, waste and VAT. You always know exactly which recipes are healthy and which ones need a price review, without opening a spreadsheet.</p>
$post1$,
  'ZRecipe Team',
  ARRAY['food cost', 'pricing', 'Ireland', 'margins'],
  true,
  '2026-08-10T09:00:00Z'
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO blog_posts (slug, title, category, excerpt, content, author_name, tags, published, published_at)
VALUES (
  'eu-allergen-labelling-requirements-ireland-2025',
  'EU Allergen Labelling Requirements for Irish Food Businesses in 2026',
  'Guide',
  'EU Regulation 1169/2011 requires all 14 major allergens to be declared on food labels. Here''s what Irish bakeries, cafés and restaurants need to know to stay compliant.',
  $post2$<p>Allergen labelling isn't optional paperwork — it's a legal requirement for every food business trading in Ireland and the EU, and getting it wrong carries real risk for your customers and your business. Here's what you actually need to know.</p>

<h2>What is EU Regulation 1169/2011?</h2>
<p>EU Regulation 1169/2011 on Food Information to Consumers is the law that requires food businesses to clearly declare any of 14 specified allergens present in a dish or product, whether it's pre-packaged or served fresh across a counter. In Ireland it's enforced by the Food Safety Authority of Ireland (FSAI) and local Environmental Health Officers, and it applies to bakeries, cafés, restaurants, delis and any business preparing or selling food to the public.</p>

<h2>The 14 mandatory allergens</h2>
<p>Every one of these must be declared if present as an ingredient, processing aid, or through cross-contamination risk you're aware of:</p>
<ol>
  <li>Celery</li>
  <li>Cereals containing gluten (wheat, rye, barley, oats)</li>
  <li>Crustaceans</li>
  <li>Eggs</li>
  <li>Fish</li>
  <li>Lupin</li>
  <li>Milk</li>
  <li>Molluscs</li>
  <li>Mustard</li>
  <li>Nuts</li>
  <li>Peanuts</li>
  <li>Sesame seeds</li>
  <li>Soybeans</li>
  <li>Sulphur dioxide / sulphites (above 10mg/kg or 10mg/L)</li>
</ol>

<h2>"Contains" vs "May contain" — what's the difference?</h2>
<p><strong>Contains</strong> means the allergen is a deliberate ingredient in the recipe — it's there because you put it there, and it must always be declared. <strong>May contain</strong> is a precautionary warning for cross-contamination risk — for example, a gluten-free traybake baked in a kitchen that also handles wheat flour. The two aren't interchangeable: "may contain" should never be used as a substitute for properly declaring a known ingredient, and overusing it defensively for everything erodes its usefulness for genuinely allergic customers.</p>

<h2>Pre-packaged vs non-prepacked food</h2>
<p>Pre-packaged food (sealed before sale, sold as-is) needs a full printed ingredients label with allergens emphasised — typically bolded or capitalised. Non-prepacked food — what's served across a bakery counter, café till, or restaurant table — can declare allergens verbally by trained staff <em>or</em> in writing (menu, chalkboard, information folder), but the information has to be accurate, current, and readily available, not something staff have to guess at under pressure during a busy service.</p>

<h2>Penalties for non-compliance in Ireland</h2>
<p>Environmental Health Officers can and do inspect allergen information as part of routine food safety inspections. Non-compliance can result in improvement notices, fines, and in serious cases involving customer harm, prosecution. Beyond the legal exposure, a single allergic reaction traced back to inaccurate allergen information is a serious safety incident and a reputational one your business may not recover from.</p>

<h2>How ZRecipe automates allergen compliance</h2>
<p>The hardest part of allergen compliance isn't knowing the rules — it's keeping every recipe's allergen list accurate as ingredients, suppliers and recipes change. ZRecipe tags each ingredient with its allergens once, then automatically rolls that information up through every recipe that uses it — including sub-recipes nested inside other recipes. Swap a supplier or add an ingredient, and the allergen list updates everywhere it's used, so your printed kitchen cards and labels stay accurate without manual re-checking.</p>
$post2$,
  'ZRecipe Team',
  ARRAY['allergens', 'compliance', 'EU 1169/2011', 'Ireland'],
  true,
  '2026-08-13T09:00:00Z'
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO blog_posts (slug, title, category, excerpt, content, author_name, tags, published, published_at)
VALUES (
  'recipe-costing-software-vs-spreadsheet-ireland',
  'Recipe Costing Software vs Spreadsheet: Which is Right for Your Food Business?',
  'Tips',
  'Most Irish bakeries and cafés still use Excel to cost recipes. Here''s an honest comparison of spreadsheets vs dedicated recipe costing software — and when it makes sense to switch.',
  $post3$<p>Almost every food business starts costing recipes in a spreadsheet — it's free, familiar, and feels like enough control. For some businesses it stays enough for a long time. For others, it quietly becomes the reason margins are wrong and nobody notices until the numbers don't add up at year end. Here's how to tell which camp you're in.</p>

<h2>Why spreadsheets feel safe but hide real costs</h2>
<p>A spreadsheet gives you the comfort of a formula and a number on screen — but that number is only as current as the last time someone manually typed in a price. In a real kitchen, ingredient prices change every few weeks, sometimes every invoice. Unless someone is manually re-typing every price change into every recipe that uses that ingredient, the "cost" on your spreadsheet is quietly going stale the moment you save it.</p>

<h2>What spreadsheets typically miss</h2>
<ul>
  <li><strong>Yield factor.</strong> The price per kilo you paid isn't the price per usable kilo after trimming, peeling, or cooking loss — spreadsheets rarely account for this correctly, and it compounds across every recipe using that ingredient.</li>
  <li><strong>VAT.</strong> Mixing gross and net prices in the same sheet is an easy, common mistake that silently distorts your margin.</li>
  <li><strong>Waste percentage.</strong> Kitchen waste, spoilage and portion trim all eat into real margin but rarely get a proper line in a manual sheet.</li>
  <li><strong>Sub-recipes.</strong> A filling used inside three different cakes needs its own cost recalculated everywhere it's used, every time an ingredient in it changes — something a flat spreadsheet structure struggles to do without becoming an unmanageable web of linked tabs.</li>
</ul>

<h2>When a spreadsheet is genuinely enough</h2>
<p>If you have a small, stable menu — a handful of recipes that rarely change, with ingredients you buy from one or two suppliers at fairly stable prices — a well-built spreadsheet can serve you fine. The trouble usually starts as the menu grows, suppliers multiply, and prices start moving more often than anyone has time to manually track.</p>

<h2>What dedicated software adds</h2>
<p>Purpose-built recipe costing software solves the problem spreadsheets can't: it keeps every recipe's cost <em>live</em>, automatically. Upload a supplier invoice and every ingredient price updates once — then every recipe using that ingredient, including sub-recipes nested inside other recipes, recalculates instantly. Add allergen compliance, kitchen card and label printing, and margin tracking across your whole menu, and you're no longer relying on someone remembering to update forty tabs by hand.</p>

<h2>Cost comparison: spreadsheet time vs software cost</h2>
<p>The real cost of a "free" spreadsheet isn't the software — it's the hours spent manually re-keying prices, and the margin quietly lost on recipes nobody re-checked in months. For a business processing a handful of supplier invoices a week, that's easily a few hours of admin time — time that either comes out of your evening or doesn't happen at all, which is the more common outcome and the more expensive one.</p>

<h2>Try ZRecipe</h2>
<p>ZRecipe was built specifically for this problem: import your invoices, and let ingredient prices, recipe costs, margins and allergen labels stay accurate automatically. Start a 14-day free trial and see your actual food cost percentage — not the one from three months ago.</p>
$post3$,
  'ZRecipe Team',
  ARRAY['recipe costing', 'software', 'spreadsheets', 'comparison'],
  true,
  '2026-08-16T09:00:00Z'
)
ON CONFLICT (slug) DO NOTHING;
