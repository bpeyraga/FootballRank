-- approve_claim: no perder datos del que reclama.
-- Antes: el perfil del que reclama se borraba y en cascada se perdían sus votos de stats, anotaciones,
-- calificaciones, stats de la casa, cervezas y avisos (no se movían al perfil reclamado). Además, si un admin
-- había precargado stats o datos en el placeholder, se descartaban los del dueño real.
-- Regla en conflictos: si los dos perfiles tienen algo en el mismo lugar (mismo partido, mismo voto), queda
-- lo del placeholder; los datos personales (autoevaluación, apodo, número, club) los decide el que reclama.
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

  -- Autoevaluación: manda la del dueño real (antes ganaba la precargada por un admin)
  insert into base_stats select p_placeholder, rit, tir, pas, reg, def, fis, now() from base_stats
    where profile_id = p_claimant
    on conflict (profile_id) do update set rit = excluded.rit, tir = excluded.tir, pas = excluded.pas,
      reg = excluded.reg, def = excluded.def, fis = excluded.fis, updated_at = now();

  -- Votos de stats (hechos y recibidos). Sin autovotos.
  delete from stat_votes v where v.voter_id = p_claimant and (v.target_id = p_placeholder
    or exists (select 1 from stat_votes x where x.voter_id = p_placeholder and x.community_id = v.community_id and x.target_id = v.target_id));
  update stat_votes set voter_id = p_placeholder where voter_id = p_claimant;
  delete from stat_votes v where v.target_id = p_claimant and (v.voter_id = p_placeholder
    or exists (select 1 from stat_votes x where x.target_id = p_placeholder and x.community_id = v.community_id and x.voter_id = v.voter_id));
  update stat_votes set target_id = p_placeholder where target_id = p_claimant;

  -- Stats de la casa (creadas y recibidas)
  delete from custom_stats s where s.created_by = p_claimant and exists (select 1 from custom_stats x
    where x.created_by = p_placeholder and x.community_id = s.community_id and x.target_id = s.target_id and lower(x.label) = lower(s.label));
  update custom_stats set created_by = p_placeholder where created_by = p_claimant;
  delete from custom_stats s where s.target_id = p_claimant and exists (select 1 from custom_stats x
    where x.target_id = p_placeholder and x.community_id = s.community_id and x.created_by = s.created_by and lower(x.label) = lower(s.label));
  update custom_stats set target_id = p_placeholder where target_id = p_claimant;

  -- Anotaciones a partidos
  delete from match_signups s where s.profile_id = p_claimant
    and exists (select 1 from match_signups x where x.match_id = s.match_id and x.profile_id = p_placeholder);
  update match_signups set profile_id = p_placeholder where profile_id = p_claimant;

  -- Calificaciones (hechas y recibidas). Sin autocalificación.
  delete from match_ratings r where r.rater_id = p_claimant and (r.target_id = p_placeholder
    or exists (select 1 from match_ratings x where x.match_id = r.match_id and x.rater_id = p_placeholder and x.target_id = r.target_id));
  update match_ratings set rater_id = p_placeholder where rater_id = p_claimant;
  delete from match_ratings r where r.target_id = p_claimant and (r.rater_id = p_placeholder
    or exists (select 1 from match_ratings x where x.match_id = r.match_id and x.target_id = p_placeholder and x.rater_id = r.rater_id));
  update match_ratings set target_id = p_placeholder where target_id = p_claimant;

  -- Cervezas
  delete from match_beers b where b.profile_id = p_claimant
    and exists (select 1 from match_beers x where x.match_id = b.match_id and x.profile_id = p_placeholder);
  update match_beers set profile_id = p_placeholder where profile_id = p_claimant;
  update match_beers set updated_by = p_placeholder where updated_by = p_claimant;

  -- Avisos al celular y canchas cargadas
  update push_subscriptions set profile_id = p_placeholder where profile_id = p_claimant;
  update venues set created_by = p_placeholder where created_by = p_claimant;

  -- Chat, eventos, suspensiones, figura, encuestas (igual que antes)
  update messages set author_id = p_placeholder where author_id = p_claimant;
  delete from message_reactions r where r.profile_id = p_claimant
    and exists (select 1 from message_reactions x where x.message_id = r.message_id and x.profile_id = p_placeholder);
  update message_reactions set profile_id = p_placeholder where profile_id = p_claimant;
  update match_events set profile_id = p_placeholder where profile_id = p_claimant;
  update match_events set created_by = p_placeholder where created_by = p_claimant;
  delete from suspensions s where s.profile_id = p_claimant and s.match_id is null
    and exists (select 1 from suspensions x where x.profile_id = p_placeholder
                and x.community_id = s.community_id and x.match_id is null);
  update suspensions set profile_id = p_placeholder where profile_id = p_claimant;
  update suspensions set created_by = p_placeholder where created_by = p_claimant;
  delete from mvp_votes v where v.voter_id = p_claimant
    and (v.target_id = p_placeholder
         or exists (select 1 from mvp_votes x where x.match_id = v.match_id and x.voter_id = p_placeholder));
  update mvp_votes set voter_id = p_placeholder where voter_id = p_claimant;
  delete from mvp_votes v where v.target_id = p_claimant and v.voter_id = p_placeholder;
  update mvp_votes set target_id = p_placeholder where target_id = p_claimant;
  delete from poll_votes v where v.profile_id = p_claimant
    and exists (select 1 from poll_votes x where x.poll_id = v.poll_id and x.profile_id = p_placeholder);
  update poll_votes set profile_id = p_placeholder where profile_id = p_claimant;
  update polls set created_by = p_placeholder where created_by = p_claimant;
  update match_schedules set created_by = p_placeholder where created_by = p_claimant;

    -- Datos personales: apodo, número y club, los del dueño real; nombre y foto, los del placeholder.
  update profiles set user_id = null where id = p_claimant;
  update profiles p set user_id = uid, onboarded = true,
    -- el nombre queda como lo conoce el grupo (el del placeholder); la posición la elige el dueño
    pos = coalesce(c.pos, p.pos),
    photo_url = coalesce(p.photo_url, c.photo_url),
    nickname = coalesce(c.nickname, p.nickname),
    shirt_number = coalesce(c.shirt_number, p.shirt_number),
    fav_team = coalesce(c.fav_team, p.fav_team)
    from profiles c where p.id = p_placeholder and c.id = p_claimant;
  delete from profiles where id = p_claimant;
  delete from claims where placeholder_id = p_placeholder;
end $$;

-- Sacar a un jugador sin cuenta: además de la membresía, si no está en ninguna otra comunidad se borra el perfil
-- (antes quedaba huérfano para siempre: nadie lo podía reclamar, volver a agregar ni borrar).
create or replace function remove_placeholder(p_community uuid, p_profile uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin(p_community) then raise exception 'forbidden'; end if;
  if exists (select 1 from profiles where id = p_profile and user_id is not null) then raise exception 'has_account'; end if;
  delete from memberships where community_id = p_community and profile_id = p_profile and role = 'member';
  if not found then raise exception 'not_member'; end if;
  if not exists (select 1 from memberships where profile_id = p_profile) then
    delete from profiles where id = p_profile and user_id is null;
  end if;
end $$;
revoke execute on function remove_placeholder(uuid, uuid) from public, anon;
grant execute on function remove_placeholder(uuid, uuid) to authenticated;
