-- "¿Dónde jugás?" y "Ranking de tu zona". Idempotente; no borra datos (solo crea tablas, un trigger, índices y funciones,
-- y agrega un bloque a approve_claim).
--
-- Privacidad (decisión de diseño):
--   * La zona NO vive en `profiles`. Esa tabla se lee entera (`select('*')`, `profile:profiles(*)`) por cualquiera que comparta una
--     comunidad, y quitarle columnas a `authenticated` rompería esas consultas. Va en su propia tabla `player_zones`, con RLS "solo el dueño"
--     y sin policies de escritura: se escribe únicamente con las RPCs de abajo.
--   * Se guarda solo una ubicación gruesa: lat/lng redondeadas a 2 decimales (~1 km) + una etiqueta (barrio/ciudad). Nunca una dirección.
--     El redondeo lo hace set_my_zone y además lo exige un CHECK de la tabla.
--   * Participar es opt-in: `public` arranca en false. Con false la persona puede ver el ranking pero no aparece.
--   * Las coordenadas de otros jugadores NO salen nunca de la base: zone_ranking devuelve solo la etiqueta y una BANDA de distancia
--     (2, 5, 10, 25 o 50 = "a menos de X km"), no kilómetros exactos.
--   * Contra la ubicación por trilateración / barrido (mover mi zona a distintos puntos y mirar a quién veo):
--       - zone_ranking mide desde la zona GUARDADA de quien consulta (no acepta lat/lng por parámetro) y solo acepta radios 5/10/25/50;
--       - set_my_zone limita los MOVIMIENTOS de ubicación a 3 por cada 24 h móviles (player_zone_moves). Cambiar solo el nombre o el
--         "aparecer", o volver a guardar la misma celda de ~1 km, no cuenta. Quitar la zona y volver a ponerla tampoco lo esquiva: el
--         registro no se borra con la zona.
--
-- OVR: se calcula en el cliente con el mismo ovr() de siempre. zone_ranking devuelve los seis atributos como la app los arma:
--   promedio de TODOS los votos que recibió el jugador (en todas sus comunidades; es lo que community_ranking hace por comunidad,
--   pero sin separar comunidades) y, si nadie lo votó, su autoevaluación (base_stats).
--   Partidos, goles, asistencias y figuras: histórico de partidos jugados (status = 'played'), igual que statsCore / community_mvps.
--   PJ = anotado ('in') y no ausente. Figura = el que más votos de MVP tuvo en el partido (empate: todos los empatados).
--   Con el tope de filas (p_limit) se quedan primero los jugadores con votos, después los mejores por promedio de atributos y por último
--   los más cercanos: así los autoevaluados no desplazan a los votados.
--
-- Efectos laterales:
--   * Cuando un perfil deja de tener cuenta (user_id pasa a null: se borró la cuenta o se reclamó un perfil), el trigger borra su zona.
--   * approve_claim (ver el bloque DO del final) copia la zona del que reclama al perfil que queda ANTES de soltar la cuenta.

-- =========================================================================================
-- 1) Tabla: una zona por jugador
-- =========================================================================================
create table if not exists player_zones (
  profile_id uuid primary key references profiles on delete cascade,
  label text not null check (length(trim(label)) between 1 and 60),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  public boolean not null default false,
  updated_at timestamptz not null default now(),
  -- ubicación gruesa por construcción: dos decimales como máximo
  constraint player_zones_coarse check (
    lat = round(lat::numeric, 2)::double precision and lng = round(lng::numeric, 2)::double precision)
);

alter table player_zones enable row level security;
-- Solo el dueño lee su fila. No hay policies de insert/update/delete: se escribe con set_my_zone / clear_my_zone.
drop policy if exists pz_read on player_zones;
create policy pz_read on player_zones for select using (profile_id = me());

revoke all on player_zones from anon, authenticated;
grant select on player_zones to authenticated;

