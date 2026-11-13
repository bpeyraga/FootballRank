-- Votar después del partido sin depender de que un admin lo marque "jugado" + avisos para que nadie se olvide. Idempotente; no borra datos.
--
-- Problema: la figura (MVP) y las calificaciones solo se podían cargar con el partido en 'played', y eso lo hace un admin al cargar el
-- resultado. Si no lo hace, no se puede votar nunca y el único aviso (push_on_played) tampoco sale.
--
-- 1) Se puede votar la figura y calificar al equipo con el partido 'played' O, sin que nadie lo haya marcado, desde 2 h después de la
--    hora de inicio y hasta 7 días (match_voting_open). NO se cambia el status a 'played' solo: 'played' alimenta estadísticas, ranking,
--    temporadas, rachas y cobros, y un partido sin resultado ni goles las ensuciaría. El que sí tiene el resultado lo sigue marcando el admin.
-- 2) vote_mvp: se unifica la versión viva (20261109200000_mvp.sql: ya no pide equipo asignado en ninguna de las dos puntas, porque en
--    producción el único partido 'played' tiene a los 10 anotados sin equipo y entonces nadie podía votar) con la del repo
--    (20261110300000: miembro de la comunidad, votación cerrada a los 7 días). Se mantiene el código de error 'not_in_match' de la viva.
--    rate_teammates: igual que la viva (20261108000000_absences.sql); solo cambia la condición del estado.
-- 3) Avisos (Edge Function `push`, tipos nuevos 'vote' y 'vote_last'; se despliega ANTES de aplicar esto: si no, el tipo no existe y el
--    aviso se pierde marcado como enviado):
--      vote       2 h después de que empieza el partido (o al cargar el resultado, si fue antes): a los que jugaron y no votaron.
--                 Una sola vez por partido (vote_notified_at); push_on_played lo marca también, así no sale dos veces.
--                 Entre las 23:30 y las 9:00 (hora AR) no se manda: espera a la mañana.
--      vote_last  "Última llamada": al día siguiente de las 11:00 a las 21:00, una sola vez (vote_reminded_at), solo a los que todavía no
--                 votaron la figura y como mínimo 10 h después del primero (para que un aviso diferido a la mañana no tenga otro encima).
--    Un partido que nadie marcó como jugado recibe avisos solo si hay 4 o más anotados presentes (si no, probablemente no se jugó).
-- 4) my_pending_votes(): los partidos de los últimos 3 días donde jugaste y todavía no votaste la figura (la app lo pide al abrir).

begin;

alter table matches add column if not exists vote_notified_at timestamptz;
alter table matches add column if not exists vote_reminded_at timestamptz;

-- Los partidos ya marcados como jugados en los últimos 3 días recibieron "¿Quién fue la figura?" del trigger viejo: se marcan como
-- avisados para que el reloj no mande el mismo aviso otra vez apenas se aplique esto (la "última llamada" del día siguiente sí les llega).
update matches set vote_notified_at = now()
  where vote_notified_at is null and status = 'played' and starts_at > now() - interval '3 days';

-- ---------- Helpers ----------

-- ¿Se puede votar (figura / calificar) en un partido con este estado y esta hora de inicio?
create or replace function match_voting_open(p_status text, p_starts timestamptz) returns boolean
language sql stable set search_path = public as $$
  select case
    when p_status = 'played' then true
    when p_status in ('open', 'closed') then p_starts <= now() - interval '2 hours' and p_starts > now() - interval '7 days'
    else false
  end
$$;
revoke all on function match_voting_open(text, timestamptz) from public, anon;
grant execute on function match_voting_open(text, timestamptz) to authenticated, service_role;

-- Horas en que no se mandan avisos de "votá" (hora de Argentina): de 23:30 a 9:00.
create or replace function push_quiet_hours() returns boolean
language sql stable set search_path = public as $$
  select (now() at time zone 'America/Argentina/Buenos_Aires')::time < time '09:00'
      or (now() at time zone 'America/Argentina/Buenos_Aires')::time >= time '23:30'
$$;
revoke all on function push_quiet_hours() from public, anon, authenticated;

