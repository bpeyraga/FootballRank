-- Resumen semanal por push. Idempotente: se puede correr más de una vez. No borra datos.
-- Cada lunes a las 09:00 (hora argentina) la base le avisa a la Edge Function `push` (type 'weekly') de cada comunidad
-- que jugó al menos un partido en los últimos 7 días; la función arma el texto (partidos, goleador, asistidor, figura)
-- y se lo manda a los miembros que tengan el aviso 'weekly' activado (push_subscriptions.kinds).
-- Desplegar la función `push` con el type 'weekly' ANTES de que llegue el primer lunes (si no, responde bad_type y no sale nada).

-- 1) El aviso nuevo ('weekly') viene prendido para las suscripciones nuevas.
alter table push_subscriptions alter column kinds set default '{match,reminder,teams,chat,weekly}';

-- 2) Las suscripciones que ya existen lo reciben también (se puede apagar desde "Avisos en este celular").
--    Solo la primera vez que se aplica: si la migración se vuelve a correr, no pisa a quien ya lo apagó.
do $$ begin
  if to_regclass('public.push_weekly_log') is null then
    update push_subscriptions set kinds = array_append(kinds, 'weekly') where not ('weekly' = any(kinds));
  end if;
end $$;

-- 3) save_push: igual que la versión viva (20261110000000_push.sql); solo cambia el valor por defecto de `kinds`.
create or replace function save_push(p_endpoint text, p_p256dh text, p_auth text, p_kinds text[] default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if me() is null then raise exception 'forbidden'; end if;
  if p_endpoint !~ '^https://' or length(p_endpoint) > 1000 then raise exception 'bad_endpoint'; end if;
  insert into push_subscriptions (endpoint, profile_id, p256dh, auth, kinds)
    values (p_endpoint, me(), p_p256dh, p_auth, coalesce(p_kinds, '{match,reminder,teams,chat,weekly}'))
    on conflict (endpoint) do update set profile_id = me(), p256dh = excluded.p256dh, auth = excluded.auth,
      kinds = coalesce(p_kinds, case when push_subscriptions.profile_id = me() then push_subscriptions.kinds
                                     else excluded.kinds end);
end $$;
grant execute on function save_push(text, text, text, text[]) to authenticated;

-- 4) Registro de semanas ya avisadas: una fila por comunidad y lunes (hora argentina). Evita mandar dos veces.
create table if not exists push_weekly_log (
  community_id uuid not null references communities(id) on delete cascade,
  week date not null,
  sent_at timestamptz not null default now(),
  primary key (community_id, week)
);
alter table push_weekly_log enable row level security; -- sin políticas: solo lo toca push_weekly() (security definer)
revoke all on push_weekly_log from anon, authenticated;

-- 5) La función del lunes: una llamada a push_call por comunidad con partidos jugados en los últimos 7 días.
create or replace function push_weekly() returns void
language plpgsql security definer set search_path = public as $$
declare r record;
  wk date := date_trunc('week', now() at time zone 'America/Argentina/Buenos_Aires')::date; -- el lunes de esta semana, hora argentina
begin
  for r in
    insert into push_weekly_log (community_id, week)
      select c.id, wk from communities c
      where exists (select 1 from matches m where m.community_id = c.id and m.status = 'played'
                      and m.starts_at > now() - interval '7 days' and m.starts_at <= now())
      on conflict (community_id, week) do nothing
      returning community_id
  loop
    perform push_call(jsonb_build_object('type', 'weekly', 'community_id', r.community_id));
  end loop;
end $$;
revoke all on function push_weekly() from public, anon, authenticated;

-- 6) Lunes 12:00 UTC = 09:00 en Argentina (pg_cron corre en UTC).
select cron.unschedule(jobid) from cron.job where jobname = 'push-weekly';
select cron.schedule('push-weekly', '0 12 * * 1', 'select public.push_weekly()');

notify pgrst, 'reload schema';
