-- Ausentes: ahora solo un admin (u owner) de la comunidad marca a alguien como ausente o presente.
-- Antes cualquier miembro podía, y marcar ausente borra las calificaciones de esa persona en ese partido.
-- Misma función que la versión viva (leída con pg_get_functiondef el 2026-11-12), solo cambia el chequeo de permiso.
-- create or replace conserva los permisos (EXECUTE solo para authenticated y service_role). Idempotente.

create or replace function set_absent(p_match uuid, p_profile uuid, p_absent boolean) returns void
language plpgsql security definer set search_path = public as $$
declare m matches;
begin
  select * into m from matches where id = p_match;
  if m.id is null or not is_admin(m.community_id) then raise exception 'forbidden'; end if;
  if m.status = 'cancelled' then raise exception 'cancelled'; end if;
  if m.starts_at > now() then raise exception 'not_started'; end if;
  update match_signups set absent = p_absent where match_id = p_match and profile_id = p_profile and status = 'in';
  if not found then raise exception 'not_player'; end if;
  -- Un ausente no califica ni es calificado en ese partido
  if p_absent then
    delete from match_ratings where match_id = p_match and (rater_id = p_profile or target_id = p_profile);
  end if;
end $$;

notify pgrst, 'reload schema';
