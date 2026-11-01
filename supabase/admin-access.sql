-- Privileged admin membership changes are invoked only by the authenticated
-- Cloudflare Pages Function using the Supabase service-role key.
create or replace function public.grant_loom7_admin_access(target_user_id uuid, actor_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(8045697, 1);
  if not exists (
    select 1 from public.admin_users where user_id = actor_user_id
  ) then
    raise exception using errcode = '42501', message = 'Actor is not an admin';
  end if;
  insert into public.admin_users (user_id)
  values (target_user_id)
  on conflict (user_id) do nothing;
end;
$$;

create or replace function public.revoke_loom7_admin_access(target_user_id uuid, actor_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_count bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(8045697, 1);
  if not exists (
    select 1 from public.admin_users where user_id = actor_user_id
  ) then
    raise exception using errcode = '42501', message = 'Actor is not an admin';
  end if;
  if target_user_id = actor_user_id then
    raise exception using errcode = '22023', message = 'Cannot revoke own admin access';
  end if;
  select count(*) into admin_count from public.admin_users;
  if admin_count <= 1 then
    raise exception using errcode = 'P0001', message = 'Cannot remove the last admin';
  end if;
  delete from public.admin_users where user_id = target_user_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'Target is not an admin';
  end if;
end;
$$;

revoke all on function public.grant_loom7_admin_access(uuid, uuid) from public, anon, authenticated;
revoke all on function public.revoke_loom7_admin_access(uuid, uuid) from public, anon, authenticated;
grant execute on function public.grant_loom7_admin_access(uuid, uuid) to service_role;
grant execute on function public.revoke_loom7_admin_access(uuid, uuid) to service_role;
