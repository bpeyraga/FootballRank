-- Faltas y partido en vivo. Idempotente; no borra datos (solo agrega columnas/funciones y reemplaza un check, una policy y dos funciones).
--
-- 1) match_events: 'foul' (falta) entre los tipos, y minute (minuto del partido en que pasó; null = sin dato).
-- 2) matches: reloj en vivo (live_state / live_half / live_since / live_elapsed).
-- 3) RPC live_clock: arrancar, pausar, reanudar, segundo tiempo, terminar y reiniciar el reloj. Solo owner/admins.
-- 4) ev_ins: además de los partidos jugados, deja cargar eventos mientras el partido está en vivo.
-- 5) load_played_match: acepta 'foul' en los eventos (carga rápida).
-- 5b) set_result: un partido en vivo se puede cerrar aunque lo hayan arrancado antes de la hora.
-- 6) Realtime para matches y match_events (respeta RLS: solo los miembros de la comunidad reciben los cambios).

-- =========================================================================================
-- 1) Eventos: tipo 'foul' y minuto
-- =========================================================================================
alter table match_events drop constraint if exists match_events_kind_check;
alter table match_events add constraint match_events_kind_check
  check (kind in ('goal','assist','yellow','red','foul'));

alter table match_events add column if not exists minute smallint;
alter table match_events drop constraint if exists match_events_minute_check;
alter table match_events add constraint match_events_minute_check
  check (minute is null or minute between 0 and 200);

-- =========================================================================================
-- 2) Reloj en vivo del partido
--    live_state   null = no se está jugando en vivo | 'running' | 'paused' | 'ended'
--    live_half    1 | 2 (null si no está en vivo)
--    live_since   cuándo arrancó el tramo que está corriendo (null si está en pausa o terminó)
--    live_elapsed segundos acumulados ANTES de live_since (si está en pausa o terminó, es el total)
--    Tiempo del partido = live_elapsed + (ahora - live_since si está 'running').
-- =========================================================================================
alter table matches add column if not exists live_state text;
alter table matches add column if not exists live_half smallint;
alter table matches add column if not exists live_since timestamptz;
alter table matches add column if not exists live_elapsed integer not null default 0;

alter table matches drop constraint if exists matches_live_state_check;
alter table matches add constraint matches_live_state_check
  check (live_state is null or live_state in ('running','paused','ended'));
alter table matches drop constraint if exists matches_live_half_check;
alter table matches add constraint matches_live_half_check
  check (live_half is null or live_half in (1,2));
alter table matches drop constraint if exists matches_live_elapsed_check;
alter table matches add constraint matches_live_elapsed_check
  check (live_elapsed >= 0);

