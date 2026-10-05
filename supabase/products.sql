-- Product editing and product image storage for the Loom7 admin panel.
-- Run after schema.sql in the Supabase SQL Editor. Safe to rerun.
begin;

-- Links a saved product to one of the built-in storefront cards (e.g. 'roots-01').
-- Editing a built-in card saves a product with its key, which then replaces the card.
alter table public.products add column if not exists website_key text;
alter table public.products add column if not exists price numeric(10,2);
alter table public.products add column if not exists sort_order integer not null default 0;
alter table public.products add column if not exists available_sizes text[] not null default array['S', 'M', 'L', 'XL']::text[];
alter table public.products add column if not exists gallery_images text[] not null default array[]::text[];
alter table public.products add column if not exists video_url text;
alter table public.products drop constraint if exists products_price_nonnegative;
alter table public.products add constraint products_price_nonnegative
  check (price is null or price >= 0);
alter table public.products drop constraint if exists products_available_sizes_valid;
alter table public.products add constraint products_available_sizes_valid
  check (available_sizes <@ array['S', 'M', 'L', 'XL']::text[]);
alter table public.products drop constraint if exists products_website_key_format;
alter table public.products add constraint products_website_key_format
  check (website_key is null or website_key ~ '^[a-z0-9-]{1,64}$');
create unique index if not exists products_website_key_unique on public.products (website_key);
alter table public.products drop constraint if exists products_sort_order_nonnegative;
alter table public.products add constraint products_sort_order_nonnegative check (sort_order >= 0);

with ranked_products as (
  select id, row_number() over (
    order by case when sort_order > 0 then sort_order else 2147483647 end, created_at, id
  )::integer as position
  from public.products
  where website_key is null
)
update public.products as product
set sort_order = ranked_products.position
from ranked_products
where product.id = ranked_products.id;

update public.products set sort_order = 0 where website_key is not null and sort_order <> 0;
create index if not exists products_collection_order on public.products (sort_order, created_at)
  where website_key is null;

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

create or replace function public.reorder_product(p_product_id uuid, p_new_position integer)
returns void language plpgsql security definer set search_path = '' as $$
declare
  current_position integer;
  product_count integer;
begin
  if not (select public.is_loom7_admin()) then
    raise exception 'Only Loom7 admins can reorder products.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('public.products.collection_order'));

  select sort_order into current_position
  from public.products
  where id = p_product_id
  for update;
  if not found then
    raise exception 'The product no longer exists.';
  end if;

  select count(*)::integer into product_count
  from public.products;
  if p_new_position < 1 or p_new_position > product_count then
    raise exception 'Choose a position between 1 and %.', product_count;
  end if;
  if current_position = p_new_position then
    return;
  end if;

  update public.products
  set sort_order = case
    when id = p_product_id then p_new_position
    when current_position < p_new_position
      and sort_order > current_position and sort_order <= p_new_position then sort_order - 1
    when current_position > p_new_position
      and sort_order >= p_new_position and sort_order < current_position then sort_order + 1
    else sort_order
  end
  where id = p_product_id
    or (current_position < p_new_position and sort_order > current_position and sort_order <= p_new_position)
    or (current_position > p_new_position and sort_order >= p_new_position and sort_order < current_position);

  with ranked_builtins as (
    select website_key, row_number() over (order by sort_order, created_at, id)::integer as position
    from public.products
    where website_key in ('roots-01', 'roots-02', 'roots-03', 'roots-04')
  )
  update public.collection_product_order as saved_order
  set position = ranked_builtins.position
  from ranked_builtins
  where saved_order.product_key = ranked_builtins.website_key;
end;
$$;
revoke all on function public.reorder_product(uuid, integer) from public;
grant execute on function public.reorder_product(uuid, integer) to authenticated;

create table if not exists public.collection_product_order (
  product_key text primary key check (product_key in ('roots-01', 'roots-02', 'roots-03', 'roots-04')),
  position integer not null check (position between 1 and 4)
);

