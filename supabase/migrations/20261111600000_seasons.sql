-- Temporadas y campeones. Idempotente; no borra datos (solo crea tablas y funciones y agrega un bloque a approve_claim).
--
-- 1) seasons: una comunidad tiene a lo sumo UNA temporada abierta (closed_at null). Las cerradas guardan ends_on.
-- 2) season_awards: los campeones de cada temporada cerrada (goleador, asistidor, figura, presente, fair_play).
--    Los empates dan varias filas (la clave es temporada + premio + jugador).
-- 3) RPCs solo para owner/admins: start_season, close_season (calcula los campeones), delete_season.
-- 4) community_mvp_matches: quién fue figura en cada partido jugado (con su fecha), para filtrar el ranking de
--    "Figura" por temporada en el cliente. Misma regla que community_mvps (gana el que más votos tiene; si hay
--    empate, son figura todos los que empatan).
-- 5) approve_claim: los premios del perfil que reclama pasan al perfil reclamado (ver el bloque DO de abajo).
--
-- Fechas: siempre día de Argentina (America/Argentina/Buenos_Aires). Un partido pertenece a la temporada si el día
-- de su starts_at cae entre starts_on y ends_on (inclusive; sin ends_on, sin tope).

-- =========================================================================================
-- 1) Temporadas
-- =========================================================================================
create table if not exists seasons (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities on delete cascade,
  name text not null check (length(trim(name)) between 1 and 40),
  starts_on date not null,
  ends_on date,
  closed_at timestamptz,
  created_by uuid references profiles on delete set null,
  created_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on),
  check (closed_at is null or ends_on is not null)
);
create index if not exists seasons_community_idx on seasons (community_id, starts_on desc);
-- A lo sumo una abierta por comunidad
create unique index if not exists seasons_one_open on seasons (community_id) where closed_at is null;

alter table seasons enable row level security;
-- Leen los miembros. Se crean, cierran y borran solo con las RPCs de abajo (no hay policies de escritura).
drop policy if exists se_read on seasons;
create policy se_read on seasons for select using (is_member(community_id));

-- =========================================================================================
-- 2) Campeones
-- =========================================================================================
create table if not exists season_awards (
  season_id uuid not null references seasons on delete cascade,
  kind text not null check (kind in ('goleador','asistidor','figura','presente','fair_play')),
  profile_id uuid not null references profiles on delete cascade,
  -- goleador: goles | asistidor: asistencias | figura: veces figura | presente: partidos jugados
  -- fair_play: puntos de sanción (2 por roja + 1 por amarilla + 0,25 por falta; menos es mejor)
  value numeric not null default 0,
  primary key (season_id, kind, profile_id)
);
create index if not exists season_awards_profile_idx on season_awards (profile_id);

alter table season_awards enable row level security;
drop policy if exists sa_read on season_awards;
create policy sa_read on season_awards for select using (
  exists (select 1 from seasons s where s.id = season_awards.season_id and is_member(s.community_id))
);

-- =========================================================================================
-- 3) Figura de cada partido jugado (para el ranking por temporada)
--    Una fila por partido y figura (si hay empate de votos, una por cada uno que empata).
-- =========================================================================================
create or replace function community_mvp_matches(p_community uuid)
returns table(match_id uuid, profile_id uuid, starts_at timestamptz)
language sql stable security definer set search_path = public as $$
  with t as (
    select v.match_id, v.target_id, count(*) n from mvp_votes v join matches m on m.id = v.match_id
    where m.community_id = p_community and m.status = 'played' group by 1, 2
  ), top as (
    select match_id, target_id from (select *, rank() over (partition by match_id order by n desc) r from t) x where r = 1
  )
  select top.match_id, top.target_id, m.starts_at
  from top join matches m on m.id = top.match_id
  where is_member(p_community)
$$;

-- =========================================================================================
-- 4) Empezar, cerrar y borrar temporadas (owner/admins)
-- =========================================================================================