-- Registro de movimientos de ubicación (para limitarlos). Aparte de player_zones a propósito: quitar la zona no lo borra.
-- Sin policies: nadie lo lee ni lo escribe desde la API, solo set_my_zone (security definer).
create table if not exists player_zone_moves (
  profile_id uuid not null references profiles on delete cascade,
  moved_at timestamptz not null default now()
);
create index if not exists player_zone_moves_idx on player_zone_moves (profile_id, moved_at desc);
alter table player_zone_moves enable row level security;
revoke all on player_zone_moves from anon, authenticated;

-- Índices que usa zone_ranking (las claves primarias no cubren la búsqueda por jugador)
create index if not exists stat_votes_target_idx on stat_votes (target_id);
create index if not exists match_signups_profile_idx on match_signups (profile_id);
create index if not exists match_events_profile_idx on match_events (profile_id);
create index if not exists memberships_profile_idx on memberships (profile_id);

-- =========================================================================================
-- 2) Cuando el perfil pierde la cuenta, se va la zona
-- =========================================================================================
create or replace function player_zone_cleanup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from player_zones where profile_id = old.id;
  return null;
end $$;
revoke all on function player_zone_cleanup() from public, anon, authenticated;

drop trigger if exists player_zone_cleanup on profiles;
create trigger player_zone_cleanup after update of user_id on profiles
  for each row when (old.user_id is not null and new.user_id is null)
  execute function player_zone_cleanup();

