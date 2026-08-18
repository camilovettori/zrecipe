-- recipe_ingredients.tenant_id and ingredient_allergens.tenant_id were created
-- referencing tenants(id) with the default NO ACTION delete rule, unlike every
-- other tenant-scoped table (recipes, ingredients, invoices, etc.), which use
-- ON DELETE CASCADE. This blocks admin "Delete tenant" with a foreign key
-- violation for any tenant that has recipe ingredient lines or allergen tags.
ALTER TABLE public.recipe_ingredients
  DROP CONSTRAINT recipe_ingredients_tenant_id_fkey;
ALTER TABLE public.recipe_ingredients
  ADD CONSTRAINT recipe_ingredients_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

ALTER TABLE public.ingredient_allergens
  DROP CONSTRAINT ingredient_allergens_tenant_id_fkey;
ALTER TABLE public.ingredient_allergens
  ADD CONSTRAINT ingredient_allergens_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
