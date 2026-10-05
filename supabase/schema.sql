-- Loom7 catalogue and newsletter schema for Supabase/Postgres.
-- Run this in Supabase SQL Editor. Never expose a service-role key in browser code.

create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  description text check (description is null or char_length(description) <= 1000),
  price numeric(10,2) check (price is null or price >= 0),
  image_url text check (image_url is null or char_length(image_url) <= 1000),
  gallery_images text[] not null default array[]::text[],
  video_url text check (video_url is null or char_length(video_url) <= 1000),
  is_visible boolean not null default true,
  deleted_at timestamptz,
  permanently_deleted boolean not null default false,
  available_sizes text[] not null default array['S', 'M', 'L', 'XL']::text[]
    check (available_sizes <@ array['S', 'M', 'L', 'XL']::text[]),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (char_length(email) <= 320 and email = lower(btrim(email))),
  full_name text check (full_name is null or char_length(full_name) <= 120),
  consented_at timestamptz not null default now(),
  consent_version text not null default 'newsletter-v1',
  created_at timestamptz not null default now()
);

create or replace function public.is_loom7_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admin_users where user_id = (select auth.uid()));
$$;
revoke all on function public.is_loom7_admin() from public;
grant execute on function public.is_loom7_admin() to authenticated;

alter table public.admin_users enable row level security;
alter table public.products enable row level security;
alter table public.newsletter_subscribers enable row level security;

drop policy if exists "Admins can view their own membership" on public.admin_users;
create policy "Admins can view their own membership" on public.admin_users for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Public can view visible products" on public.products;
create policy "Public can view visible products" on public.products for select to anon, authenticated using (is_visible or (select public.is_loom7_admin()));
drop policy if exists "Admins can insert products" on public.products;
create policy "Admins can insert products" on public.products for insert to authenticated with check ((select public.is_loom7_admin()));
drop policy if exists "Admins can update products" on public.products;
create policy "Admins can update products" on public.products for update to authenticated using ((select public.is_loom7_admin())) with check ((select public.is_loom7_admin()));
drop policy if exists "Admins can delete products" on public.products;
create policy "Admins can delete products" on public.products for delete to authenticated using ((select public.is_loom7_admin()));

drop policy if exists "Public can subscribe to newsletter" on public.newsletter_subscribers;
create policy "Public can subscribe to newsletter" on public.newsletter_subscribers for insert to anon, authenticated with check (char_length(email) between 3 and 320 and email = lower(btrim(email)) and consented_at is not null);
drop policy if exists "Admins can view subscribers" on public.newsletter_subscribers;
create policy "Admins can view subscribers" on public.newsletter_subscribers for select to authenticated using ((select public.is_loom7_admin()));
drop policy if exists "Admins can delete subscribers" on public.newsletter_subscribers;
create policy "Admins can delete subscribers" on public.newsletter_subscribers for delete to authenticated using ((select public.is_loom7_admin()));

grant select on public.products to anon, authenticated;
grant insert, update, delete on public.products to authenticated;
grant insert on public.newsletter_subscribers to anon, authenticated;
grant select, delete on public.newsletter_subscribers to authenticated;
grant select on public.admin_users to authenticated;
