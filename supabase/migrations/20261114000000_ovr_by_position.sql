-- OVR ponderado por posición. Idempotente; no borra datos.
--
-- Hasta ahora el OVR era el promedio simple de los seis atributos. Ahora cada atributo pesa según la posición del jugador
-- (la misma tabla que POS_WEIGHTS en src/shared/model.ts: si se cambia una, cambiar la otra):
--
--          RIT  TIR  PAS  REG  DEF  FIS  ARQ(🧤)
--    DEL    20   30   15   20    5   10    –
--    MED    15   15   30   20   10   10    –
--    DEF    15    5   15    5   35   25    –
--    ARQ     5    –   10    –   10   15   60      (sin 🧤 calificado: promedio simple de los seis, como antes)
--
-- Se calcula sobre los promedios YA redondeados de cada atributo (igual que el cliente, que recibe esos promedios), así el
-- número de la base y el de la app coinciden siempre.
--
-- 1) pos_ovr(): la fórmula.
-- 2) community_ranking.ovr: con pos_ovr y la posición del perfil.
-- 3) Historial de OVR: record_ovr usa pos_ovr; y si un jugador cambia de posición, se recalcula su punto de hoy.
-- 4) zone_ranking: el tope de filas ordena por pos_ovr (la zona no trae el 🧤: el arquero queda con el promedio simple).
-- 5) Punto de hoy del historial recalculado para todos. Los días anteriores quedan con la fórmula vieja (el historial
--    guarda solo el OVR, no los atributos): el gráfico muestra un salto el día del cambio.

-- ---------- 1) Fórmula ----------
create or replace function pos_ovr(p_pos text, p_rit int, p_tir int, p_pas int, p_reg int, p_def int, p_fis int, p_arq int default null)
returns int language sql immutable set search_path = public as $$
  select case
    when p_pos = 'DEL' then round((20 * p_rit + 30 * p_tir + 15 * p_pas + 20 * p_reg + 5 * p_def + 10 * p_fis) / 100.0)
    when p_pos = 'MED' then round((15 * p_rit + 15 * p_tir + 30 * p_pas + 20 * p_reg + 10 * p_def + 10 * p_fis) / 100.0)
    when p_pos = 'DEF' then round((15 * p_rit + 5 * p_tir + 15 * p_pas + 5 * p_reg + 35 * p_def + 25 * p_fis) / 100.0)
    when p_pos = 'ARQ' and p_arq is not null then round((5 * p_rit + 10 * p_pas + 10 * p_def + 15 * p_fis + 60 * p_arq) / 100.0)
    else round((p_rit + p_tir + p_pas + p_reg + p_def + p_fis) / 6.0)
  end::int
$$;
grant execute on function pos_ovr(text, int, int, int, int, int, int, int) to authenticated, service_role;
revoke execute on function pos_ovr(text, int, int, int, int, int, int, int) from public, anon;

-- ---------- 2) Ranking de la comunidad ----------
-- Mismas columnas y en el mismo orden (create or replace view no deja cambiarlas); solo cambia cómo sale `ovr`.
create or replace view community_ranking with (security_invoker = true) as
  select v.community_id, v.target_id as profile_id, count(*) as n_votes,
    round(avg(v.rit))::int rit, round(avg(v.tir))::int tir, round(avg(v.pas))::int pas,
    round(avg(v.reg))::int reg, round(avg(v.def))::int def, round(avg(v.fis))::int fis,
    pos_ovr(p.pos, round(avg(v.rit))::int, round(avg(v.tir))::int, round(avg(v.pas))::int,
            round(avg(v.reg))::int, round(avg(v.def))::int, round(avg(v.fis))::int, round(avg(v.arq))::int) ovr,
    round(avg(v.arq))::int arq, count(v.arq) as n_arq
  from stat_votes v join profiles p on p.id = v.target_id
  group by v.community_id, v.target_id, p.pos;

-- ---------- 3) Historial ----------
create or replace function record_ovr(p_community uuid, p_profile uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_n int; v_ovr int; v_day date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  select count(*),
         pos_ovr((select pos from profiles where id = p_profile),
                 round(avg(rit))::int, round(avg(tir))::int, round(avg(pas))::int,
                 round(avg(reg))::int, round(avg(def))::int, round(avg(fis))::int, round(avg(arq))::int)
    into v_n, v_ovr
    from stat_votes where community_id = p_community and target_id = p_profile;

  if v_n = 0 then
    delete from ovr_history where community_id = p_community and profile_id = p_profile and day = v_day;
  else
    -- el exists evita insertar contra una comunidad/perfil que se está borrando en cascada
    insert into ovr_history (community_id, profile_id, day, ovr, n_votes)
    select p_community, p_profile, v_day, v_ovr, v_n
    where exists (select 1 from communities where id = p_community)
      and exists (select 1 from profiles where id = p_profile)
    on conflict (community_id, profile_id, day) do update set ovr = excluded.ovr, n_votes = excluded.n_votes;
  end if;
end $$;
revoke execute on function record_ovr(uuid, uuid) from public, anon, authenticated;

-- Cambiar de posición cambia el OVR: se recalcula el punto de hoy en cada comunidad donde lo votaron.
create or replace function on_profile_pos_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if new.pos is distinct from old.pos then
    for r in select distinct community_id from stat_votes where target_id = new.id loop
      perform record_ovr(r.community_id, new.id);
    end loop;
  end if;
  return null;
end $$;
drop trigger if exists profiles_pos_ovr_history on profiles;
create trigger profiles_pos_ovr_history after update of pos on profiles
  for each row execute function on_profile_pos_change();
revoke execute on function on_profile_pos_change() from public, anon, authenticated;

-- ---------- 4) Ranking de la zona ----------
-- Igual que en 20261111900000_zone_ranking.sql; solo cambia el orden previo al tope (y el desempate final): pos_ovr en
-- vez del promedio simple.
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
    select s.*, pos_ovr(s.ppos, s.rit, s.tir, s.pas, s.reg, s.def, s.fis) as score
    from scored s
    order by (s.vn > 0) desc, pos_ovr(s.ppos, s.rit, s.tir, s.pas, s.reg, s.def, s.fis) desc, s.pid
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

-- ---------- 5) Punto de hoy del historial con la fórmula nueva ----------
insert into ovr_history (community_id, profile_id, day, ovr, n_votes)
select community_id, profile_id, (now() at time zone 'America/Argentina/Buenos_Aires')::date, ovr, n_votes
from community_ranking
on conflict (community_id, profile_id, day) do update set ovr = excluded.ovr, n_votes = excluded.n_votes;

notify pgrst, 'reload schema';
