-- Fixes sobre 20261104000000_init.sql. Idempotente: se puede pegar en el SQL editor y correr más de una vez.

-- 1) Perfil al crear usuario: nunca falla por nombre vacío (el check de length rompía el alta del usuario)
create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (user_id, name, photo_url)
  values (new.id,
          left(coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
                        nullif(trim(new.raw_user_meta_data->>'name'), ''),
                        nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
                        'Jugador'), 40),
          new.raw_user_meta_data->>'avatar_url')
  on conflict (user_id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- Usuarios que entraron antes de que existiera el trigger (sin perfil = quedan trabados en el login)
insert into profiles (user_id, name, photo_url)
select u.id,
       left(coalesce(nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
                     nullif(trim(u.raw_user_meta_data->>'name'), ''),
                     nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
                     'Jugador'), 40),
       u.raw_user_meta_data->>'avatar_url'
from auth.users u
where not exists (select 1 from profiles p where p.user_id = u.id);

-- 2) is_admin devolvía NULL para no-miembros, y `if not is_admin(...)` dejaba pasar (regenerate_invite, add_to_match)
create or replace function is_admin(c uuid) returns boolean language sql stable as $$
  select coalesce(role_in(c) in ('owner','admin'), false)
$$;

-- 3) set_role: mismo problema con NULL (un no-miembro podía cambiar roles / transferir ownership)
create or replace function set_role(p_community uuid, p_profile uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(role_in(p_community), '') <> 'owner' then raise exception 'forbidden'; end if;
  if p_role not in ('admin','member','owner') then raise exception 'bad_role'; end if;
  if p_role = 'owner' then -- transferir ownership
    update memberships set role = 'admin' where community_id = p_community and profile_id = me();
    update communities set owner_id = p_profile where id = p_community;
  end if;
  update memberships set role = p_role where community_id = p_community and profile_id = p_profile;
  if not found then raise exception 'not_member'; end if;
end $$;

-- 4) regenerate_invite: pgcrypto vive en el schema `extensions` en Supabase; con search_path = public
--    fallaba con "function gen_random_bytes(integer) does not exist"
create or replace function regenerate_invite(p_community uuid) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare code text := encode(gen_random_bytes(6), 'hex');
begin
  if not is_admin(p_community) then raise exception 'forbidden'; end if;
  update communities set invite_code = code where id = p_community;
  return code;
end $$;

-- 5) Storage: upload con upsert necesita también SELECT sobre el objeto (sin esto la subida de foto falla por RLS)
drop policy if exists av_read on storage.objects;
create policy av_read on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = me()::text);
