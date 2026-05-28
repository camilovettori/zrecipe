alter table if exists public.invoice_items
  add column if not exists package_size decimal(10,3);

alter table if exists public.invoice_items
  add column if not exists package_unit text;

alter table if exists public.ingredients
  add column if not exists package_size decimal(10,3);

alter table if exists public.ingredients
  add column if not exists package_unit text;
