-- Add brand column to ingredients table
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS brand TEXT;

COMMENT ON COLUMN ingredients.brand IS 'Product brand name, e.g. Lurpak, RHM, KTC';
