-- Endurecimiento de policies (auditoría de seguridad). Idempotente; no borra ni cambia datos.
--
-- Lo que se podía hacer llamando a la API a mano (no desde la app) y ahora no:
-- 1) custom_stats ("stats de la casa"): la policy de UPDATE no tenía WITH CHECK ni límite de columnas. Quien había creado
--    una stat podía mudarla a OTRA comunidad o a otro jugador (community_id / target_id), y el jugador al que se la
--    pusieron podía cambiarle el valor y el nombre. Ahora por la API solo se tocan label, value, code y hidden; y label,
--    value y code solo los cambia quien la creó (el jugador y los admins siguen pudiendo ocultarla o borrarla).
-- 2) custom_stats / stat_votes: al crear o votar se pedía "comparto alguna comunidad con ese jugador", no que el jugador
--    fuera de ESA comunidad. Ahora el jugador tiene que ser miembro de la comunidad de la fila.
-- 3) communities: el dueño podía escribir cualquier columna directo (owner_id, invite_code, photo_url, logo_url),
--    salteando set_role / regenerate_invite / set_community_photo. Ahora directo solo name y slug; el resto, por las RPCs.
-- 4) profiles: se podía cambiar id / user_id / created_at propios (el WITH CHECK frenaba user_id, no id) y poner de foto
--    cualquier URL (un servidor propio veía la IP de todo el que abriera el grupo). Ahora la foto es de Google o del
--    bucket avatars. En el alta (handle_new_user) una foto que no cumple se descarta en vez de frenar el registro.
-- 5) El rol anon (sin sesión) no escribe en ninguna tabla: RLS ya lo frenaba; se le saca también el permiso.

begin;

-- ---------- 1) custom_stats: columnas editables y quién edita qué ----------
revoke update on custom_stats from anon, authenticated;
grant update (label, value, code, hidden) on custom_stats to authenticated;

-- SECURITY INVOKER a propósito: current_user es 'authenticated' cuando la escritura viene directo de la API y el dueño
-- de la función cuando viene de una RPC security definer (approve_claim), que no se frena.
create or replace function custom_stats_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if (new.label, new.value, new.code) is distinct from (old.label, old.value, old.code)
     and old.created_by is distinct from me() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function custom_stats_guard() from public, anon, authenticated;

drop trigger if exists custom_stats_guard on custom_stats;
create trigger custom_stats_guard before update on custom_stats
  for each row execute function custom_stats_guard();

-- ---------- 2) el jugador tiene que ser de esa comunidad ----------
drop policy if exists cs_ins on custom_stats;
create policy cs_ins on custom_stats for insert with check (
  created_by = me() and is_member(community_id)
  and exists (select 1 from memberships m
              where m.community_id = custom_stats.community_id and m.profile_id = custom_stats.target_id));

drop policy if exists sv_ins on stat_votes;
create policy sv_ins on stat_votes for insert with check (
  voter_id = me() and is_member(community_id)
  and exists (select 1 from memberships m
              where m.community_id = stat_votes.community_id and m.profile_id = stat_votes.target_id));

drop policy if exists sv_upd on stat_votes;
create policy sv_upd on stat_votes for update using (voter_id = me()) with check (
  voter_id = me() and is_member(community_id)
  and exists (select 1 from memberships m
              where m.community_id = stat_votes.community_id and m.profile_id = stat_votes.target_id));

-- ---------- 3) communities: directo solo nombre y slug ----------
revoke update on communities from anon, authenticated;
grant update (name, slug) on communities to authenticated;

-- ---------- 4) profiles: columnas editables y foto ----------
revoke update on profiles from anon, authenticated;
grant update (name, pos, photo_url, onboarded, nickname, shirt_number, fav_team, is_player, is_owner, role_chosen)
  on profiles to authenticated;

-- SECURITY INVOKER a propósito (igual que custom_stats_guard).
create or replace function profile_photo_guard() returns trigger
language plpgsql set search_path = public as $$
declare
  ok constant text := '^https://([a-z0-9-]+\.googleusercontent\.com/|[a-z0-9]+\.supabase\.co/storage/v1/object/public/avatars/)';
begin
  if tg_op = 'INSERT' then
    -- Alta: la foto sale de los datos que manda quien se registra. Si no cumple se descarta; el registro sigue.
    if new.photo_url is not null and new.photo_url !~ ok then new.photo_url := null; end if;
    return new;
  end if;
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if new.photo_url is not null and new.photo_url is distinct from old.photo_url and new.photo_url !~ ok then
    raise exception 'bad_photo';
  end if;
  return new;
end $$;
revoke execute on function profile_photo_guard() from public, anon, authenticated;

drop trigger if exists profile_photo_guard on profiles;
create trigger profile_photo_guard before insert or update of photo_url on profiles
  for each row execute function profile_photo_guard();

-- ---------- 5) sin sesión no se escribe en ninguna tabla ----------
revoke insert, update, delete, truncate, references, trigger on all tables in schema public from anon;

commit;

notify pgrst, 'reload schema';