-- =========================================================================================
-- 3) live_clock(p_match, p_action): 'start' | 'pause' | 'resume' | 'half' | 'end' | 'reset'
--    Autorización: owner/admins de la comunidad, igual que cargar el resultado (set_result) y los eventos (ev_ins).
--    Los capitanes y quien creó el partido NO pueden hoy ni cargar eventos ni resultado: se mantiene igual.
--    - start : arranca el 1er tiempo (desde 0). Desde 2 horas antes de la hora del partido y hasta 24 horas después. Solo si no estaba en vivo.
--    - pause : frena el reloj (running -> paused).
--    - resume: lo vuelve a correr (paused/ended -> running); sirve también para deshacer un "terminar" por error.
--    - half  : empieza el 2º tiempo (solo desde el 1º). El reloj SIGUE contando desde lo acumulado (no vuelve a 0):
--              si el 1er tiempo duró 25 min, el 2º arranca en 25:00 y los minutos de los eventos son continuos.
--              El entretiempo se hace con "pause" antes.
--    - end   : termina el reloj (running/paused -> ended). NO cambia el estado ni el resultado del partido:
--              el admin confirma el marcador con set_result (que ya pasa el partido a "jugado").
--    - reset : borra el reloj (vuelve a "no en vivo"). No borra los eventos cargados.
--    Devuelve el reloj nuevo y la hora del servidor ("now") para que el cliente corrija su reloj.
-- =========================================================================================
create or replace function live_clock(p_match uuid, p_action text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m matches; el int; t timestamptz := now();
begin
  select * into m from matches where id = p_match for update;
  if m.id is null or not is_admin(m.community_id) then raise exception 'forbidden'; end if;
  if m.status = 'cancelled' then raise exception 'cancelled'; end if;
  if m.status = 'played' then raise exception 'live_over'; end if;
  if p_action is null or p_action not in ('start','pause','resume','half','end','reset') then raise exception 'bad_action'; end if;

  -- segundos acumulados hasta este instante
  el := m.live_elapsed + case when m.live_state = 'running' and m.live_since is not null
                              then greatest(0, floor(extract(epoch from (t - m.live_since))))::int else 0 end;

  if p_action = 'start' then
    if m.live_state is not null then raise exception 'bad_state'; end if;
    if m.starts_at > t + interval '2 hours' then raise exception 'too_early'; end if;
    if m.starts_at < t - interval '24 hours' then raise exception 'too_late'; end if;
    update matches set live_state = 'running', live_half = 1, live_since = t, live_elapsed = 0 where id = p_match;
  elsif p_action = 'pause' then
    if m.live_state is distinct from 'running' then raise exception 'bad_state'; end if;
    update matches set live_state = 'paused', live_since = null, live_elapsed = el where id = p_match;
  elsif p_action = 'resume' then
    if m.live_state is null or m.live_state = 'running' then raise exception 'bad_state'; end if;
    update matches set live_state = 'running', live_since = t where id = p_match;
  elsif p_action = 'half' then
    if coalesce(m.live_state, '') not in ('running','paused') or m.live_half is distinct from 1 then raise exception 'bad_state'; end if;
    update matches set live_state = 'running', live_half = 2, live_since = t, live_elapsed = el where id = p_match;
  elsif p_action = 'end' then
    if coalesce(m.live_state, '') not in ('running','paused') then raise exception 'bad_state'; end if;
    update matches set live_state = 'ended', live_since = null, live_elapsed = el where id = p_match;
  else -- reset
    if m.live_state is null then raise exception 'bad_state'; end if;
    update matches set live_state = null, live_half = null, live_since = null, live_elapsed = 0 where id = p_match;
  end if;

  select * into m from matches where id = p_match;
  return jsonb_build_object('live_state', m.live_state, 'live_half', m.live_half,
    'live_since', m.live_since, 'live_elapsed', m.live_elapsed, 'now', t);
end $$;
revoke execute on function live_clock(uuid, text) from public, anon;
grant execute on function live_clock(uuid, text) to authenticated;

-- Hora del servidor: el cliente la usa para corregir un reloj de celular desfasado y que todos vean el mismo cronómetro.
create or replace function live_now() returns timestamptz language sql stable as $$ select now() $$;
revoke execute on function live_now() from public, anon;
grant execute on function live_now() to authenticated;

-- =========================================================================================
-- 4) Cargar eventos: partido jugado (como hasta ahora) o partido en vivo (todavía open/closed con el reloj andando).
--    Se mantiene el resto de la policy: lo carga un owner/admin, el jugador es miembro y está anotado ('in').
-- =========================================================================================
drop policy if exists ev_ins on match_events;
create policy ev_ins on match_events for insert with check (
  created_by = me()
  and is_admin(community_id)
  and exists (select 1 from matches m
              where m.id = match_events.match_id
                and m.community_id = match_events.community_id
                and (m.status = 'played'
                     or (m.status in ('open','closed') and m.live_state is not null)))
  and exists (select 1 from memberships mb
              where mb.community_id = match_events.community_id
                and mb.profile_id = match_events.profile_id)
  and exists (select 1 from match_signups js
              where js.match_id = match_events.match_id
                and js.profile_id = match_events.profile_id
                and js.status = 'in')
);

