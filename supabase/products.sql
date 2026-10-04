-- Product editing and product image storage for the Loom7 admin panel.
-- Run after schema.sql in the Supabase SQL Editor. Safe to rerun.
begin;

-- Links a saved product to one of the built-in storefront cards (e.g. 'roots-01').
-- Editing a built-in card saves a product with its key, which then replaces the card.
alter table public.products add column if not exists website_key text;
alter table public.products add column if not exists price numeric(10,2);
alter table public.products drop constraint if exists products_price_nonnegative;
alter table public.products add constraint products_price_nonnegative
  check (price is null or price >= 0);
alter table public.products drop constraint if exists products_website_key_format;
alter table public.products add constraint products_website_key_format
  check (website_key is null or website_key ~ '^[a-z0-9-]{1,64}$');
create unique index if not exists products_website_key_unique on public.products (website_key);

create or replace function public.touch_products_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists products_touch_updated_at on public.products;
create trigger products_touch_updated_at before update on public.products
  for each row execute function public.touch_products_updated_at();

-- Lets the storefront hide built-in cards that an admin marked hidden, without
-- exposing any other details of hidden products.
create or replace function public.hidden_website_product_keys()
returns setof text language sql stable security definer set search_path = '' as $$
  select website_key from public.products where website_key is not null and not is_visible;
$$;
revoke all on function public.hidden_website_product_keys() from public;
grant execute on function public.hidden_website_product_keys() to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product_images', 'product_images', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Admins can read product image metadata" on storage.objects;
create policy "Admins can read product image metadata" on storage.objects
  for select to authenticated using (bucket_id = 'product_images' and (select public.is_loom7_admin()));
drop policy if exists "Admins can upload product images" on storage.objects;
create policy "Admins can upload product images" on storage.objects
  for insert to authenticated with check (bucket_id = 'product_images' and (select public.is_loom7_admin()));
drop policy if exists "Admins can update product images" on storage.objects;
create policy "Admins can update product images" on storage.objects
  for update to authenticated using (bucket_id = 'product_images' and (select public.is_loom7_admin()))
  with check (bucket_id = 'product_images' and (select public.is_loom7_admin()));
drop policy if exists "Admins can delete product images" on storage.objects;
create policy "Admins can delete product images" on storage.objects
  for delete to authenticated using (bucket_id = 'product_images' and (select public.is_loom7_admin()));

commit;
