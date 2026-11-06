-- Más avisos al celular. Idempotente. Usa la infraestructura de 20261110000000_push.sql (push_call + Edge Function `push`).
--   today      10:00 (hora AR) del día del partido: "Hoy jugás" a los anotados y "faltan N" a los no anotados.
--   promoted   al pasar de lista de espera a anotado (cualquier camino: alguien se baja, suben cupos, admin).
--   cancelled  partido cancelado → anotados y lista de espera.
--   changed    cambió fecha/hora o lugar de un partido próximo → anotados y lista de espera.
--   suspended  te suspendieron para un partido.

alter table matches add column if not exists today_notified_at timestamptz;

-- ---------- Reloj: lo de antes + "hoy jugás" ----------
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
end $$;
revoke all on function push_tick() from public, anon, authenticated;

-- ---------- Pasaste de la lista de espera ----------
create or replace function push_on_promoted() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'waitlist' and new.status = 'in'
     and exists (select 1 from matches where id = new.match_id and status in ('open', 'closed') and starts_at > now()) then
    perform push_call(jsonb_build_object('type', 'promoted', 'match_id', new.match_id, 'profile_id', new.profile_id));
  end if;
  return null;
end $$;
drop trigger if exists push_signup_promoted on match_signups;
create trigger push_signup_promoted after update of status on match_signups
  for each row execute function push_on_promoted();

-- ---------- Cancelado / cambio de horario o lugar ----------
create or replace function push_on_match_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'cancelled' and old.status in ('open', 'closed') and old.starts_at > now() - interval '3 hours' then
    perform push_call(jsonb_build_object('type', 'cancelled', 'match_id', new.id));
  elsif new.status in ('open', 'closed') and new.starts_at > now()
        and (new.starts_at is distinct from old.starts_at or new.location is distinct from old.location
             or new.venue_id is distinct from old.venue_id) then
    perform push_call(jsonb_build_object('type', 'changed', 'match_id', new.id,
      'time_changed', new.starts_at is distinct from old.starts_at,
      'place_changed', new.location is distinct from old.location or new.venue_id is distinct from old.venue_id));
    -- Si cambió la hora, que "falta 1 hora" vuelva a salir; si cambió el día, también "hoy jugás".
    -- (Este update no toca columnas del trigger, así que no se vuelve a disparar.)
    if new.starts_at is distinct from old.starts_at then
      update matches set reminded_at = null,
        today_notified_at = case
          when (new.starts_at at time zone 'America/Argentina/Buenos_Aires')::date
               <> (old.starts_at at time zone 'America/Argentina/Buenos_Aires')::date then null
          else today_notified_at end
        where id = new.id;
    end if;
  end if;
  return null;
end $$;
drop trigger if exists push_match_change on matches;
create trigger push_match_change after update of status, starts_at, location, venue_id on matches
  for each row execute function push_on_match_change();

-- ---------- Suspensión ----------
create or replace function push_on_suspension() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform push_call(jsonb_build_object('type', 'suspended', 'suspension_id', new.id));
  return null;
end $$;
drop trigger if exists push_new_suspension on suspensions;
create trigger push_new_suspension after insert on suspensions
  for each row execute function push_on_suspension();
