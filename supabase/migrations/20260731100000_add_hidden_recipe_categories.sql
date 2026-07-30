ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS hidden_recipe_categories TEXT[] DEFAULT '{}';

COMMENT ON COLUMN tenants.hidden_recipe_categories IS
  'Category names the tenant has chosen to hide from recipe category
   pickers. Mirrors hidden_ingredient_categories: categories are derived
   dynamically (RECIPE_CATEGORIES defaults + values actually used on
   recipes), so hiding is tracked here rather than by deleting rows.';
