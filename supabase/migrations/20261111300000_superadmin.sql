-- Panel de la app (superadmin): métricas globales solo para el equipo creador.
-- Idempotente y sin borrar datos: se puede pegar en el SQL editor y correr más de una vez.
--   1) app_admins     quiénes pueden ver el panel (sin acceso directo desde el cliente: solo RPCs)
--   2) is_app_admin() ¿el usuario actual es del equipo?
--   3) app_visits     un renglón por visitante (vid, guardado en el navegador) y día, con "latido" cada ~60 s
--   4) app_installs   instalaciones de la PWA (evento appinstalled)
--   5) track_visit / track_install   las llama cualquiera (también sin sesión, en la landing)
--   6) admin_stats()  un único jsonb con todo lo del panel; falla con 42501 si no sos del equipo
-- Los días se cuentan con fecha de Argentina (America/Argentina/Buenos_Aires).
-- Para sumar a alguien al equipo: insert into app_admins (user_id) values ('<auth.users.id>') on conflict do nothing;

-- ---------- 1) Equipo ----------
create table if not exists app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table app_admins enable row level security; -- sin policies: nadie entra directo, solo las funciones security definer
revoke all on app_admins from anon, authenticated;

-- Benja, Eduardo, Mati, Berna (solo si el usuario existe: nunca falla por la FK)
insert into app_admins (user_id)
select v.id
from (values
  ('3da053ed-4600-42c8-a046-5dd7c5a8aadd'::uuid),
  ('053fd36b-6a3c-4cdc-9065-b37b537bb684'::uuid),
  ('b1283082-0bdf-455e-b81d-09d65ea8d7c2'::uuid),
  ('c6943fbf-661f-499d-bd48-df7b436959e9'::uuid)
) as v(id)
where exists (select 1 from auth.users u where u.id = v.id)
on conflict do nothing;

-- ---------- 2) ¿Soy del equipo? ----------
create or replace function is_app_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from app_admins where user_id = auth.uid());
$$;
revoke execute on function is_app_admin() from public, anon;
grant execute on function is_app_admin() to authenticated;

-- ---------- 3) Visitas ----------
create table if not exists app_visits (
  vid uuid not null,
  day date not null,
  user_id uuid null,      -- con sesión en algún momento del día ("logueados hoy")
  cur_user uuid null,     -- quién tiene la sesión en el último latido (se pisa siempre: "en vivo" y "última vez")
  standalone boolean not null default false,
  platform text,
  path text,
  hits int not null default 1,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  primary key (vid, day)
);
create index if not exists app_visits_last_at_idx on app_visits (last_at);
create index if not exists app_visits_day_idx on app_visits (day);
create index if not exists app_visits_cur_user_idx on app_visits (cur_user) where cur_user is not null;
alter table app_visits enable row level security; -- sin policies
revoke all on app_visits from anon, authenticated;

create or replace function track_visit(p_vid uuid, p_standalone boolean, p_platform text, p_path text)
returns void language plpgsql security definer set search_path = public as $$
declare
  pf text := left(nullif(regexp_replace(lower(coalesce(p_platform, '')), '[^a-z]', '', 'g'), ''), 20);
  pa text := left(nullif(regexp_replace(lower(coalesce(p_path, '')), '[^a-z0-9-]', '', 'g'), ''), 30);
begin
  if p_vid is null then return; end if;
  insert into app_visits (vid, day, user_id, cur_user, standalone, platform, path)
  values (p_vid, (now() at time zone 'America/Argentina/Buenos_Aires')::date, auth.uid(), auth.uid(), coalesce(p_standalone, false), pf, pa)
  on conflict (vid, day) do update set
    hits = app_visits.hits + 1,
    last_at = now(),
    user_id = coalesce(auth.uid(), app_visits.user_id),
    cur_user = auth.uid(),
    standalone = app_visits.standalone or excluded.standalone,
    platform = coalesce(excluded.platform, app_visits.platform),
    path = coalesce(excluded.path, app_visits.path);
end $$;
revoke execute on function track_visit(uuid, boolean, text, text) from public;
grant execute on function track_visit(uuid, boolean, text, text) to anon, authenticated;

-- ---------- 4) Instalaciones ----------
create table if not exists app_installs (
  vid uuid primary key,
  user_id uuid,
  platform text,
  "at" timestamptz default now()
);
alter table app_installs enable row level security; -- sin policies
revoke all on app_installs from anon, authenticated;

create or replace function track_install(p_vid uuid, p_platform text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_vid is null then return; end if;
  insert into app_installs (vid, user_id, platform)
  values (p_vid, auth.uid(), left(nullif(regexp_replace(lower(coalesce(p_platform, '')), '[^a-z]', '', 'g'), ''), 20))
  on conflict do nothing;
end $$;
revoke execute on function track_install(uuid, text) from public;
grant execute on function track_install(uuid, text) to anon, authenticated;

-- ---------- 5) Métricas del panel ----------
create or replace function admin_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
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
      'goals', coalesce(s_gl.n, 0)
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
  ) s_gl on s_gl.d = g.d;

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
    'recent_users', j_recent
  );
end $$;
revoke execute on function admin_stats() from public, anon;
grant execute on function admin_stats() to authenticated;

notify pgrst, 'reload schema';
