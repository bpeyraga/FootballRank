-- Reservas: quién la canceló. El dueño y los encargados necesitan saber si la canceló quien la pidió o alguien del complejo
-- (hasta ahora la reserva quedaba "cancelled" sin más). Idempotente.
--
--   bookings.cancelled_by  perfil que canceló (null si se borró su cuenta o si es una cancelación anterior a esta migración).
--   bookings.cancel_role   'staff' si canceló el complejo (dueño o encargado, aunque también la haya pedido) o 'requester' si la
--                          canceló quien la pidió. Las cancelaciones anteriores quedan sin dato (no se adivina).
--
-- Funciones: se leyeron con pg_get_functiondef el 2026-11-14 y coinciden con 20261112000000_complexes_bookings.sql.
--   cancel_booking : mismas firma y chequeos; ahora guarda cancelled_by y cancel_role.
--   complex_agenda : devuelve además cancelled_by, cancelled_by_name, cancel_role y decided_at (para la agenda del dueño).
--   my_bookings    : devuelve además cancel_role (para decirle al jugador que la canceló el complejo).
--   approve_claim  : se le agrega una línea para que, al unirse una cuenta a un perfil, cancelled_by pase al perfil que queda
--                    (igual que requested_by); sin eso el FK lo dejaría en null.
-- complex_agenda y my_bookings cambian de columnas de salida: Postgres no lo permite con create or replace, así que se borran y se
-- vuelven a crear en la misma transacción (no se pierden datos: son funciones) con los mismos permisos (solo authenticated).
-- El trigger push_booking / push_on_booking() y la función push no se tocan.
-- bookings no tiene permisos por columna (authenticated tiene SELECT de toda la tabla, filtrado por la política bk_read), así que
-- las columnas nuevas se leen con los mismos permisos que las demás.

begin;

-- 1) Columnas
alter table bookings add column if not exists cancelled_by uuid references profiles(id) on delete set null;
alter table bookings add column if not exists cancel_role text;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.bookings'::regclass and conname = 'bookings_cancel_role_check') then
    alter table bookings add constraint bookings_cancel_role_check check (cancel_role is null or cancel_role in ('requester', 'staff'));
  end if;
end $$;
create index if not exists bookings_cancelled_by on bookings (cancelled_by) where cancelled_by is not null;

-- 2) Cancelar: igual que la versión viva (permisos, estados, "past" y motivo solo del complejo), más quién canceló.
create or replace function cancel_booking(p_booking uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare b bookings; v_staff boolean;
begin
  select * into b from bookings where id = p_booking for update;
  if b.id is null then raise exception 'forbidden'; end if;
  v_staff := is_complex_staff(b.complex_id);
  if not (v_staff or (b.requested_by = me() and b.kind = 'request' and b.starts_at > now())) then raise exception 'forbidden'; end if;
  if b.status not in ('pending', 'confirmed') then raise exception 'not_active'; end if;
  if b.ends_at <= now() then raise exception 'past'; end if;
  update bookings set status = 'cancelled', decided_at = now(),
    cancelled_by = me(),
    cancel_role = case when v_staff then 'staff' else 'requester' end,
    owner_note = case when v_staff and nullif(btrim(coalesce(p_reason, '')), '') is not null then btrim(p_reason) else owner_note end
    where id = p_booking;
end $$;
revoke execute on function cancel_booking(uuid, text) from public, anon;
grant execute on function cancel_booking(uuid, text) to authenticated;

-- 3) Agenda del dueño: las mismas columnas de siempre, y al final quién canceló y cuándo se decidió.
drop function if exists complex_agenda(uuid, timestamptz, timestamptz);
create function complex_agenda(p_complex uuid, p_from timestamptz, p_to timestamptz)
returns table (id uuid, field_id uuid, starts_at timestamptz, ends_at timestamptz, status text, kind text, note text, owner_note text, price numeric,
               requester_id uuid, requester_name text, requester_photo text, community_name text, created_at timestamptz,
               cancelled_by uuid, cancelled_by_name text, cancel_role text, decided_at timestamptz)
