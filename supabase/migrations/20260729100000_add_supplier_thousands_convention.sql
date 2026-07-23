ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS quantity_in_thousands BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN suppliers.quantity_in_thousands IS
  'When true, invoice line quantities from this supplier are
   interpreted as thousands. Extraction pipeline multiplies quantity
   by 1000 and divides unit_price by 1000 before saving. Typical of
   Irish packaging suppliers (Atlas, Kingfisher, McKays, etc).';