-- ---------- Votar la figura ----------
create or replace function vote_mvp(p_match uuid, p_target uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m matches;
begin
  select * into m from matches where id = p_match;
  if m.id is null or not is_member(m.community_id) then raise exception 'forbidden'; end if;
  if not match_voting_open(m.status, m.starts_at) then raise exception 'not_played'; end if;
  if m.starts_at < now() - interval '7 days' then raise exception 'mvp_closed'; end if;
  if p_target = me() then raise exception 'self_vote'; end if;
  if not exists (select 1 from match_signups where match_id = p_match and profile_id = me()
                 and status = 'in' and not absent) then raise exception 'not_player'; end if;
  if not exists (select 1 from match_signups where match_id = p_match and profile_id = p_target
                 and status = 'in' and not absent) then raise exception 'not_in_match'; end if;
  insert into mvp_votes (match_id, voter_id, target_id) values (p_match, me(), p_target)
    on conflict (match_id, voter_id) do update set target_id = excluded.target_id, created_at = now();
end $$;
revoke execute on function vote_mvp(uuid, uuid) from public, anon;
grant execute on function vote_mvp(uuid, uuid) to authenticated, service_role;

-- ---------- Calificar a los compañeros ----------
create or replace function rate_teammates(p_match uuid, p_scores jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare my_team text; k text; v int; m matches;
begin
  select * into m from matches where id = p_match;
  if m.id is null or not match_voting_open(m.status, m.starts_at) then raise exception 'not_played'; end if;
  select team into my_team from match_signups
    where match_id = p_match and profile_id = me() and status = 'in' and not absent;
  if my_team is null then raise exception 'not_player'; end if;
  for k, v in select key, value::int from jsonb_each_text(p_scores) loop
    if k::uuid = me() then continue; end if;
    if not exists (select 1 from match_signups where match_id = p_match and profile_id = k::uuid
                   and status = 'in' and team = my_team and not absent) then raise exception 'not_teammate'; end if;
    insert into match_ratings (match_id, rater_id, target_id, score) values (p_match, me(), k::uuid, v)
      on conflict (match_id, rater_id, target_id) do update set score = excluded.score;
  end loop;
end $$;
revoke execute on function rate_teammates(uuid, jsonb) from public, anon;
grant execute on function rate_teammates(uuid, jsonb) to authenticated, service_role;

-- ---------- Partidos con voto pendiente (los pide la app al abrir) ----------
-- mates = compañeros de mi equipo (a quienes puedo calificar; 0 si no hay equipos); rated = cuántos ya califiqué.
create or replace function my_pending_votes()
returns table (match_id uuid, community_id uuid, slug text, community_name text, title text, starts_at timestamptz,
               status text, mates int, rated int)
language sql stable security definer set search_path = public as $$
  select m.id, m.community_id, c.slug, c.name, m.title, m.starts_at, m.status,
         case when s.team is null then 0 else
           (select count(*)::int from match_signups t where t.match_id = m.id and t.team = s.team
              and t.status = 'in' and not t.absent and t.profile_id <> s.profile_id) end,
         (select count(*)::int from match_ratings r where r.match_id = m.id and r.rater_id = s.profile_id)
  from match_signups s
  join matches m on m.id = s.match_id
  join communities c on c.id = m.community_id
  where s.profile_id = me() and s.status = 'in' and not s.absent
    and m.starts_at <= now() and m.starts_at > now() - interval '3 days'
    and match_voting_open(m.status, m.starts_at) and is_member(m.community_id)
    and (m.status = 'played' or (select count(*) from match_signups x where x.match_id = m.id and x.status = 'in' and not x.absent) >= 4)
    and not exists (select 1 from mvp_votes v where v.match_id = m.id and v.voter_id = s.profile_id)
  order by m.starts_at desc
  limit 5
$$;
revoke all on function my_pending_votes() from public, anon;
grant execute on function my_pending_votes() to authenticated, service_role;

-- ---------- "Votá la figura" al cargar el resultado ----------
-- Igual que la versión viva (solo sale al pasar a 'played' un partido de los últimos 2 días); ahora además marca vote_notified_at para que
-- el reloj no repita el aviso, y de noche lo deja para el reloj (que lo manda a la mañana).
-- (El update de abajo toca vote_notified_at, que no está en la lista del trigger: no lo vuelve a disparar.)
create or replace function push_on_played() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'played' and old.status is distinct from 'played' and new.starts_at > now() - interval '2 days'
     and new.vote_notified_at is null and not push_quiet_hours() then
    update matches set vote_notified_at = now() where id = new.id;
    perform push_call(jsonb_build_object('type', 'mvp', 'match_id', new.id));
  end if;
  return null;
end $$;

-- ---------- Reloj ----------
-- Igual que la versión viva (20261111000000_push_more.sql, verificada con pg_get_functiondef el 2026-11-13) + dos bloques: "votá" y
-- "última llamada".
create or replace function push_tick() returns void
language plpgsql security definer set search_path = public as $$
declare r record;
  local_now timestamp := now() at time zone 'America/Argentina/Buenos_Aires';
begin
  for r in update matches set reminded_at = now()
      where reminded_at is null and status in ('open', 'closed')
        and starts_at > now() and starts_at <= now() + interval '60 minutes'
      returning id loop
    perform push_call(jsonb_build_object('type', 'reminder', 'match_id', r.id));
  end loop;
  for r in update matches set teams_notified_at = now()
      where teams_at is not null and teams_at < now() - interval '1 minute'
        and (teams_notified_at is null or teams_notified_at < teams_at)
        and status in ('open', 'closed') and starts_at > now()
      returning id loop
    perform push_call(jsonb_build_object('type', 'teams', 'match_id', r.id));
  end loop;
  for r in update matches m set fee_reminded_at = now()
      where m.fee_reminded_at is null and m.fee_total > 0 and m.status = 'played'
        and m.starts_at < now() - interval '12 hours' and m.starts_at > now() - interval '7 days'
        and exists (select 1 from match_signups s where s.match_id = m.id and s.status = 'in' and not s.absent and s.paid_at is null)
      returning m.id loop
    perform push_call(jsonb_build_object('type', 'fee', 'match_id', r.id));
  end loop;
  -- Hoy jugás: desde las 10:00, partidos de hoy que arrancan en más de 90 min (si no, ya cubre "falta 1 hora").
  if local_now::time >= time '10:00' then
    for r in update matches set today_notified_at = now()
        where today_notified_at is null and status in ('open', 'closed')
          and (starts_at at time zone 'America/Argentina/Buenos_Aires')::date = local_now::date
          and starts_at > now() + interval '90 minutes'
        returning id loop
      perform push_call(jsonb_build_object('type', 'today', 'match_id', r.id));
    end loop;
  end if;
  -- Votá la figura: 2 h después de que empezó (hasta 36 h: si cae de noche, sale a la mañana). Una sola vez por partido.
  if not push_quiet_hours() then
    for r in update matches m set vote_notified_at = now()
        where m.vote_notified_at is null and m.status in ('open', 'closed', 'played')
          and m.starts_at <= now() - interval '2 hours' and m.starts_at > now() - interval '36 hours'
          and (m.status = 'played'
               or (select count(*) from match_signups s where s.match_id = m.id and s.status = 'in' and not s.absent) >= 4)
        returning m.id loop
      perform push_call(jsonb_build_object('type', 'vote', 'match_id', r.id));
    end loop;
  end if;
  -- Última llamada: al día siguiente, de 11:00 a 21:00, una sola vez y solo si queda alguien que no votó la figura.
  if local_now::time >= time '11:00' and local_now::time < time '21:00' then
    for r in update matches m set vote_reminded_at = now()
        where m.vote_reminded_at is null and m.vote_notified_at is not null
          and m.vote_notified_at <= now() - interval '10 hours'
          and m.status in ('open', 'closed', 'played')
          and m.starts_at > now() - interval '3 days'
          and (m.starts_at at time zone 'America/Argentina/Buenos_Aires')::date < local_now::date
          and exists (select 1 from match_signups s where s.match_id = m.id and s.status = 'in' and not s.absent
                      and not exists (select 1 from mvp_votes v where v.match_id = m.id and v.voter_id = s.profile_id))
        returning m.id loop
      perform push_call(jsonb_build_object('type', 'vote_last', 'match_id', r.id));
    end loop;
  end if;
end $$;
revoke all on function push_tick() from public, anon, authenticated;

commit;
