-- Consola de errores del panel de la app: la app avisa cuando algo se rompe en el celular o la compu de alguien, y el equipo
-- lo ve agrupado en "Panel de la app" > Errores. Idempotente; solo crea objetos nuevos (no toca ninguna tabla ni función existente).
--   1) client_errors        un renglón por (error, persona) cada hora: si el mismo error se repite, sube `count` en vez de insertar
--   2) client_error_quota   contador por día y persona (y uno global) para el tope de abuso
--   3) log_client_error()   la llama la app (con o sin sesión): trunca todo, saca mails/tokens y respeta los topes
--   4) admin_errors(days)   solo equipo (is_app_admin, igual que admin_stats): errores agrupados por huella
--   5) purge_client_errors() + pg_cron: borra los registros de más de 30 días.
--      OJO: ese delete solo toca las dos tablas nuevas de este archivo (client_errors, client_error_quota), que arrancan vacías.
-- Qué se guarda: id de usuario (si tenía sesión) o el id anónimo del navegador (si ya lo tenía por las estadísticas), mensaje y pila
-- del error, ruta (#/...), versión de la app y navegador. Nada más: sin mail, sin nombre, sin tokens (se filtran).

begin;

-- ---------- 1) Errores ----------
create table if not exists client_errors (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),   -- primera vez de este renglón
  last_seen timestamptz not null default now(),    -- última vez que se repitió (dentro de la hora)
  user_id uuid null,
  vid text null,
  who text not null,                               -- user_id, o vid, o 'anon': quién cuenta como "persona afectada"
  fingerprint text not null,                       -- huella del error (la calcula la app: mensaje normalizado + archivo)
  message text not null,
  stack text null,
  source text null,                                -- archivo:línea de donde salió
  path text null,                                  -- ruta de la app (#/c/...), nunca el hash de login
  app_version text null,
  user_agent text null,
  count int not null default 1
);
create index if not exists client_errors_dedupe_idx on client_errors (fingerprint, who, last_seen desc);
create index if not exists client_errors_seen_idx on client_errors (last_seen desc);
alter table client_errors enable row level security; -- sin policies: nadie entra directo, solo las funciones security definer
revoke all on client_errors from public, anon, authenticated;

-- ---------- 2) Topes ----------
create table if not exists client_error_quota (
  day date not null,
  who text not null,       -- user_id, vid, 'anon' (todos los anónimos sin id) o '*' (global)
  n int not null default 0,
  primary key (day, who)
);
alter table client_error_quota enable row level security;
revoke all on client_error_quota from public, anon, authenticated;

-- ---------- 3) Registrar un error ----------
-- Limpia un texto: saca JWT, mails, parámetros de login de URLs y códigos de invitación, recorta espacios y lo corta a `n` caracteres ('' → null).
create or replace function client_error_clean(t text, n int) returns text
language sql immutable set search_path = public as $$
  select left(nullif(btrim(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(coalesce(t, ''), 'eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*', '[token]', 'g'),
          '([?&#](access_token|refresh_token|provider_token|provider_refresh_token|code|token|apikey|api_key|key|email)=)[^&\s)''"]+', '\1[x]', 'gi'),
        '(/join/)[A-Za-z0-9_-]+', '\1[x]', 'gi'),
      '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[email]', 'g')
  ), ''), n);
$$;
revoke execute on function client_error_clean(text, int) from public, anon, authenticated;

