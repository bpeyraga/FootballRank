-- Partidas de los juegos ("De potrero a leyenda") para el panel de la app, y logros/contadores en admin_stats.
-- La app avisa cuando empezás y cuando terminás una carrera, solo si aceptaste estadísticas en el aviso de cookies
-- (mismo id de visitas que track_visit). No guarda la carrera: juego, evento, temporadas, OVR final y dificultad.
-- admin_stats parte de la versión viva (pg_get_functiondef, 2026-11-12) y suma 'games' y la serie 'game_starts'.
-- Idempotente; no toca datos existentes.

begin;

create table if not exists game_plays (
  id bigint generated always as identity primary key,
  game text not null check (game in ('carrera')),
  kind text not null check (kind in ('start', 'finish')),
  vid uuid,
  user_id uuid,
  seasons smallint check (seasons between 0 and 60),
  ovr smallint check (ovr between 0 and 99),
  difficulty text check (difficulty ~ '^[a-z]{1,16}$'),
  created_at timestamptz not null default now(),
  check (vid is not null or user_id is not null)
);
create index if not exists game_plays_created_idx on game_plays (created_at desc);
create index if not exists game_plays_who_idx on game_plays (coalesce(user_id::text, vid::text), created_at desc);
alter table game_plays enable row level security;
revoke all on game_plays from public, anon, authenticated;

