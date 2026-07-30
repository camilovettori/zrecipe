-- Prevent ingredient deletion from silently leaving unlinked recipe lines.
-- Existing null rows remain editable in the recipe builder.
DO $$
DECLARE
  ingredient_fk_name text;
BEGIN
  SELECT tc.constraint_name
  INTO ingredient_fk_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
   AND tc.constraint_schema = kcu.constraint_schema
  JOIN information_schema.constraint_column_usage ccu
    ON tc.constraint_name = ccu.constraint_name
   AND tc.constraint_schema = ccu.constraint_schema
  WHERE tc.table_schema = 'public'
    AND tc.table_name = 'recipe_ingredients'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'ingredient_id'
    AND ccu.table_schema = 'public'
    AND ccu.table_name = 'ingredients'
    AND ccu.column_name = 'id'
  LIMIT 1;

  IF ingredient_fk_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.recipe_ingredients DROP CONSTRAINT %I',
      ingredient_fk_name
    );
  END IF;

  ALTER TABLE public.recipe_ingredients
    ADD CONSTRAINT recipe_ingredients_ingredient_id_fkey
    FOREIGN KEY (ingredient_id)
    REFERENCES public.ingredients(id)
    ON DELETE RESTRICT;
END $$;git 
