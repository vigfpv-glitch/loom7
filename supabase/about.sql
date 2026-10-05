begin;

create table if not exists public.about_content (
  id uuid primary key default '00000000-0000-4000-8000-000000000002'::uuid
    check (id = '00000000-0000-4000-8000-000000000002'::uuid),
  label text not null check (char_length(btrim(label)) between 1 and 80),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  body text not null default '' check (char_length(body) <= 1200),
  cta_text text not null check (char_length(btrim(cta_text)) between 1 and 120),
  cta_link text not null check (char_length(cta_link) <= 2000 and cta_link ~* '^https?://'),
  image_url text not null check (char_length(image_url) <= 2000 and
    (image_url ~* '^https?://' or image_url ~* '^assets/[a-z0-9_-]+\.(jpg|jpeg|png|webp)$')),
  image_alt text not null default '' check (char_length(image_alt) <= 300)
);

alter table public.about_content enable row level security;
revoke all on public.about_content from anon, authenticated;
grant select on public.about_content to anon, authenticated;
grant insert, update on public.about_content to authenticated;

drop policy if exists "Anyone can read the About section" on public.about_content;
create policy "Anyone can read the About section" on public.about_content
  for select to anon, authenticated using (true);
drop policy if exists "Admins can insert the About section" on public.about_content;
create policy "Admins can insert the About section" on public.about_content
  for insert to authenticated with check ((select public.is_loom7_admin()));
drop policy if exists "Admins can update the About section" on public.about_content;
create policy "Admins can update the About section" on public.about_content
  for update to authenticated using ((select public.is_loom7_admin()))
  with check ((select public.is_loom7_admin()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('about_images', 'about_images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Admins can read About image metadata" on storage.objects;
create policy "Admins can read About image metadata" on storage.objects
  for select to authenticated using (bucket_id = 'about_images' and (select public.is_loom7_admin()));
drop policy if exists "Admins can upload About images" on storage.objects;
create policy "Admins can upload About images" on storage.objects
  for insert to authenticated with check (bucket_id = 'about_images' and (select public.is_loom7_admin()));
drop policy if exists "Admins can update About images" on storage.objects;
create policy "Admins can update About images" on storage.objects
  for update to authenticated using (bucket_id = 'about_images' and (select public.is_loom7_admin()))
  with check (bucket_id = 'about_images' and (select public.is_loom7_admin()));
drop policy if exists "Admins can delete About images" on storage.objects;
create policy "Admins can delete About images" on storage.objects
  for delete to authenticated using (bucket_id = 'about_images' and (select public.is_loom7_admin()));

commit;
