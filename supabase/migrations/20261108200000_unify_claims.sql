-- Unificación: approve_claim (de 20261107000000_nickname_shirt, de Mati) + las tablas nuevas.
-- La lógica de Mati queda IGUAL (copiada de la base en vivo); solo se agregan los pases de datos
-- de chat, reacciones, goles/tarjetas y suspensiones. Sin esto, al aprobar un reclamo se borraban
-- los mensajes y goles de quien reclama, y fallaba si había creado una suspensión (FK sin cascade).
create or replace function approve_claim(p_placeholder uuid, p_claimant uuid) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not exists (select 1 from memberships m where m.profile_id = p_placeholder and role_in(m.community_id) = 'owner')
    then raise exception 'forbidden'; end if;
  if not exists (select 1 from claims where placeholder_id = p_placeholder and claimant_id = p_claimant)
    then raise exception 'no_claim'; end if;
  select user_id into uid from profiles where id = p_claimant;
  insert into memberships (community_id, profile_id, role, joined_at)
    select community_id, p_placeholder, role, joined_at from memberships where profile_id = p_claimant
    on conflict (community_id, profile_id) do update set role =
      case when excluded.role = 'owner' or memberships.role = 'owner' then 'owner'
           when excluded.role = 'admin' or memberships.role = 'admin' then 'admin' else 'member' end;
  update communities set owner_id = p_placeholder where owner_id = p_claimant;
  update matches set created_by = p_placeholder where created_by = p_claimant;
  update matches set result_by = p_placeholder where result_by = p_claimant;
  insert into base_stats select p_placeholder, rit, tir, pas, reg, def, fis, now() from base_stats
    where profile_id = p_claimant on conflict (profile_id) do nothing;

  -- Nuevo: datos de chat, goles/tarjetas y suspensiones pasan al perfil que queda
  update messages set author_id = p_placeholder where author_id = p_claimant;
  delete from message_reactions r where r.profile_id = p_claimant
    and exists (select 1 from message_reactions x where x.message_id = r.message_id and x.profile_id = p_placeholder);
  update message_reactions set profile_id = p_placeholder where profile_id = p_claimant;
  update match_events set profile_id = p_placeholder where profile_id = p_claimant;
  update match_events set created_by = p_placeholder where created_by = p_claimant;
  update suspensions set profile_id = p_placeholder where profile_id = p_claimant;
  update suspensions set created_by = p_placeholder where created_by = p_claimant;

  update profiles set user_id = null where id = p_claimant;
  update profiles p set user_id = uid, onboarded = true,
    photo_url = coalesce(p.photo_url, c.photo_url),
    nickname = coalesce(p.nickname, c.nickname),
    shirt_number = coalesce(p.shirt_number, c.shirt_number),
    fav_team = coalesce(p.fav_team, c.fav_team)
    from profiles c where p.id = p_placeholder and c.id = p_claimant;
  delete from profiles where id = p_claimant;
  delete from claims where placeholder_id = p_placeholder;
end $$;
