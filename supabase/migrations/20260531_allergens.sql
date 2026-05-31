-- EU Regulation 1169/2011 — 14 mandatory allergens
CREATE TABLE IF NOT EXISTS allergens (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  icon TEXT
);

INSERT INTO allergens (name, icon) VALUES
  ('Celery',                      '🥬'),
  ('Cereals containing gluten',   '🌾'),
  ('Crustaceans',                 '🦐'),
  ('Eggs',                        '🥚'),
  ('Fish',                        '🐟'),
  ('Lupin',                       '🌸'),
  ('Milk',                        '🥛'),
  ('Molluscs',                    '🦪'),
  ('Mustard',                     '🟡'),
  ('Nuts',                        '🥜'),
  ('Peanuts',                     '🥜'),
  ('Sesame seeds',                '🫘'),
  ('Soybeans',                    '🫘'),
  ('Sulphur dioxide/sulphites',   '🧪')
ON CONFLICT (name) DO NOTHING;

-- Per-ingredient allergen status
CREATE TABLE IF NOT EXISTS ingredient_allergens (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id UUID    NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  allergen_id   INT     NOT NULL REFERENCES allergens(id)   ON DELETE CASCADE,
  status        TEXT    NOT NULL DEFAULT 'contains'
    CHECK (status IN ('contains', 'may_contain')),
  UNIQUE (ingredient_id, allergen_id)
);

CREATE INDEX IF NOT EXISTS idx_ingredient_allergens_ingredient
  ON ingredient_allergens (ingredient_id);

CREATE INDEX IF NOT EXISTS idx_ingredient_allergens_allergen
  ON ingredient_allergens (allergen_id);

ALTER TABLE ingredient_allergens ENABLE ROW LEVEL SECURITY;

-- RLS: access follows the ingredient's tenant membership
CREATE POLICY "ingredient_allergens_tenant_isolation" ON ingredient_allergens
  FOR ALL TO authenticated
  USING (
    exists (
      select 1 from public.ingredients i
      join public.get_user_tenant_ids() ids on ids.tenant_id = i.tenant_id::text
      where i.id = ingredient_allergens.ingredient_id
    )
  )
  WITH CHECK (
    exists (
      select 1 from public.ingredients i
      join public.get_user_tenant_ids() ids on ids.tenant_id = i.tenant_id::text
      where i.id = ingredient_allergens.ingredient_id
    )
  );
