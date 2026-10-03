begin;

create table if not exists public.hero_content (
  id uuid primary key default '00000000-0000-4000-8000-000000000001'::uuid
    check (id = '00000000-0000-4000-8000-000000000001'::uuid),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  subtitle text not null default '' check (char_length(subtitle) <= 1000),
  cta_text text not null check (char_length(btrim(cta_text)) between 1 and 120),
  cta_link text not null check (char_length(cta_link) <= 2000 and cta_link ~* '^https?://'),
  image_url text check (image_url is null or (char_length(image_url) <= 2000 and
    (image_url ~* '^https?://' or image_url = 'assets/hero-static.webp')))
);

alter table public.hero_content enable row level security;
revoke all on public.hero_content from anon, authenticated;
grant select on public.hero_content to anon, authenticated;
grant insert, update on public.hero_content to authenticated;

drop policy if exists "Anyone can read the hero" on public.hero_content;
create policy "Anyone can read the hero" on public.hero_content
  for select to anon, authenticated using (true);
drop policy if exists "Admins can insert the hero" on public.hero_content;
create policy "Admins can insert the hero" on public.hero_content
  for insert to authenticated with check ((select public.is_loom7_admin()));
drop policy if exists "Admins can update the hero" on public.hero_content;
create policy "Admins can update the hero" on public.hero_content
  for update to authenticated using ((select public.is_loom7_admin()))
  with check ((select public.is_loom7_admin()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hero_images', 'hero_images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Admins can read hero image metadata" on storage.objects;
create policy "Admins can read hero image metadata" on storage.objects
  for select to authenticated using (bucket_id = 'hero_images' and (select public.is_loom7_admin()));
drop policy if exists "Admins can upload hero images" on storage.objects;
create policy "Admins can upload hero images" on storage.objects
  for insert to authenticated with check (bucket_id = 'hero_images' and (select public.is_loom7_admin()));
drop policy if exists "Admins can update hero images" on storage.objects;
create policy "Admins can update hero images" on storage.objects
  for update to authenticated using (bucket_id = 'hero_images' and (select public.is_loom7_admin()))
  with check (bucket_id = 'hero_images' and (select public.is_loom7_admin()));
drop policy if exists "Admins can delete hero images" on storage.objects;
create policy "Admins can delete hero images" on storage.objects
  for delete to authenticated using (bucket_id = 'hero_images' and (select public.is_loom7_admin()));

commit;