-- =========================================================================================
-- 3) Guardar y quitar mi zona (solo la propia)
--    Mover la ubicación (otra celda de ~1 km, o la primera vez) cuenta como un movimiento: máximo 3 cada 24 h móviles.
--    Error 'too_many_moves' al pasarse. Cambiar el nombre o el "aparecer" no cuenta.
-- =========================================================================================
create or replace function set_my_zone(p_label text, p_lat double precision, p_lng double precision, p_public boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := me();
  v_label text := trim(coalesce(p_label, ''));
  v_lat double precision;
  v_lng double precision;
  v_prev player_zones%rowtype;
  v_max_moves constant int := 3;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if length(v_label) not between 1 and 60 then raise exception 'bad_label'; end if;
  -- NaN e Infinity quedan afuera: para Postgres son mayores que cualquier número
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180
    then raise exception 'bad_coords'; end if;
  v_lat := round(p_lat::numeric, 2)::double precision;
  v_lng := round(p_lng::numeric, 2)::double precision;

  -- Dos llamadas a la vez del mismo jugador no pueden pasarse del tope
  perform 1 from profiles where id = v_me for update;
  select * into v_prev from player_zones where profile_id = v_me;
  if not found or v_prev.lat is distinct from v_lat or v_prev.lng is distinct from v_lng then
    delete from player_zone_moves where profile_id = v_me and moved_at < now() - interval '24 hours';
    if (select count(*) from player_zone_moves where profile_id = v_me) >= v_max_moves then
      raise exception 'too_many_moves';
    end if;
    insert into player_zone_moves (profile_id) values (v_me);
  end if;

  insert into player_zones (profile_id, label, lat, lng, public, updated_at)
  values (v_me, v_label, v_lat, v_lng, coalesce(p_public, false), now())
  on conflict (profile_id) do update
    set label = excluded.label, lat = excluded.lat, lng = excluded.lng, public = excluded.public, updated_at = now();
end $$;
revoke execute on function set_my_zone(text, double precision, double precision, boolean) from public, anon;
grant execute on function set_my_zone(text, double precision, double precision, boolean) to authenticated;

create or replace function clear_my_zone()
returns void language plpgsql security definer set search_path = public as $$
begin
  if me() is null then raise exception 'not_authenticated'; end if;
  delete from player_zones where profile_id = me();
end $$;
revoke execute on function clear_my_zone() from public, anon;
grant execute on function clear_my_zone() to authenticated;

-- =========================================================================================
-- 4) Ranking de la zona
--    Jugadores con cuenta que activaron "aparecer en el ranking" y están a p_km de MI zona guardada.
--    p_km: solo 5, 10, 25 o 50 (otro valor: error 'bad_radius'). p_limit: 1..500.
--    Si hay más jugadores que p_limit, se quedan primero los que tienen votos, después los de mejor promedio de atributos y por
--    último los más cercanos; el cliente ordena por OVR con el ovr() compartido.
--    distance_band: 2, 5, 10, 25 o 50 = "a menos de X km" (2 = menos de 2 km). Nunca km exactos ni coordenadas.
-- =========================================================================================
create or replace function zone_ranking(p_km int default 25, p_pos text default null, p_limit int default 200)
returns table (
  profile_id uuid, name text, photo_url text, pos text, fav_team text, shirt_number int,
  zone_label text, distance_band int,
  rit int, tir int, pas int, reg int, def int, fis int, n_votes int,
  matches_played int, goals int, assists int, mvps int, communities int
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_km int := coalesce(p_km, 25);
begin
  if v_km not in (5, 10, 25, 50) then raise exception 'bad_radius'; end if;
  return query
  with cand as (
    select p.id as pid, coalesce(nullif(trim(p.nickname), ''), p.name) as pname, p.photo_url as pphoto, p.pos as ppos, p.fav_team as pteam,
           p.shirt_number::int as pshirt, z.label as zlabel, d.km
    from player_zones z
    join profiles p on p.id = z.profile_id
    cross join (select mz.lat, mz.lng from player_zones mz where mz.profile_id = me()) c
    cross join lateral (
      -- haversine, radio medio de la Tierra 6371.0088 km (least(1, …) evita que un error de coma flotante rompa asin)
      select 2 * 6371.0088 * asin(least(1, sqrt(
        power(sin(radians(z.lat - c.lat) / 2), 2) + cos(radians(c.lat)) * cos(radians(z.lat)) * power(sin(radians(z.lng - c.lng) / 2), 2)
      ))) as km
    ) d
    where z.public and p.user_id is not null and p.onboarded
      and (p_pos is null or p.pos = p_pos)
      and d.km <= v_km
  ),
  votes as (
    select v.target_id, count(*)::int as n,
           round(avg(v.rit))::int as rit, round(avg(v.tir))::int as tir, round(avg(v.pas))::int as pas,
           round(avg(v.reg))::int as reg, round(avg(v.def))::int as def, round(avg(v.fis))::int as fis
    from stat_votes v where v.target_id in (select pid from cand) group by v.target_id
  ),
  scored as (
    -- sin votos ni autoevaluación no hay OVR que mostrar: esos quedan afuera ANTES del tope
    select c.pid, c.pname, c.pphoto, c.ppos, c.pteam, c.pshirt, c.zlabel, c.km,
           coalesce(vt.n, 0) as vn,
           coalesce(vt.rit, b.rit) as rit, coalesce(vt.tir, b.tir) as tir, coalesce(vt.pas, b.pas) as pas,
           coalesce(vt.reg, b.reg) as reg, coalesce(vt.def, b.def) as def, coalesce(vt.fis, b.fis) as fis
    from cand c
    left join votes vt on vt.target_id = c.pid
    left join base_stats b on b.profile_id = c.pid
    where vt.target_id is not null or b.profile_id is not null
  ),
  lim as (
    select s.*, (s.rit + s.tir + s.pas + s.reg + s.def + s.fis) / 6.0 as score
    from scored s
    order by (s.vn > 0) desc, (s.rit + s.tir + s.pas + s.reg + s.def + s.fis) desc, s.pid
    limit least(greatest(coalesce(p_limit, 200), 1), 500)
  ),
  played as (
    select s.profile_id as pid, count(*)::int as n
    from match_signups s join matches m on m.id = s.match_id
    where m.status = 'played' and s.status = 'in' and not s.absent and s.profile_id in (select pid from lim)
    group by s.profile_id
  ),
  ev as (
    select e.profile_id as pid, (count(*) filter (where e.kind = 'goal'))::int as goals, (count(*) filter (where e.kind = 'assist'))::int as assists
    from match_events e join matches m on m.id = e.match_id
    where m.status = 'played' and e.profile_id in (select pid from lim)
    group by e.profile_id
  ),
  mvp as (
    -- misma regla que community_mvps, sin separar por comunidad y solo en partidos donde alguno de estos jugadores recibió votos
    select x.target_id as pid, count(*)::int as n
    from (
      select t.match_id, t.target_id, rank() over (partition by t.match_id order by t.n desc) as r
      from (
        select mv.match_id, mv.target_id, count(*) as n
        from mvp_votes mv join matches m on m.id = mv.match_id
        where m.status = 'played'
          and mv.match_id in (select v2.match_id from mvp_votes v2 where v2.target_id in (select pid from lim))
        group by mv.match_id, mv.target_id
      ) t
    ) x
    where x.r = 1 and x.target_id in (select pid from lim)
    group by x.target_id
  ),
  comms as (
    select mb.profile_id as pid, count(*)::int as n from memberships mb where mb.profile_id in (select pid from lim) group by mb.profile_id
  )
  select l.pid, l.pname, l.pphoto, l.ppos, l.pteam, l.pshirt, l.zlabel,
         case when l.km < 2 then 2 when l.km <= 5 then 5 when l.km <= 10 then 10 when l.km <= 25 then 25 else 50 end,
         l.rit, l.tir, l.pas, l.reg, l.def, l.fis,
         l.vn,
         coalesce(pl.n, 0), coalesce(ev.goals, 0), coalesce(ev.assists, 0), coalesce(mv.n, 0), coalesce(cm.n, 0)
  from lim l
  left join played pl on pl.pid = l.pid
  left join ev on ev.pid = l.pid
  left join mvp mv on mv.pid = l.pid
  left join comms cm on cm.pid = l.pid
  order by (l.vn > 0) desc, l.score desc, l.pid;   -- sin desempatar por distancia: no revela quién está más cerca dentro de una banda
end $$;
revoke execute on function zone_ranking(int, text, int) from public, anon;
grant execute on function zone_ranking(int, text, int) to authenticated;

-- =========================================================================================
-- 5) approve_claim: la zona del que reclama pasa al perfil que queda
--    approve_claim suelta la cuenta del que reclama (update profiles set user_id = null ...) y después borra su perfil: el trigger
--    de arriba y el delete en cascada se llevarían su zona. Antes de soltarla se copia al perfil reclamado (si este ya tenía una, se
--    respeta la suya). Para no pisar lo que otros agreguen a esa función (Mati y Eduardo aplican SQL directo, y la migración de
--    complejos también la redefine), no se reescribe a mano: se toma la definición VIVA, se le agrega el bloque justo antes de
--    "update profiles set user_id = null where id = p_claimant;" y se vuelve a crear. Es idempotente (si ya menciona player_zones no
--    hace nada) y falla fuerte si no encuentra dónde agregarlo, sin tocar la función.
--    Si más adelante otra migración vuelve a crear approve_claim desde una versión vieja, correr de nuevo este bloque.
-- =========================================================================================
do $$
declare
  v_oid oid;
  v_def text;
  v_marker constant text := 'update profiles set user_id = null where id = p_claimant;';
  v_block constant text :=
    E'-- Zona (¿Dónde jugás?): pasa al perfil que queda, antes de soltar la cuenta (el trigger la borraría)\n'
    || E'  insert into player_zones (profile_id, label, lat, lng, public, updated_at)\n'
    || E'    select p_placeholder, label, lat, lng, public, now() from player_zones where profile_id = p_claimant\n'
    || E'    on conflict (profile_id) do nothing;\n\n  ';
begin
  select p.oid into v_oid from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'approve_claim'
    and pg_get_function_identity_arguments(p.oid) = 'p_placeholder uuid, p_claimant uuid';
  if v_oid is null then
    raise notice 'approve_claim no existe en esta base: nada que actualizar';
    return;
  end if;
  v_def := pg_get_functiondef(v_oid);
  if position('player_zones' in v_def) > 0 then
    raise notice 'approve_claim ya copia la zona';
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_marker, ''))) / length(v_marker) <> 1 then
    raise exception 'approve_claim: no encontre un unico "%" para copiar la zona; revisar la definicion viva', v_marker;
  end if;
  execute replace(v_def, v_marker, v_block || v_marker);
end $$;

notify pgrst, 'reload schema';