insert into public.collection_product_order (product_key, position)
values ('roots-01', 1), ('roots-02', 2), ('roots-03', 3), ('roots-04', 4)
on conflict (product_key) do nothing;

do $$
declare
  builtin_count integer;
begin
  select count(*)::integer into builtin_count
  from public.products
  where website_key in ('roots-01', 'roots-02', 'roots-03', 'roots-04');

  if builtin_count < 4 or exists (
    select 1 from public.products
    where website_key in ('roots-01', 'roots-02', 'roots-03', 'roots-04')
      and sort_order = 0
  ) then
    insert into public.products (website_key, name, description, image_url, is_visible, sort_order)
    select builtins.product_key, builtins.product_name, 'A statement piece from The Roots.',
      builtins.image_url, true, ordered.position
    from (values
      ('roots-01', 'Roots 01', 'assets/roots-01.webp'),
      ('roots-02', 'Roots 02', 'assets/roots-02.webp'),
      ('roots-03', 'Roots 03', 'assets/roots-03.webp'),
      ('roots-04', 'Roots 04', 'assets/roots-04.webp')
    ) as builtins(product_key, product_name, image_url)
    join public.collection_product_order as ordered using (product_key)
    on conflict (website_key) do nothing;

    update public.products as builtin
    set sort_order = saved_order.position
    from public.collection_product_order as saved_order
    where builtin.website_key = saved_order.product_key;

    with ranked_uploads as (
      select id, row_number() over (
        order by sort_order, created_at, id
      )::integer + 4 as position
      from public.products
      where website_key is null
    )
    update public.products as uploaded
    set sort_order = ranked_uploads.position
    from ranked_uploads
    where uploaded.id = ranked_uploads.id;
  end if;
end;
$$;

alter table public.collection_product_order enable row level security;
revoke all on public.collection_product_order from anon, authenticated;
grant select on public.collection_product_order to anon, authenticated;

drop policy if exists "Anyone can read built-in product order" on public.collection_product_order;
create policy "Anyone can read built-in product order" on public.collection_product_order
  for select to anon, authenticated using (true);

create or replace function public.reorder_builtin_product(p_website_key text, p_new_position integer)
returns void language plpgsql security definer set search_path = '' as $$
declare
  target_product_id uuid;
  target_collection_position integer;
begin
  if not (select public.is_loom7_admin()) then
    raise exception 'Only Loom7 admins can reorder products.';
  end if;

  if p_website_key is null
    or p_website_key not in ('roots-01', 'roots-02', 'roots-03', 'roots-04')
    or p_new_position < 1 or p_new_position > 4 then
    raise exception 'Choose one of the four Roots products and a position from 1 to 4.';
  end if;

  select id into target_product_id
  from public.products
  where website_key = p_website_key;
  if not found then
    raise exception 'The built-in product does not exist.';
  end if;

  select sort_order into target_collection_position
  from public.collection_product_order as saved_order
  join public.products as target on target.website_key = saved_order.product_key
  where saved_order.position = p_new_position;
  if not found then
    raise exception 'The built-in product order is not initialized. Run supabase/products.sql again.';
  end if;

  perform public.reorder_product(target_product_id, target_collection_position);
end;
$$;
revoke all on function public.reorder_builtin_product(text, integer) from public;
grant execute on function public.reorder_builtin_product(text, integer) to authenticated;

create or replace function public.compact_product_order_after_delete()
returns trigger language plpgsql set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('public.products.collection_order'));
  update public.products
  set sort_order = sort_order - 1
  where sort_order > old.sort_order;
  return old;
end;
$$;
drop trigger if exists products_compact_order_after_delete on public.products;
create trigger products_compact_order_after_delete after delete on public.products
  for each row execute function public.compact_product_order_after_delete();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product_images', 'product_images', true, 26214400, array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'])
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