-- La llama la app (con o sin sesión). Tope suave contra abuso: 150 eventos por día por cuenta o navegador.
create or replace function track_game(p_vid uuid, p_game text, p_kind text, p_seasons int default null, p_ovr int default null, p_difficulty text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_who text := coalesce(auth.uid()::text, p_vid::text);
begin
  if v_who is null or p_game is distinct from 'carrera' or coalesce(p_kind, '') not in ('start', 'finish') then return; end if;
  if (select count(*) from game_plays
      where coalesce(user_id::text, vid::text) = v_who and created_at > now() - interval '1 day') >= 150 then
    return;
  end if;
  insert into game_plays (game, kind, vid, user_id, seasons, ovr, difficulty)
  values (
    p_game, p_kind, p_vid, v_uid,
    case when p_seasons between 0 and 60 then p_seasons end,
    case when p_ovr between 0 and 99 then p_ovr end,
    case when p_difficulty ~ '^[a-z]{1,16}$' then p_difficulty end
  );
end $$;
revoke execute on function track_game(uuid, text, text, int, int, text) from public;
grant execute on function track_game(uuid, text, text, int, int, text) to anon, authenticated, service_role;

create or replace function public.admin_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tz constant text := 'America/Argentina/Buenos_Aires';
  v_today date := (now() at time zone v_tz)::date;
  v_d7 date := v_today - 6;
  v_d30 date := v_today - 29;
  v_since30 timestamptz := (v_d30::timestamp at time zone v_tz);
  j_online jsonb;
  j_users jsonb;
  j_comm jsonb;
  j_matches jsonb;
  j_events jsonb;
  j_visits jsonb;
  j_platforms jsonb;
  j_series jsonb;
  j_top jsonb;
  j_recent jsonb;
  j_games jsonb;
  j_diff jsonb;
begin
  if not is_app_admin() then raise exception 'forbidden' using errcode = '42501'; end if;

  -- En vivo: visitantes con latido en los últimos 2 minutos; la lista es de usuarios con sesión (uno por usuario)
  select jsonb_build_object(
    'total', count(distinct v.vid),
    'logged', count(distinct v.vid) filter (where v.cur_user is not null),
    'users', coalesce((
      select jsonb_agg(jsonb_build_object('name', o.name, 'platform', o.platform, 'path', o.path, 'standalone', o.standalone) order by o.last_at desc)
      from (
        select d.* from (
          select distinct on (v2.cur_user)
            coalesce(nullif(btrim(p.nickname), ''), nullif(btrim(p.name), ''), 'Jugador') as name,
            v2.platform, v2.path, v2.standalone, v2.last_at
          from app_visits v2
          left join profiles p on p.user_id = v2.cur_user
          where v2.cur_user is not null and v2.last_at > now() - interval '2 minutes'
          order by v2.cur_user, v2.last_at desc
        ) d
        order by d.last_at desc
        limit 50
      ) o
    ), '[]'::jsonb)
  ) into j_online
  from app_visits v
  where v.last_at > now() - interval '2 minutes';

  -- Cuentas (auth.users) y jugadores (profiles). "Activo" = entró (login) o abrió la app con esa cuenta en el período.
  select jsonb_build_object(
    'total', count(*),
    'active_24h', count(*) filter (where s.seen > now() - interval '24 hours'),
    'active_7d', count(*) filter (where s.seen > now() - interval '7 days'),
    'active_30d', count(*) filter (where s.seen > now() - interval '30 days'),
    'new_7d', count(*) filter (where s.created_at > now() - interval '7 days'),
    'new_30d', count(*) filter (where s.created_at > now() - interval '30 days')
  ) || jsonb_build_object(
    'players_total', (select count(*) from profiles),
    'players_no_account', (select count(*) from profiles where user_id is null),
    'onboarded', (select count(*) from profiles where onboarded is true)
  ) into j_users
  from (
    select u.created_at,
      greatest(u.last_sign_in_at, (select max(v.last_at) from app_visits v where v.cur_user = u.id)) as seen
    from auth.users u
  ) s;

  select jsonb_build_object(
    'total', count(*),
    'new_7d', count(*) filter (where created_at > now() - interval '7 days'),
    'new_30d', count(*) filter (where created_at > now() - interval '30 days'),
    'memberships', (select count(*) from memberships)
  ) into j_comm
  from communities;

  select jsonb_build_object(
    'total', count(*),
    'played', count(*) filter (where status = 'played'),
    'open', count(*) filter (where status in ('open', 'closed') and starts_at >= now()),
    'cancelled', count(*) filter (where status = 'cancelled'),
    'new_7d', count(*) filter (where created_at > now() - interval '7 days')
  ) into j_matches
  from matches;

  select jsonb_build_object(
    'goals', count(*) filter (where kind = 'goal'),
    'assists', count(*) filter (where kind = 'assist'),
    'yellow', count(*) filter (where kind = 'yellow'),
    'red', count(*) filter (where kind = 'red')
  ) into j_events
  from match_events;

  -- Visitas e instalaciones (visitante = vid; hoy / 7 días / 30 días con fecha de Argentina)
  select jsonb_build_object(
    'unique_today', count(distinct vid) filter (where day = v_today),
    'unique_7d', count(distinct vid) filter (where day >= v_d7),
    'unique_30d', count(distinct vid),
    'logged_today', count(distinct user_id) filter (where day = v_today),
    'hits_today', coalesce(sum(hits) filter (where day = v_today), 0),
    'standalone_30d', count(distinct vid) filter (where standalone)
  ) || jsonb_build_object(
    'installs_total', (select count(*) from app_installs),
    'installs_30d', (select count(*) from app_installs where "at" >= now() - interval '30 days')
  ) into j_visits
  from app_visits
  where day >= v_d30;

  select coalesce(jsonb_agg(jsonb_build_object('platform', q.platform, 'n', q.n) order by q.n desc, q.platform), '[]'::jsonb)
  into j_platforms
  from (
    select coalesce(platform, 'otro') as platform, count(distinct vid) as n
    from app_visits
    where day >= v_d30
    group by 1
  ) q;

  -- Serie diaria de los últimos 30 días (todos los días presentes, aunque estén en cero)
  select coalesce(jsonb_agg(jsonb_build_object(
      'd', to_char(g.d, 'YYYY-MM-DD'),
      'visitors', coalesce(s_vi.n, 0),
      'users_new', coalesce(s_us.n, 0),
      'communities_new', coalesce(s_co.n, 0),
      'matches_played', coalesce(s_mp.n, 0),
      'goals', coalesce(s_gl.n, 0),
      'game_starts', coalesce(s_gs.n, 0)
    ) order by g.d), '[]'::jsonb)
  into j_series
  from (select (v_d30 + i) as d from generate_series(0, 29) as i) g
  left join (
    select day as d, count(distinct vid) as n from app_visits where day >= v_d30 group by day
  ) s_vi on s_vi.d = g.d
  left join (
    select (created_at at time zone v_tz)::date as d, count(*) as n from auth.users where created_at >= v_since30 group by 1
  ) s_us on s_us.d = g.d
  left join (
    select (created_at at time zone v_tz)::date as d, count(*) as n from communities where created_at >= v_since30 group by 1
  ) s_co on s_co.d = g.d
  left join (
    select (starts_at at time zone v_tz)::date as d, count(*) as n from matches where status = 'played' and starts_at >= v_since30 group by 1
  ) s_mp on s_mp.d = g.d
  left join (
    select (m.starts_at at time zone v_tz)::date as d, count(*) as n
    from match_events e join matches m on m.id = e.match_id
    where e.kind = 'goal' and m.starts_at >= v_since30
    group by 1
  ) s_gl on s_gl.d = g.d
  left join (
    select (created_at at time zone v_tz)::date as d, count(*) as n from game_plays where kind = 'start' and created_at >= v_since30 group by 1
  ) s_gs on s_gs.d = g.d;

  -- Comunidades más activas (por última actividad: partido, mensaje, gol o alta de miembro)
  select coalesce(jsonb_agg(to_jsonb(t) order by t.last_activity desc), '[]'::jsonb)
  into j_top
  from (
    select c.name, c.slug, c.created_at,
      (select count(*) from memberships m where m.community_id = c.id) as members,
      (select count(*) from memberships m join profiles p on p.id = m.profile_id where m.community_id = c.id and p.user_id is null) as players_no_account,
      (select count(*) from matches m where m.community_id = c.id and m.status = 'played') as matches_played,
      (select count(*) from match_events e where e.community_id = c.id and e.kind = 'goal') as goals,
      (select count(*) from messages x where x.community_id = c.id) as messages,
      l.la as last_activity
    from communities c
    cross join lateral (
      select greatest(
        c.created_at,
        (select max(m.created_at) from matches m where m.community_id = c.id),
        (select max(x.created_at) from messages x where x.community_id = c.id),
        (select max(e.created_at) from match_events e where e.community_id = c.id),
        (select max(ms.joined_at) from memberships ms where ms.community_id = c.id)
      ) as la
    ) l
    order by l.la desc
    limit 20
  ) t;

  -- Últimos registros: sin mails
  select coalesce(jsonb_agg(jsonb_build_object(
      'name', r.name,
      'created_at', r.created_at,
      'last_sign_in_at', r.last_sign_in_at,
      'last_seen', r.last_seen,
      'communities', r.communities
    ) order by r.created_at desc), '[]'::jsonb)
  into j_recent
  from (
    select coalesce(nullif(btrim(p.nickname), ''), nullif(btrim(p.name), ''), 'Sin perfil') as name,
      u.created_at, u.last_sign_in_at,
      greatest(u.last_sign_in_at, (select max(v.last_at) from app_visits v where v.cur_user = u.id)) as last_seen,
      (select count(*) from memberships m where m.profile_id = p.id) as communities
    from auth.users u
    left join profiles p on p.user_id = u.id
    order by u.created_at desc
    limit 10
  ) r;

  -- Juegos: partidas de "De potrero a leyenda" (solo de quienes aceptaron estadísticas). Jugador = cuenta o, sin sesión, navegador.
  select jsonb_build_object(
    'starts_total', count(*) filter (where kind = 'start'),
    'finishes_total', count(*) filter (where kind = 'finish'),
    'starts_today', count(*) filter (where kind = 'start' and (created_at at time zone v_tz)::date = v_today),
    'starts_7d', count(*) filter (where kind = 'start' and (created_at at time zone v_tz)::date >= v_d7),
    'starts_30d', count(*) filter (where kind = 'start' and created_at >= v_since30),
    'players_total', count(distinct coalesce(user_id::text, vid::text)),
    'players_7d', count(distinct coalesce(user_id::text, vid::text)) filter (where (created_at at time zone v_tz)::date >= v_d7),
    'avg_seasons', coalesce(round(avg(seasons) filter (where kind = 'finish'), 1), 0),
    'best_ovr', coalesce(max(ovr) filter (where kind = 'finish'), 0)
  ) into j_games
  from game_plays;

  select coalesce(jsonb_agg(jsonb_build_object('difficulty', q.difficulty, 'n', q.n) order by q.n desc, q.difficulty), '[]'::jsonb)
  into j_diff
  from (
    select coalesce(difficulty, 'otra') as difficulty, count(*) as n from game_plays where kind = 'start' group by 1
  ) q;

  return jsonb_build_object(
    'generated_at', now(),
    'online', j_online,
    'users', j_users,
    'communities', j_comm,
    'matches', j_matches,
    'events', j_events,
    'mvp_votes', (select count(*) from mvp_votes),
    'stat_votes', (select count(*) from stat_votes),
    'messages', (select count(*) from messages),
    'polls', (select count(*) from polls),
    'push_devices', (select count(*) from push_subscriptions),
    'visits', j_visits || jsonb_build_object('platforms', j_platforms),
    'series', j_series,
    'top_communities', j_top,
    'recent_users', j_recent,
    'games', j_games || jsonb_build_object('difficulty', j_diff)
  );
end $function$;

commit;

notify pgrst, 'reload schema';
