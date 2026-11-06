-- Avisos en el celular (Web Push). Idempotente; solo agrega tablas/columnas/funciones, no borra datos.
-- Envía la Edge Function `push` (supabase/functions/push). La URL y el secreto compartido están en Vault
-- ('push_url', 'push_secret'); si no están cargados, los avisos simplemente no salen (no rompe nada).

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- A qué celulares mandarle a cada uno, y qué avisos quiere.
create table if not exists push_subscriptions (
  endpoint text primary key,
  profile_id uuid not null references profiles(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  kinds text[] not null default '{match,reminder,teams,chat}',
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_profile on push_subscriptions (profile_id);
alter table push_subscriptions enable row level security;
drop policy if exists ps_sel on push_subscriptions;
create policy ps_sel on push_subscriptions for select using (profile_id = me());
drop policy if exists ps_del on push_subscriptions;
create policy ps_del on push_subscriptions for delete using (profile_id = me());

-- Guarda (o reasigna, si el celular lo usaba otra cuenta) la suscripción de este navegador.
create or replace function save_push(p_endpoint text, p_p256dh text, p_auth text, p_kinds text[] default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if me() is null then raise exception 'forbidden'; end if;
  if p_endpoint !~ '^https://' or length(p_endpoint) > 1000 then raise exception 'bad_endpoint'; end if;
  insert into push_subscriptions (endpoint, profile_id, p256dh, auth, kinds)
    values (p_endpoint, me(), p_p256dh, p_auth, coalesce(p_kinds, '{match,reminder,teams,chat}'))
    on conflict (endpoint) do update set profile_id = me(), p256dh = excluded.p256dh, auth = excluded.auth,
      kinds = coalesce(p_kinds, case when push_subscriptions.profile_id = me() then push_subscriptions.kinds
                                     else excluded.kinds end);
end $$;
grant execute on function save_push(text, text, text, text[]) to authenticated;

-- Marcas para no repetir avisos.
alter table matches add column if not exists reminded_at timestamptz;
alter table matches add column if not exists teams_at timestamptz;
alter table matches add column if not exists teams_notified_at timestamptz;

-- Llama a la Edge Function sin bloquear (pg_net es asíncrono). Nunca hace fallar la operación que la disparó.
create or replace function push_call(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare u text; s text;
begin
  select decrypted_secret into u from vault.decrypted_secrets where name = 'push_url';
  select decrypted_secret into s from vault.decrypted_secrets where name = 'push_secret';
  if u is null or s is null then return; end if;
  perform net.http_post(url := u, body := p,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', s));
exception when others then
  raise warning 'push_call: %', sqlerrm;
end $$;
revoke all on function push_call(jsonb) from public, anon, authenticated;

-- Partido nuevo (solo si es a futuro: cargar uno ya jugado no avisa).
create or replace function push_on_match() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.starts_at > now() then
    perform push_call(jsonb_build_object('type', 'match', 'match_id', new.id));
  end if;
  return null;
end $$;
drop trigger if exists push_new_match on matches;
create trigger push_new_match after insert on matches for each row execute function push_on_match();

-- Equipos: los equipos se guardan jugador por jugador, así que solo se marca la hora;
-- el reloj avisa un minuto después del último cambio (un solo aviso por armado).
create or replace function push_on_team() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.team is distinct from old.team and new.team is not null then
    update matches set teams_at = now() where id = new.match_id;
  end if;
  return null;
end $$;
drop trigger if exists push_team_change on match_signups;
create trigger push_team_change after update of team on match_signups for each row execute function push_on_team();

-- Chat
create or replace function push_on_message() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform push_call(jsonb_build_object('type', 'chat', 'message_id', new.id));
  return null;
end $$;
drop trigger if exists push_new_message on messages;
create trigger push_new_message after insert on messages for each row execute function push_on_message();

-- Reloj (cada minuto): "falta 1 hora" y "equipos armados". Solo llama a la función si hay algo para avisar.
create or replace function push_tick() returns void
language plpgsql security definer set search_path = public as $$
declare r record;
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
end $$;
revoke all on function push_tick() from public, anon, authenticated;

select cron.schedule('push-tick', '* * * * *', 'select public.push_tick()');
