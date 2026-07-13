-- Track brand per purchase, since brand can vary between invoices for the same ingredient
ALTER TABLE ingredient_price_history ADD COLUMN IF NOT EXISTS brand TEXT;

COMMENT ON COLUMN ingredient_price_history.brand IS 'Brand purchased on this line item; brand can vary between purchases so it is captured per entry, not just on ingredients.brand';