-- La llama la app, con o sin sesión. Topes: 50 por día por cuenta o navegador (200 para los anónimos sin id, que comparten), 2.000 por día
-- en total. Si el mismo error (misma huella) de la misma persona vuelve dentro de la hora, suma al contador en vez de insertar.
create or replace function log_client_error(
  p_message text, p_stack text default null, p_source text default null, p_path text default null,
  p_version text default null, p_fp text default null, p_vid text default null, p_ua text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_vid text := case when p_vid ~* '^[0-9a-f-]{36}$' then lower(p_vid) end;
  v_who text := coalesce(v_uid::text, v_vid, 'anon');
  v_day date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_msg text := client_error_clean(p_message, 500);
  v_stack text := client_error_clean(p_stack, 4000);
  v_src text := client_error_clean(p_source, 300);
  v_path text := client_error_clean(p_path, 80);
  v_ver text := client_error_clean(p_version, 40);
  v_fp text := case when p_fp ~ '^[0-9a-f]{8,32}$' then p_fp end;
  v_ua text;
  v_n int;
begin
  if v_msg is null then return; end if;
  v_fp := coalesce(v_fp, md5(left(v_msg, 200)));

  -- Navegador: el header del pedido (PostgREST) si está; si no, lo que mandó la app
  begin
    v_ua := nullif(current_setting('request.headers', true)::json ->> 'user-agent', '');
  exception when others then v_ua := null;
  end;
  v_ua := client_error_clean(coalesce(v_ua, p_ua), 200);

  -- Topes del día: primero el global y después el de la persona (así, con el global lleno, nadie puede seguir creando renglones de
  -- tope con ids inventados). `on conflict … where` no devuelve nada si ya llegó al tope; en ese caso se devuelve el lugar del global.
  insert into client_error_quota as q (day, who, n) values (v_day, '*', 1)
  on conflict (day, who) do update set n = q.n + 1 where q.n < 2000
  returning q.n into v_n;
  if v_n is null then return; end if;
  insert into client_error_quota as q (day, who, n) values (v_day, v_who, 1)
  on conflict (day, who) do update set n = q.n + 1 where q.n < case when v_who = 'anon' then 200 else 50 end
  returning q.n into v_n;
  if v_n is null then
    update client_error_quota set n = n - 1 where day = v_day and who = '*';
    return;
  end if;

  -- Mismo error de la misma persona en la última hora: se cuenta, no se repite
  update client_errors e set
    count = e.count + 1, last_seen = now(),
    path = coalesce(v_path, e.path), app_version = coalesce(v_ver, e.app_version), stack = coalesce(e.stack, v_stack)
  where e.id = (
    select x.id from client_errors x
    where x.fingerprint = v_fp and x.who = v_who and x.last_seen > now() - interval '1 hour'
    order by x.last_seen desc limit 1);
  if found then return; end if;

  insert into client_errors (user_id, vid, who, fingerprint, message, stack, source, path, app_version, user_agent)
  values (v_uid, v_vid, v_who, v_fp, v_msg, v_stack, v_src, v_path, v_ver, v_ua);
end $$;
revoke execute on function log_client_error(text, text, text, text, text, text, text, text) from public;
grant execute on function log_client_error(text, text, text, text, text, text, text, text) to anon, authenticated;

-- ---------- 4) Ver los errores (solo equipo) ----------
-- Agrupados por huella dentro de los últimos `p_days` días (1 a 30). Falla con 42501 si no sos del equipo, igual que admin_stats().
create or replace function admin_errors(p_days int default 7) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_days int := least(greatest(coalesce(p_days, 7), 1), 30);
  v_since timestamptz := now() - make_interval(days => v_days);
  v_out jsonb;
begin
  if not is_app_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  with r as (select * from client_errors where last_seen >= v_since),
  g as (
    select fingerprint, sum(count)::int as n, count(distinct who)::int as users, count(distinct user_id)::int as logged,
           min(created_at) as first_at, max(last_seen) as last_at
    from r group by fingerprint
  ),
  l as (
    select distinct on (fingerprint) fingerprint, message, stack, source, path, user_agent, app_version
    from r order by fingerprint, last_seen desc, id desc
  ),
  t as (
    select g.fingerprint, g.n, g.users, g.logged, g.first_at, g.last_at,
           l.message, l.stack, l.source, l.path, l.user_agent, l.app_version
    from g join l using (fingerprint) order by g.last_at desc limit 200
  )
  select jsonb_build_object(
    'generated_at', now(),
    'days', v_days,
    'events', (select coalesce(sum(n), 0)::int from g),
    'groups', (select count(*)::int from g),
    'people', (select count(distinct who)::int from r),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'fingerprint', t.fingerprint, 'message', t.message, 'count', t.n, 'users', t.users, 'logged', t.logged,
        'first_at', t.first_at, 'last_at', t.last_at, 'path', t.path, 'user_agent', t.user_agent, 'stack', t.stack,
        'source', t.source, 'app_version', t.app_version
      ) order by t.last_at desc) from t), '[]'::jsonb)
  ) into v_out;
  return v_out;
end $$;
revoke execute on function admin_errors(int) from public, anon;
grant execute on function admin_errors(int) to authenticated;

-- ---------- 5) Limpieza: 30 días ----------
-- Borra SOLO registros viejos de client_errors y client_error_quota (tablas creadas arriba, nacen vacías). No toca nada más.
create or replace function purge_client_errors() returns void
language sql security definer set search_path = public as $$
  delete from client_errors where last_seen < now() - interval '30 days';
  delete from client_error_quota where day < (now() at time zone 'America/Argentina/Buenos_Aires')::date - 3;
$$;
revoke all on function purge_client_errors() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if not exists (select 1 from cron.job where jobname = 'purge-client-errors') then
      perform cron.schedule('purge-client-errors', '17 6 * * *', 'select public.purge_client_errors()');
    end if;
  end if;
end $$;

commit;

notify pgrst, 'reload schema';
