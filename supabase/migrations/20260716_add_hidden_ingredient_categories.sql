ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS hidden_ingredient_categories TEXT[] DEFAULT '{}';

COMMENT ON COLUMN tenants.hidden_ingredient_categories IS
  'Category names the tenant has chosen to hide from ingredient category
   pickers. Categories are otherwise derived dynamically (defaults + values
   actually used on ingredients), so hiding is tracked here rather than by
   deleting rows.';