-- start_season: abre una temporada. Errores: forbidden, bad_name, bad_dates, season_open (ya hay una abierta),
-- overlap (empieza antes o el mismo día en que terminó la última cerrada).
create or replace function start_season(p_community uuid, p_name text, p_starts date default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_name text := trim(coalesce(p_name, ''));
  v_start date; v_last date; v_id uuid;
begin
  if not is_admin(p_community) then raise exception 'forbidden'; end if;
  if length(v_name) not between 1 and 40 then raise exception 'bad_name'; end if;
  v_start := coalesce(p_starts, v_today);
  if v_start < date '2000-01-01' or v_start > v_today + 366 then raise exception 'bad_dates'; end if;
  if exists (select 1 from seasons where community_id = p_community and closed_at is null) then raise exception 'season_open'; end if;
  select max(ends_on) into v_last from seasons where community_id = p_community and closed_at is not null;
  if v_last is not null and v_start <= v_last then raise exception 'overlap'; end if;
  insert into seasons (community_id, name, starts_on, created_by)
    values (p_community, v_name, v_start, me()) returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'season_open';
end $$;

-- close_season: cierra la temporada y calcula los campeones con los partidos JUGADOS cuyo día (Argentina) cae entre
-- starts_on y la fecha de cierre (hoy si no se pasa p_ends; no puede ser futura ni anterior al inicio).
-- Solo cuentan los miembros actuales de la comunidad. Los ceros no ganan nada. Devuelve cuántos premios se dieron.
--   goleador  = más eventos 'goal'              asistidor = más eventos 'assist'
--   figura    = más veces figura del partido    presente  = más partidos jugados (anotado 'in' y sin faltar)
--   fair_play = entre los que jugaron 3 o más partidos, menos puntos de sanción (2 x roja + 1 x amarilla + 0,25 x falta).
--               No se da si nadie llegó a 3 partidos ni si todos los que llegaron tienen 0 (no hubo faltas cargadas).
-- Errores: forbidden, season_closed, bad_dates, future_end.
create or replace function close_season(p_season uuid, p_ends date default null) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_tz constant text := 'America/Argentina/Buenos_Aires';
  v_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  ss seasons; v_end date; v_n int;
begin
  select * into ss from seasons where id = p_season for update;
  if ss.id is null or not is_admin(ss.community_id) then raise exception 'forbidden'; end if;
  if ss.closed_at is not null then raise exception 'season_closed'; end if;
  v_end := coalesce(p_ends, v_today);
  if v_end < ss.starts_on then raise exception 'bad_dates'; end if;
  if v_end > v_today then raise exception 'future_end'; end if;

  with ms as (
    select m.id from matches m
    where m.community_id = ss.community_id and m.status = 'played'
      and (m.starts_at at time zone v_tz)::date between ss.starts_on and v_end
  ), mem as (
    select mb.profile_id from memberships mb where mb.community_id = ss.community_id
  ), ev as (
    select e.profile_id, e.kind, count(*)::numeric n
    from match_events e join ms on ms.id = e.match_id
    where e.profile_id in (select profile_id from mem)
    group by e.profile_id, e.kind
  ), pj as (
    select g.profile_id, count(*)::numeric n
    from match_signups g join ms on ms.id = g.match_id
    where g.status = 'in' and not g.absent and g.profile_id in (select profile_id from mem)
    group by g.profile_id
  ), mv as (
    select w.profile_id, count(*)::numeric n
    from community_mvp_matches(ss.community_id) w join ms on ms.id = w.match_id
    where w.profile_id in (select profile_id from mem)
    group by w.profile_id
  ), top as (
    select x.k, x.profile_id, x.v from (
      select c.*, max(c.v) over (partition by c.k) mx from (
        select 'goleador'::text k, profile_id, n v from ev where kind = 'goal'
        union all select 'asistidor', profile_id, n from ev where kind = 'assist'
        union all select 'figura', profile_id, n from mv
        union all select 'presente', profile_id, n from pj
      ) c where c.v > 0
    ) x where x.v = x.mx
  ), disc as (
    select profile_id,
           sum(case kind when 'red' then 2 * n when 'yellow' then n when 'foul' then 0.25 * n else 0 end) score
    from ev group by profile_id
  ), fair as (
    select q.profile_id, coalesce(d.score, 0) score
    from pj q left join disc d on d.profile_id = q.profile_id
    where q.n >= 3
  ), fair_top as (
    select 'fair_play'::text k, y.profile_id, y.score v from (
      select f.*, min(f.score) over () mn, max(f.score) over () mx from fair f
    ) y where y.score = y.mn and y.mx > 0
  )
  insert into season_awards (season_id, kind, profile_id, value)
  select ss.id, u.k, u.profile_id, u.v
  from (select k, profile_id, v from top union all select k, profile_id, v from fair_top) u;
  get diagnostics v_n = row_count;

  update seasons set ends_on = v_end, closed_at = now() where id = ss.id;
  return v_n;
end $$;

-- delete_season: borra una temporada (abierta o cerrada); sus campeones se borran con ella. La pantalla pide
-- confirmación y avisa cuántos premios se pierden.
create or replace function delete_season(p_season uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_comm uuid;
begin
  select community_id into v_comm from seasons where id = p_season;
  if v_comm is null or not is_admin(v_comm) then raise exception 'forbidden'; end if;
  delete from seasons where id = p_season;
end $$;

revoke execute on function community_mvp_matches(uuid) from public, anon;
revoke execute on function start_season(uuid, text, date) from public, anon;
revoke execute on function close_season(uuid, date) from public, anon;
revoke execute on function delete_season(uuid) from public, anon;
grant execute on function community_mvp_matches(uuid) to authenticated;
grant execute on function start_season(uuid, text, date) to authenticated;
grant execute on function close_season(uuid, date) to authenticated;
grant execute on function delete_season(uuid) to authenticated;

-- =========================================================================================
-- 5) approve_claim: los premios de temporada acompañan al perfil que queda
--    approve_claim borra el perfil del que reclama (y en cascada sus season_awards). Antes de borrarlo, sus premios
--    pasan al perfil reclamado; si los dos tenían el mismo premio en la misma temporada, queda uno solo.
--    Para no pisar lo que otros agreguen a esa función (Mati y Eduardo aplican SQL directo, y la migración de
--    complejos también la redefine), no se reescribe a mano: se toma la definición VIVA, se le agrega el bloque
--    justo antes de "delete from profiles where id = p_claimant;" y se vuelve a crear. Es idempotente (si ya
--    tiene season_awards no hace nada) y falla fuerte si no encuentra dónde agregarlo, sin tocar la función.
--    Si más adelante otra migración vuelve a crear approve_claim desde una versión vieja, correr de nuevo este bloque.
-- =========================================================================================
do $$
declare
  v_oid oid;
  v_def text;
  v_marker constant text := 'delete from profiles where id = p_claimant;';
  v_block constant text :=
    E'-- Trofeos de temporada: pasan al perfil que queda (si los dos tienen el mismo, queda uno)\n'
    || E'  delete from season_awards a where a.profile_id = p_claimant\n'
    || E'    and exists (select 1 from season_awards x where x.season_id = a.season_id and x.kind = a.kind and x.profile_id = p_placeholder);\n'
    || E'  update season_awards set profile_id = p_placeholder where profile_id = p_claimant;\n\n  ';
begin
  select p.oid into v_oid from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'approve_claim'
    and pg_get_function_identity_arguments(p.oid) = 'p_placeholder uuid, p_claimant uuid';
  if v_oid is null then
    raise notice 'approve_claim no existe en esta base: nada que actualizar';
    return;
  end if;
  v_def := pg_get_functiondef(v_oid);
  if position('season_awards' in v_def) > 0 then
    raise notice 'approve_claim ya mueve season_awards';
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_marker, ''))) / length(v_marker) <> 1 then
    raise exception 'approve_claim: no encontre un unico "%" para agregar los trofeos; revisar la definicion viva', v_marker;
  end if;
  execute replace(v_def, v_marker, v_block || v_marker);
end $$;

notify pgrst, 'reload schema';