language sql stable security definer set search_path = public as $$
  select b.id, b.field_id, b.starts_at, b.ends_at, b.status, b.kind, b.note, b.owner_note, b.price,
         p.id, coalesce(nullif(btrim(p.nickname), ''), p.name), p.photo_url, c.name, b.created_at,
         b.cancelled_by, coalesce(nullif(btrim(cp.nickname), ''), cp.name), b.cancel_role, b.decided_at
  from bookings b
  left join profiles p on p.id = b.requested_by
  left join profiles cp on cp.id = b.cancelled_by
  left join communities c on c.id = b.community_id
  where b.complex_id = p_complex and is_complex_staff(p_complex)
    and b.starts_at < p_to and b.ends_at > p_from and p_to - p_from <= interval '62 days'
  order by b.starts_at, b.created_at
  limit 2000
$$;
revoke execute on function complex_agenda(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function complex_agenda(uuid, timestamptz, timestamptz) to authenticated;

-- 4) Mis reservas (jugador): las mismas columnas, y al final quién canceló (solo el rol, no el nombre).
drop function if exists my_bookings(timestamptz);
create function my_bookings(p_from timestamptz default now() - interval '1 day')
returns table (id uuid, complex_id uuid, complex_name text, field_id uuid, field_name text, starts_at timestamptz, ends_at timestamptz,
               status text, price numeric, community_id uuid, match_id uuid, mine boolean, note text, owner_note text,
               complex_address text, complex_phone text, complex_whatsapp text, cancel_role text)
language sql stable security definer set search_path = public as $$
  with mine as (
    select b.id, c.id as cid, c.name as cname, f.id as fid, f.name as fname, b.starts_at, b.ends_at, b.status, b.price, b.community_id,
           b.match_id, b.requested_by = me() as is_mine, b.note, b.owner_note, c.address, c.phone, c.whatsapp, b.cancel_role
    from bookings b join complexes c on c.id = b.complex_id join fields f on f.id = b.field_id
    where me() is not null and b.kind = 'request' and b.ends_at >= p_from
      and (b.requested_by = me() or (b.community_id is not null and is_member(b.community_id)))
  ),
  upcoming as (select * from mine where ends_at >= now() order by starts_at, id limit 100),
  past as (select * from mine where ends_at < now() order by starts_at desc, id limit 100)
  select x.id, x.cid, x.cname, x.fid, x.fname, x.starts_at, x.ends_at, x.status, x.price, x.community_id, x.match_id, x.is_mine,
         x.note, x.owner_note, x.address, x.phone, x.whatsapp, x.cancel_role
  from (select * from upcoming union all select * from past) x
  order by x.starts_at, x.id
$$;
revoke execute on function my_bookings(timestamptz) from public, anon;
grant execute on function my_bookings(timestamptz) to authenticated;

-- 5) approve_claim: cancelled_by pasa al perfil que queda (como requested_by). Igual que la migración de complejos: no se reescribe a
--    mano (Mati y Eduardo también la tocan), se toma la definición VIVA y se agrega una línea justo después de la que mueve
--    requested_by. Idempotente: si ya menciona cancelled_by no hace nada; si no encuentra esa línea (alguien la reescribió), avisa
--    y la deja como está (lo único que se pierde es el nombre de quien canceló: la pantalla muestra "quien la pidió").
do $$
declare
  v_oid oid;
  v_def text;
  v_marker constant text := 'update bookings set requested_by = p_placeholder where requested_by = p_claimant;';
begin
  select p.oid into v_oid from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'approve_claim'
    and pg_get_function_identity_arguments(p.oid) = 'p_placeholder uuid, p_claimant uuid';
  if v_oid is null then
    raise notice 'approve_claim no existe en esta base: nada que actualizar';
    return;
  end if;
  v_def := pg_get_functiondef(v_oid);
  if position('cancelled_by' in v_def) > 0 then
    raise notice 'approve_claim ya mueve cancelled_by';
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_marker, ''))) / length(v_marker) <> 1 then
    raise notice 'approve_claim: no encontre un unico "%"; se deja como esta (cancelled_by quedaria vacio al unir cuentas)', v_marker;
    return;
  end if;
  execute replace(v_def, v_marker, v_marker || E'\n  update bookings set cancelled_by = p_placeholder where cancelled_by = p_claimant;');
end $$;

commit;

notify pgrst, 'reload schema';
