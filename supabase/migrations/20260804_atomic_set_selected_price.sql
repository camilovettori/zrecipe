-- Atomic replacement for the two sequential updates in setSelectedPrice.ts
-- (clear all → set one), which could race or leave a transient "nothing
-- selected" state if the first update succeeded but the second failed.
CREATE OR REPLACE FUNCTION set_selected_price(
  p_ingredient_id UUID,
  p_history_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  UPDATE ingredient_price_history
  SET is_selected_price = false
  WHERE ingredient_id = p_ingredient_id
    AND is_selected_price = true;

  IF p_history_id IS NOT NULL THEN
    UPDATE ingredient_price_history
    SET is_selected_price = true
    WHERE id = p_history_id
      AND ingredient_id = p_ingredient_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION set_selected_price TO authenticated;