-- =========================================================================================
-- 5) load_played_match: igual que la versión viva (20261110200000_quick_match.sql), solo suma 'foul' a los tipos válidos.
-- =========================================================================================
create or replace function load_played_match(
  p_community uuid, p_title text, p_starts_at timestamptz, p_location text, p_venue uuid,
  p_players jsonb, p_a int, p_b int, p_events jsonb default '[]'
) returns uuid language plpgsql security definer set search_path = public as $$
declare mid uuid; n int;
begin
  if not is_admin(p_community) then raise exception 'forbidden'; end if;
  if p_starts_at is null or p_starts_at > now() then raise exception 'not_started'; end if;
  if p_a is null or p_b is null or p_a not between 0 and 99 or p_b not between 0 and 99 then raise exception 'bad_score'; end if;
  if p_venue is not null and not exists (select 1 from venues where id = p_venue and community_id = p_community)
    then raise exception 'bad_venue'; end if;
  if jsonb_typeof(p_players) <> 'array' or jsonb_array_length(p_players) > 80
     or jsonb_typeof(coalesce(p_events, '[]')) <> 'array' or jsonb_array_length(coalesce(p_events, '[]')) > 300
    then raise exception 'bad_input'; end if;

  create temp table _pl on commit drop as
    select distinct on (x.id) x.id, nullif(x.team, '') as team
    from jsonb_to_recordset(p_players) as x(id uuid, team text) where x.id is not null;
  select count(*) into n from _pl;
  if n < 2 then raise exception 'few_players'; end if;
  if exists (select 1 from _pl where team is not null and team not in ('A', 'B')) then raise exception 'bad_team'; end if;
  if exists (select 1 from _pl where not exists (
      select 1 from memberships m where m.community_id = p_community and m.profile_id = _pl.id))
    then raise exception 'not_member'; end if;
  if exists (select 1 from jsonb_to_recordset(coalesce(p_events, '[]')) as e(id uuid, kind text)
      where e.kind is null or e.kind not in ('goal', 'assist', 'yellow', 'red', 'foul')
         or not exists (select 1 from _pl where _pl.id = e.id))
    then raise exception 'bad_event'; end if;

  insert into matches (community_id, created_by, title, starts_at, location, venue_id, slots, status, score_a, score_b, result_by)
    values (p_community, me(), coalesce(nullif(trim(p_title), ''), 'Partido'), p_starts_at,
            nullif(trim(coalesce(p_location, '')), ''), p_venue, least(greatest(n, 2), 40), 'played', p_a, p_b, me())
    returning id into mid;
  insert into match_signups (match_id, profile_id, status, team) select mid, id, 'in', team from _pl;
  insert into match_events (match_id, community_id, profile_id, kind, created_by)
    select mid, p_community, e.id, e.kind, me() from jsonb_to_recordset(coalesce(p_events, '[]')) as e(id uuid, kind text);
  return mid;
end $$;
grant execute on function load_played_match(uuid, text, timestamptz, text, uuid, jsonb, int, int, jsonb) to authenticated;

-- =========================================================================================
-- 5b) set_result: igual que la versión viva (20261106140000_hardening.sql), con UN cambio: "not_started" (el partido
--     todavía no empezó) no corre si el reloj en vivo está andando o terminó. live_clock deja arrancar hasta 2 horas antes
--     de la hora, y sin esto ese partido no se podía cerrar hasta que pasara la hora.
-- =========================================================================================
create or replace function set_result(p_match uuid, p_a int, p_b int) returns void
language plpgsql security definer set search_path = public as $$
declare m matches;
begin
  select * into m from matches where id = p_match for update;
  if m.id is null or not is_admin(m.community_id) then raise exception 'forbidden'; end if;
  if m.status = 'cancelled' then raise exception 'cancelled'; end if;
  if m.starts_at > now() and m.live_state is null then raise exception 'not_started'; end if;
  if p_a is null or p_b is null or p_a not between 0 and 99 or p_b not between 0 and 99 then
    raise exception 'bad_score';
  end if;
  update matches set score_a = p_a, score_b = p_b, result_by = me(), status = 'played' where id = p_match;
end $$;

-- =========================================================================================
-- 6) Realtime: el reloj (matches) y los eventos (match_events) llegan en vivo a quien tenga abierto el partido.
--    Supabase Realtime respeta RLS (mt_read / ev_read: solo miembros de la comunidad).
-- =========================================================================================
do $$ begin
  alter publication supabase_realtime add table matches;
exception when duplicate_object then null; when undefined_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table match_events;
exception when duplicate_object then null; when undefined_object then null;
end $$;

notify pgrst, 'reload schema';
