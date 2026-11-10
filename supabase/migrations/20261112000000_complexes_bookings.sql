-- Dueños de cancha: complejos, canchas, horarios, turnos y reservas. Catálogo con búsqueda por radio.
-- Une cancha con jugador: un jugador (o su grupo) pide un turno, el dueño lo confirma o rechaza, y después el jugador
-- puede vincular el turno confirmado a un partido de su grupo (la cancha del partido pasa a ser la del complejo).
-- Idempotente (se puede correr más de una vez); solo agrega cosas. Única escritura sobre datos existentes: al crear la
-- columna role_chosen se marca true a los perfiles que ya completaron su ficha (para no preguntarles el rol).
-- Reescrita el 2026-11-12 sobre el esquema VIVO (temporadas, zona, push 'weekly', venues.matches.venue_id, etc.).
--
-- ---- Diseño ----
--  * Roles: profiles.is_player / is_owner / role_chosen. Son solo preferencias de interfaz (qué ve la persona): los
--    permisos salen de complex_staff, no de esas columnas. Una persona puede ser jugador, dueño o las dos cosas, y
--    puede tener varios complejos (complex_staff). set_my_roles las cambia; "dueño sin ficha de jugador" queda onboarded.
--  * Todo el que escribe lo hace por RPC (security definer): complejos, horarios, reservas. Las únicas tablas con escritura
--    directa son las canchas (fields), acotadas por RLS a los encargados del complejo. Nada se borra por la API: un complejo
--    se pausa (active = false) y una cancha con reservas se desactiva; el historial de turnos no se pierde.
--  * Dos turnos CONFIRMADOS nunca se pisan en la misma cancha (exclusión btree_gist). Los pedidos (pending) sí pueden
--    superponerse entre sí: el dueño elige cuál confirmar; confirmar uno que se pisa con uno confirmado da 'slot_taken'.
--  * Catálogo: lo leen los usuarios con sesión. A propósito NO hay acceso anónimo (el catálogo trae teléfonos/WhatsApp y una
--    búsqueda anónima permitiría barrerlos). Si algún día la landing muestra canchas, se agrega un grant explícito a anon
--    sobre una RPC de lectura que no devuelva contactos.
--  * Avisos: el trigger push_on_booking llama a push_call con { type: 'booking_request' | 'booking_status', booking_id, ... }.
--    La edge function `push` decide a quién le llega (ver comentario del trigger).
--
-- ---- Contrato de RPCs (todas: authenticated; errores = excepciones con ese texto) ----
--  Jugador:  search_complexes(p_lat,p_lng,p_km default 10,p_size default null,p_limit default 50,p_offset default 0)
--            complex_busy(p_complex,p_from,p_to)  request_booking(p_field,p_starts,p_minutes,p_community,p_match,p_note)
--            cancel_booking(p_booking,p_reason)  my_bookings(p_from)  link_booking_match(p_booking,p_match)
--            unlink_booking_match(p_booking)  ensure_complex_venue(p_booking,p_community) -> (venue_id, location)
--  Dueño:    create_complex  update_complex  set_complex_active  set_complex_slot  set_complex_photo  set_complex_hours  block_slot
--            decide_booking  complex_agenda  owner_overview
--  Cuenta:   set_my_roles(p_player,p_owner)

create extension if not exists btree_gist with schema extensions;

-- =========================================================================================
-- 1) Roles de la persona: jugador, dueño de cancha o ambos
-- =========================================================================================
alter table profiles add column if not exists is_player boolean not null default true;
alter table profiles add column if not exists is_owner boolean not null default false;
do $$ begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'profiles' and column_name = 'role_chosen') then
    alter table profiles add column role_chosen boolean not null default false;
    -- los que ya completaron su ficha usan la app como jugadores: no se les vuelve a preguntar
    update profiles set role_chosen = true, is_player = true where onboarded;
  end if;
end $$;

-- Elegir rol (primer ingreso o desde el perfil). Al menos uno. Un dueño que no juega no tiene ficha que completar:
-- queda onboarded para que la app lo deje pasar. (Si más tarde se suma como jugador, completa la ficha desde su perfil.)
create or replace function set_my_roles(p_player boolean, p_owner boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if me() is null then raise exception 'forbidden'; end if;
  if not coalesce(p_player, false) and not coalesce(p_owner, false) then raise exception 'no_role'; end if;
  update profiles set is_player = coalesce(p_player, false), is_owner = coalesce(p_owner, false), role_chosen = true,
    onboarded = onboarded or not coalesce(p_player, false)
    where id = me();
end $$;
revoke execute on function set_my_roles(boolean, boolean) from public, anon;
grant execute on function set_my_roles(boolean, boolean) to authenticated;

-- =========================================================================================
-- 2) Tablas
-- =========================================================================================
create table if not exists complexes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 80),
  description text check (description is null or length(description) <= 600),
  address text check (address is null or length(address) <= 160),
  city text check (city is null or length(city) <= 80),
  lat double precision check (lat is null or lat between -90 and 90),
  lng double precision check (lng is null or lng between -180 and 180),
  maps_url text check (maps_url is null or (maps_url ~ '^https://' and length(maps_url) <= 1000)),
  phone text check (phone is null or phone ~ '^[0-9+ ()-]{6,25}$'),
  whatsapp text check (whatsapp is null or whatsapp ~ '^[0-9]{8,15}$'),        -- solo dígitos, con código de país (5491155551234)
  photo_url text check (photo_url is null or photo_url ~ '^https://'),
  amenities text[] not null default '{}' check (coalesce(array_length(amenities, 1), 0) <= 12),
  slot_minutes smallint not null default 60 check (slot_minutes in (30, 60, 90, 120)),
  tz text not null default 'America/Argentina/Buenos_Aires',
  active boolean not null default true,
  created_by uuid references profiles on delete set null,
  created_at timestamptz not null default now(),
  check ((lat is null) = (lng is null))
);
create index if not exists complexes_geo on complexes (lat, lng) where active;

-- Quién maneja cada complejo (un dueño puede tener varios complejos; un complejo, varios dueños o encargados).
-- La app solo usa 'owner' por ahora; 'staff' queda previsto para encargados.
create table if not exists complex_staff (
  complex_id uuid not null references complexes on delete cascade,
  profile_id uuid not null references profiles on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'staff')),
  created_at timestamptz not null default now(),
  primary key (complex_id, profile_id)
);
create index if not exists complex_staff_profile on complex_staff (profile_id);

create or replace function is_complex_staff(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from complex_staff where complex_id = c and profile_id = me())
$$;
create or replace function is_complex_owner(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from complex_staff where complex_id = c and profile_id = me() and role = 'owner')
$$;
revoke execute on function is_complex_staff(uuid), is_complex_owner(uuid) from public, anon;
grant execute on function is_complex_staff(uuid), is_complex_owner(uuid) to authenticated;

-- Canchas del complejo
create table if not exists fields (
  id uuid primary key default gen_random_uuid(),
  complex_id uuid not null references complexes on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 40),
  size smallint not null default 5 check (size in (5, 6, 7, 8, 9, 11)),
  surface text not null default 'sintetico' check (surface in ('sintetico', 'cesped', 'cemento', 'parquet')),
  roofed boolean not null default false,
  price numeric(10,2) check (price is null or price between 0 and 10000000),   -- por hora
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists fields_complex on fields (complex_id);
-- Cuántas canchas tiene un complejo (para el tope de la policy de alta; con security definer para que la policy no se llame a sí misma).
create or replace function complex_fields_count(c uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from fields where complex_id = c
$$;
revoke execute on function complex_fields_count(uuid) from public, anon;
grant execute on function complex_fields_count(uuid) to authenticated;

-- Horario de apertura por día (0 = domingo). Un día sin fila está cerrado.
-- Si cierra <= abre, cierra al día siguiente (18:00 → 01:00; 00:00 → 00:00 es las 24 h).
create table if not exists complex_hours (
  complex_id uuid not null references complexes on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  opens time not null,
  closes time not null,
  primary key (complex_id, weekday)
);

-- Reservas / turnos
create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null references fields on delete cascade,
  complex_id uuid not null references complexes on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected', 'cancelled')),
  kind text not null default 'request' check (kind in ('request', 'block')),   -- block: lo cargó el dueño (teléfono, mantenimiento)
  requested_by uuid references profiles on delete set null,
  community_id uuid references communities on delete set null,
  match_id uuid references matches on delete set null,                          -- partido vinculado (link_booking_match)
  note text check (note is null or length(note) <= 300),                        -- nota de quien pidió (o del dueño, en un block)
  owner_note text check (owner_note is null or length(owner_note) <= 300),      -- respuesta del dueño: motivo del rechazo o cancelación
  price numeric(10,2),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at and ends_at - starts_at <= interval '24 hours')
);
-- Dos turnos confirmados nunca se pisan en la misma cancha.
do $$ begin
  alter table bookings add constraint bookings_no_overlap
    exclude using gist (field_id with =, tstzrange(starts_at, ends_at) with &&) where (status = 'confirmed');
exception when duplicate_object or duplicate_table then null; end $$;
create index if not exists bookings_complex_time on bookings (complex_id, starts_at);
create index if not exists bookings_field_time on bookings (field_id, starts_at);
create index if not exists bookings_requested_by on bookings (requested_by);
create index if not exists bookings_community on bookings (community_id) where community_id is not null;
create index if not exists bookings_match on bookings (match_id) where match_id is not null;
create index if not exists bookings_pending on bookings (complex_id, starts_at) where status = 'pending';

-- La cancha guardada de un grupo puede apuntar a un complejo del catálogo (una por grupo y complejo).
alter table venues add column if not exists complex_id uuid references complexes on delete set null;
create unique index if not exists venues_community_complex on venues (community_id, complex_id) where complex_id is not null;

-- =========================================================================================
-- 3) RLS y permisos de tablas
--    Complejos, horarios y reservas: lectura por RLS, escritura solo por RPC (no hay policies de escritura).
-- =========================================================================================
alter table complexes enable row level security;
alter table complex_staff enable row level security;
alter table fields enable row level security;
alter table complex_hours enable row level security;
alter table bookings enable row level security;

-- Catálogo: los complejos activos los ve cualquiera con sesión; los pausados, solo su dueño.
drop policy if exists cx_read on complexes;
create policy cx_read on complexes for select to authenticated using (active or is_complex_staff(id));
drop policy if exists cx_upd on complexes;
drop policy if exists cx_del on complexes;     -- (la versión borrador permitía borrar y cambiar todo: ahora solo por RPC)

drop policy if exists cs_read on complex_staff;
create policy cs_read on complex_staff for select to authenticated using (profile_id = me() or is_complex_staff(complex_id));

drop policy if exists fd_read on fields;
create policy fd_read on fields for select to authenticated using (
  is_complex_staff(complex_id) or (active and exists (select 1 from complexes c where c.id = fields.complex_id and c.active)));
drop policy if exists fd_ins on fields;
create policy fd_ins on fields for insert to authenticated with check (
  is_complex_staff(complex_id) and complex_fields_count(complex_id) < 30);
drop policy if exists fd_upd on fields;
create policy fd_upd on fields for update to authenticated using (is_complex_staff(complex_id)) with check (is_complex_staff(complex_id));
-- Borrar una cancha solo si nunca tuvo reservas (si no, el dueño la desactiva y el historial queda).
drop policy if exists fd_del on fields;
create policy fd_del on fields for delete to authenticated using (
  is_complex_staff(complex_id) and not exists (select 1 from bookings b where b.field_id = fields.id));

drop policy if exists ch_read on complex_hours;
create policy ch_read on complex_hours for select to authenticated using (
  is_complex_staff(complex_id) or exists (select 1 from complexes c where c.id = complex_hours.complex_id and c.active));
drop policy if exists ch_ins on complex_hours;
drop policy if exists ch_upd on complex_hours;
drop policy if exists ch_del on complex_hours;

-- Ven la reserva: quien la pidió, el dueño/encargado y los miembros del grupo para el que se pidió.
-- (La disponibilidad pública sale de complex_busy, sin datos de nadie.) Altas y cambios: solo por RPC.
drop policy if exists bk_read on bookings;
create policy bk_read on bookings for select to authenticated using (
  requested_by = me() or is_complex_staff(complex_id) or (community_id is not null and is_member(community_id)));

revoke all on complexes, complex_staff, fields, complex_hours, bookings from anon;
revoke insert, update, delete on complexes, complex_staff, complex_hours, bookings from authenticated;
-- Las canchas se editan directo por la API, pero solo estas columnas: una cancha no se puede mover a otro complejo (complex_id).
revoke update on fields from authenticated;
grant update (name, size, surface, roofed, price, active) on fields to authenticated;

-- =========================================================================================
-- 4) Fotos de complejos (bucket público; ruta <complejo>/<uuid>.jpg; suben, ven en la API y borran solo sus encargados)
--    Las políticas usan CASE para que el cast a uuid de la carpeta solo se evalúe en este bucket (las demás carpetas no son uuid de complejos).
--    cx_photo_read hace falta para que remove() encuentre las fotos viejas; no expone nada: el bucket es público y las URL no la usan.
-- =========================================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('complexes', 'complexes', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists cx_photo_up on storage.objects;
create policy cx_photo_up on storage.objects for insert to authenticated with check (
  case when bucket_id = 'complexes' then public.is_complex_staff(((storage.foldername(name))[1])::uuid) else false end);
drop policy if exists cx_photo_del on storage.objects;
create policy cx_photo_del on storage.objects for delete to authenticated using (
  case when bucket_id = 'complexes' then public.is_complex_staff(((storage.foldername(name))[1])::uuid) else false end);
drop policy if exists cx_photo_read on storage.objects;
create policy cx_photo_read on storage.objects for select to authenticated using (
  case when bucket_id = 'complexes' then public.is_complex_staff(((storage.foldername(name))[1])::uuid) else false end);

-- =========================================================================================
-- 5) RPCs del dueño
-- =========================================================================================
-- Validación común de los datos del complejo (la usan create_complex y update_complex). Solo interna.
create or replace function complex_check_input(p_name text, p_lat double precision, p_lng double precision, p_maps_url text,
  p_phone text, p_whatsapp text, p_description text) returns void
language plpgsql immutable set search_path = public as $$
begin
  if length(btrim(coalesce(p_name, ''))) not between 2 and 80 then raise exception 'bad_name'; end if;
  -- NaN e Infinity quedan afuera: para Postgres son mayores que cualquier número
  if (p_lat is null) <> (p_lng is null) then raise exception 'bad_coords'; end if;
  if p_lat is not null and (p_lat not between -90 and 90 or p_lng not between -180 and 180) then raise exception 'bad_coords'; end if;
  if p_maps_url is not null and (p_maps_url !~ '^https://' or length(p_maps_url) > 1000) then raise exception 'bad_maps_url'; end if;
  if p_phone is not null and p_phone !~ '^[0-9+ ()-]{6,25}$' then raise exception 'bad_phone'; end if;
  if p_whatsapp is not null and p_whatsapp !~ '^[0-9]{8,15}$' then raise exception 'bad_whatsapp'; end if;
  if p_description is not null and length(p_description) > 600 then raise exception 'bad_description'; end if;
end $$;
revoke all on function complex_check_input(text, double precision, double precision, text, text, text, text) from public, anon, authenticated;

-- Servicios permitidos (una lista cerrada: se muestran con ícono en la app).
create or replace function complex_check_amenities(p_amenities text[]) returns void
language plpgsql immutable set search_path = public as $$
begin
  if p_amenities is not null and (coalesce(array_length(p_amenities, 1), 0) > 12
     or exists (select 1 from unnest(p_amenities) a where a is null or a not in
       ('vestuarios', 'duchas', 'estacionamiento', 'bar', 'parrilla', 'wifi', 'iluminacion', 'pecheras', 'accesible')))
  then raise exception 'bad_amenities'; end if;
end $$;
revoke all on function complex_check_amenities(text[]) from public, anon, authenticated;

-- Alta de complejo: el que lo crea queda como dueño y pasa a tener el rol de dueño de cancha.
create or replace function create_complex(p_name text, p_address text default null, p_city text default null,
  p_lat double precision default null, p_lng double precision default null, p_maps_url text default null,
  p_phone text default null, p_whatsapp text default null, p_description text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid; v_me uuid := me();
begin
  if v_me is null then raise exception 'forbidden'; end if;
  if (select count(*) from complex_staff where profile_id = v_me and role = 'owner') >= 10 then raise exception 'too_many'; end if;
  perform complex_check_input(p_name, p_lat, p_lng, p_maps_url, p_phone, p_whatsapp, p_description);
  insert into complexes (name, address, city, lat, lng, maps_url, phone, whatsapp, description, created_by)
    values (btrim(p_name), nullif(btrim(coalesce(p_address, '')), ''), nullif(btrim(coalesce(p_city, '')), ''),
            p_lat, p_lng, p_maps_url, nullif(btrim(coalesce(p_phone, '')), ''), nullif(btrim(coalesce(p_whatsapp, '')), ''),
            nullif(btrim(coalesce(p_description, '')), ''), v_me)
    returning id into cid;
  insert into complex_staff (complex_id, profile_id, role) values (cid, v_me, 'owner');
  update profiles set is_owner = true, role_chosen = true where id = v_me;
  -- Horario por defecto: todos los días de 9 a 24 (el dueño lo cambia).
  insert into complex_hours (complex_id, weekday, opens, closes)
    select cid, d, time '09:00', time '00:00' from generate_series(0, 6) d on conflict do nothing;
  return cid;
end $$;
revoke execute on function create_complex(text, text, text, double precision, double precision, text, text, text, text) from public, anon;
grant execute on function create_complex(text, text, text, double precision, double precision, text, text, text, text) to authenticated;

-- Editar los datos del complejo. Los campos opcionales se REEMPLAZAN (null = vaciar); p_slot_minutes y p_amenities null = no cambiar.
create or replace function update_complex(p_complex uuid, p_name text, p_address text default null, p_city text default null,
  p_lat double precision default null, p_lng double precision default null, p_maps_url text default null,
  p_phone text default null, p_whatsapp text default null, p_description text default null,
  p_slot_minutes int default null, p_amenities text[] default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_complex_staff(p_complex) then raise exception 'forbidden'; end if;
  perform complex_check_input(p_name, p_lat, p_lng, p_maps_url, p_phone, p_whatsapp, p_description);
  perform complex_check_amenities(p_amenities);
  if p_slot_minutes is not null and p_slot_minutes not in (30, 60, 90, 120) then raise exception 'bad_slot'; end if;
  update complexes set name = btrim(p_name), address = nullif(btrim(coalesce(p_address, '')), ''),
    city = nullif(btrim(coalesce(p_city, '')), ''), lat = p_lat, lng = p_lng, maps_url = p_maps_url,
    phone = nullif(btrim(coalesce(p_phone, '')), ''), whatsapp = nullif(btrim(coalesce(p_whatsapp, '')), ''),
    description = nullif(btrim(coalesce(p_description, '')), ''),
    slot_minutes = coalesce(p_slot_minutes, slot_minutes), amenities = coalesce(p_amenities, amenities)
    where id = p_complex;
end $$;
revoke execute on function update_complex(uuid, text, text, text, double precision, double precision, text, text, text, text, int, text[]) from public, anon;
grant execute on function update_complex(uuid, text, text, text, double precision, double precision, text, text, text, text, int, text[]) to authenticated;

-- Pausar / volver a publicar el complejo (pausado no aparece en el buscador ni acepta pedidos; sus reservas se conservan).
create or replace function set_complex_active(p_complex uuid, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_complex_owner(p_complex) then raise exception 'forbidden'; end if;
  update complexes set active = coalesce(p_active, true) where id = p_complex;
end $$;
revoke execute on function set_complex_active(uuid, boolean) from public, anon;
grant execute on function set_complex_active(uuid, boolean) to authenticated;

-- Duración base del turno (30/60/90/120). Aparte de update_complex para no reenviar (y pisar) el resto de los datos.
create or replace function set_complex_slot(p_complex uuid, p_minutes int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_complex_staff(p_complex) then raise exception 'forbidden'; end if;
  if p_minutes is null or p_minutes not in (30, 60, 90, 120) then raise exception 'bad_slot'; end if;
  update complexes set slot_minutes = p_minutes where id = p_complex;
end $$;
revoke execute on function set_complex_slot(uuid, int) from public, anon;
grant execute on function set_complex_slot(uuid, int) to authenticated;

-- Host del almacenamiento público de ESTE proyecto, sacado del secreto `push_url` del Vault (la misma URL del proyecto que usa push_call).
-- null si el secreto no está (entonces set_complex_photo exige un host *.supabase.co). Interna.
create or replace function storage_public_host() returns text
language sql stable security definer set search_path = public as $$
  select lower(nullif(split_part(split_part(decrypted_secret, '//', 2), '/', 1), ''))
  from vault.decrypted_secrets where name = 'push_url' limit 1
$$;
revoke all on function storage_public_host() from public, anon, authenticated;

-- Foto del complejo (solo de su carpeta del bucket, en el almacenamiento de este proyecto: nada de URLs de otros sitios).
create or replace function set_complex_photo(p_complex uuid, p_url text) returns void
language plpgsql security definer set search_path = public as $$
declare v_host text; v_prefix text; v_tail text;
begin
  if not is_complex_staff(p_complex) then raise exception 'forbidden'; end if;
  if p_url is not null then
    v_host := storage_public_host();
    if v_host is null then
      -- Sin el secreto (otro entorno): al menos un proyecto de Supabase.
      if p_url !~ ('^https://[a-z0-9]{10,30}\.supabase\.co/storage/v1/object/public/complexes/' || p_complex::text || '/[0-9a-f-]+\.jpg(\?v=\d+)?$')
        then raise exception 'bad_photo'; end if;
    else
      v_prefix := 'https://' || v_host || '/storage/v1/object/public/complexes/' || p_complex::text || '/';
      if left(p_url, length(v_prefix)) <> v_prefix then raise exception 'bad_photo'; end if;
      v_tail := substr(p_url, length(v_prefix) + 1);
      if v_tail !~ '^[0-9a-f-]+\.jpg(\?v=\d+)?$' then raise exception 'bad_photo'; end if;
    end if;
  end if;
  update complexes set photo_url = p_url where id = p_complex;
end $$;
revoke execute on function set_complex_photo(uuid, text) from public, anon;
grant execute on function set_complex_photo(uuid, text) to authenticated;

-- Horario semanal (reemplaza todo): [{"weekday":0..6,"opens":"18:00","closes":"01:00"}, ...]. Los días que no vengan quedan cerrados.
create or replace function set_complex_hours(p_complex uuid, p_hours jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_complex_staff(p_complex) then raise exception 'forbidden'; end if;
  if p_hours is null or jsonb_typeof(p_hours) <> 'array' or jsonb_array_length(p_hours) > 7 then raise exception 'bad_hours'; end if;
  begin
    if exists (select 1 from jsonb_to_recordset(p_hours) as x(weekday smallint, opens time, closes time)
               where x.weekday is null or x.weekday not between 0 and 6 or x.opens is null or x.closes is null)
       or (select count(distinct x.weekday) from jsonb_to_recordset(p_hours) as x(weekday smallint, opens time, closes time))
          <> jsonb_array_length(p_hours)
    then raise exception 'bad_hours'; end if;
  exception when others then
    raise exception 'bad_hours';   -- también cubre horas o días con formato inválido
  end;
  delete from complex_hours where complex_id = p_complex;
  insert into complex_hours (complex_id, weekday, opens, closes)
    select p_complex, x.weekday, x.opens, x.closes from jsonb_to_recordset(p_hours) as x(weekday smallint, opens time, closes time);
end $$;
revoke execute on function set_complex_hours(uuid, jsonb) from public, anon;
grant execute on function set_complex_hours(uuid, jsonb) to authenticated;

-- ¿Ese horario cae dentro de lo que abre el complejo? (hora local del complejo). Interna: la usa request_booking.
create or replace function complex_open_at(p_complex uuid, p_starts timestamptz, p_ends timestamptz) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v_tz text; ls timestamp; le timestamp; h complex_hours; o timestamp; c timestamp; d date;
begin
  select tz into v_tz from complexes where id = p_complex;
  if v_tz is null then return false; end if;
  ls := p_starts at time zone v_tz; le := p_ends at time zone v_tz;
  -- Se prueba el horario del día del inicio y el del día anterior (por si cierra pasada la medianoche).
  foreach d in array array[ls::date, ls::date - 1] loop
    select * into h from complex_hours where complex_id = p_complex and weekday = extract(dow from d)::int;
    continue when h.complex_id is null;
    o := d + h.opens;
    c := d + h.closes + case when h.closes <= h.opens then interval '1 day' else interval '0' end;
    if ls >= o and le <= c then return true; end if;
  end loop;
  return false;
end $$;
revoke execute on function complex_open_at(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function complex_open_at(uuid, timestamptz, timestamptz) to authenticated;

-- Bloquear un horario (reservado por teléfono, mantenimiento, torneo…): queda confirmado sin pedido, hasta 24 h.
create or replace function block_slot(p_field uuid, p_starts timestamptz, p_minutes int, p_note text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare f fields; bid uuid;
begin
  select * into f from fields where id = p_field;
  if f.id is null or not is_complex_staff(f.complex_id) then raise exception 'forbidden'; end if;
  if p_starts is null or p_minutes is null or p_minutes not between 30 and 1440 or p_minutes % 30 <> 0 then raise exception 'bad_duration'; end if;
  if p_starts > now() + interval '1 year' then raise exception 'too_far'; end if;
  begin
    insert into bookings (field_id, complex_id, starts_at, ends_at, status, kind, requested_by, note, decided_at)
      values (p_field, f.complex_id, p_starts, p_starts + make_interval(mins => p_minutes), 'confirmed', 'block', me(),
              nullif(btrim(coalesce(p_note, '')), ''), now())
      returning id into bid;
  exception when exclusion_violation then raise exception 'slot_taken';
  end;
  return bid;
end $$;
revoke execute on function block_slot(uuid, timestamptz, int, text) from public, anon;
grant execute on function block_slot(uuid, timestamptz, int, text) to authenticated;

-- Confirmar o rechazar un pedido de turno. p_note: motivo (se le muestra a quien pidió).
create or replace function decide_booking(p_booking uuid, p_accept boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare b bookings;
begin
  select * into b from bookings where id = p_booking for update;
  if b.id is null or not is_complex_staff(b.complex_id) then raise exception 'forbidden'; end if;
  if b.kind <> 'request' or b.status <> 'pending' then raise exception 'not_pending'; end if;
  if coalesce(p_accept, false) and b.ends_at <= now() then raise exception 'past'; end if;
  begin
    update bookings set status = case when coalesce(p_accept, false) then 'confirmed' else 'rejected' end, decided_at = now(),
      owner_note = nullif(btrim(coalesce(p_note, '')), '')
      where id = p_booking;
  exception when exclusion_violation then raise exception 'slot_taken';
  end;
end $$;
revoke execute on function decide_booking(uuid, boolean, text) from public, anon;
grant execute on function decide_booking(uuid, boolean, text) to authenticated;

-- Agenda del dueño: reservas de su complejo en un rango (máx. 62 días) con quién las pidió. Si no es suyo: vacío.
create or replace function complex_agenda(p_complex uuid, p_from timestamptz, p_to timestamptz)
returns table (id uuid, field_id uuid, starts_at timestamptz, ends_at timestamptz, status text, kind text, note text, owner_note text,
               price numeric, requester_id uuid, requester_name text, requester_photo text, community_name text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select b.id, b.field_id, b.starts_at, b.ends_at, b.status, b.kind, b.note, b.owner_note, b.price,
         p.id, coalesce(nullif(btrim(p.nickname), ''), p.name), p.photo_url, c.name, b.created_at
  from bookings b
  left join profiles p on p.id = b.requested_by
  left join communities c on c.id = b.community_id
  where b.complex_id = p_complex and is_complex_staff(p_complex)
    and b.starts_at < p_to and b.ends_at > p_from and p_to - p_from <= interval '62 days'
  order by b.starts_at, b.created_at
  limit 2000
$$;
revoke execute on function complex_agenda(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function complex_agenda(uuid, timestamptz, timestamptz) to authenticated;

-- Resumen de mis complejos para el panel: pedidos por responder y turnos confirmados de hoy (día local del complejo).
create or replace function owner_overview() returns table (complex_id uuid, pending int, today int)
language sql stable security definer set search_path = public as $$
  select s.complex_id,
    (select count(*) from bookings b where b.complex_id = s.complex_id and b.kind = 'request' and b.status = 'pending'
       and b.ends_at > now())::int,
    (select count(*) from bookings b where b.complex_id = s.complex_id and b.status = 'confirmed'
       and (b.starts_at at time zone c.tz)::date = (now() at time zone c.tz)::date)::int
  from complex_staff s join complexes c on c.id = s.complex_id
  where s.profile_id = me()
$$;
revoke execute on function owner_overview() from public, anon;
grant execute on function owner_overview() to authenticated;

-- =========================================================================================
-- 6) RPCs del jugador
-- =========================================================================================
-- Ocupación pública (sin datos de nadie): confirmados y pendientes de un complejo en un rango (máx. 14 días).
create or replace function complex_busy(p_complex uuid, p_from timestamptz, p_to timestamptz)
returns table (field_id uuid, starts_at timestamptz, ends_at timestamptz, status text)
language sql stable security definer set search_path = public as $$
  select b.field_id, b.starts_at, b.ends_at, b.status from bookings b
  join complexes c on c.id = b.complex_id and c.active
  where me() is not null and b.complex_id = p_complex and b.status in ('pending', 'confirmed')
    and b.starts_at < p_to and b.ends_at > p_from and p_to - p_from <= interval '14 days'
  order by b.starts_at
$$;
revoke execute on function complex_busy(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function complex_busy(uuid, timestamptz, timestamptz) to authenticated;

-- Pedir un turno (para mí, para mi grupo o para un partido de mi grupo). Queda pendiente hasta que el dueño responda.
-- p_match es solo una referencia (para qué partido es): no toca el partido; eso es link_booking_match, con el turno confirmado.
create or replace function request_booking(p_field uuid, p_starts timestamptz, p_minutes int,
  p_community uuid default null, p_match uuid default null, p_note text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare f fields; cx complexes; m matches; bid uuid; ends timestamptz; v_me uuid := me();
begin
  if v_me is null then raise exception 'forbidden'; end if;
  select * into f from fields where id = p_field and active;
  if f.id is null then raise exception 'no_field'; end if;
  select * into cx from complexes where id = f.complex_id and active;
  if cx.id is null then raise exception 'no_field'; end if;
  if p_starts is null or p_minutes is null or p_minutes not between 30 and 240 or p_minutes % cx.slot_minutes <> 0
    then raise exception 'bad_duration'; end if;
  if mod(extract(epoch from p_starts)::bigint, 1800) <> 0 then raise exception 'bad_start'; end if;   -- en punto o y media
  if p_starts <= now() then raise exception 'past'; end if;
  if p_starts > now() + interval '60 days' then raise exception 'too_far'; end if;
  ends := p_starts + make_interval(mins => p_minutes);
  if not complex_open_at(cx.id, p_starts, ends) then raise exception 'closed'; end if;
  if p_community is not null and not is_member(p_community) then raise exception 'not_member'; end if;
  if p_match is not null then
    select * into m from matches where id = p_match;
    if m.id is null or not is_admin(m.community_id) then raise exception 'forbidden'; end if;
    p_community := m.community_id;
  end if;
  if exists (select 1 from bookings where field_id = p_field and status = 'confirmed'
             and tstzrange(starts_at, ends_at) && tstzrange(p_starts, ends)) then raise exception 'slot_taken'; end if;
  if exists (select 1 from bookings where requested_by = v_me and field_id = p_field and starts_at = p_starts
             and kind = 'request' and status in ('pending', 'confirmed')) then raise exception 'duplicate'; end if;
  if (select count(*) from bookings where requested_by = v_me and kind = 'request' and status = 'pending' and starts_at > now()) >= 5
    then raise exception 'too_many_pending'; end if;
  insert into bookings (field_id, complex_id, starts_at, ends_at, requested_by, community_id, match_id, note, price)
    values (p_field, cx.id, p_starts, ends, v_me, p_community, p_match, nullif(btrim(coalesce(p_note, '')), ''),
            case when f.price is null then null else round(f.price * p_minutes / 60.0, 2) end)
    returning id into bid;
  return bid;
end $$;
revoke execute on function request_booking(uuid, timestamptz, int, uuid, uuid, text) from public, anon;
grant execute on function request_booking(uuid, timestamptz, int, uuid, uuid, text) to authenticated;

-- Cancelar: quien lo pidió (antes de que empiece) o el dueño/encargado (con un motivo opcional que ve el jugador).
-- Un turno que ya terminó no se cancela (no tiene sentido avisarle al jugador): un pedido vencido se rechaza con decide_booking.
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
    owner_note = case when v_staff and nullif(btrim(coalesce(p_reason, '')), '') is not null then btrim(p_reason) else owner_note end
    where id = p_booking;
end $$;
revoke execute on function cancel_booking(uuid, text) from public, anon;
grant execute on function cancel_booking(uuid, text) to authenticated;

-- Búsqueda por radio (km) alrededor de un punto: distancia real (haversine), tamaños y precio desde.
-- p_km se acota a 1..100; p_limit a 1..100 (por defecto 50); p_offset >= 0. Solo complejos activos con alguna cancha activa.
create or replace function search_complexes(p_lat double precision, p_lng double precision, p_km double precision default 10,
  p_size smallint default null, p_limit int default 50, p_offset int default 0)
returns table (id uuid, name text, address text, city text, lat double precision, lng double precision, photo_url text,
               phone text, whatsapp text, km double precision, sizes smallint[], min_price numeric, fields_count int)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare v_km double precision := least(greatest(coalesce(p_km, 10), 1), 100);
begin
  if me() is null then raise exception 'forbidden'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'bad_coords'; end if;
  return query
  with d as (
    select c.id as cid, 6371.0088 * 2 * asin(least(1, sqrt(
      power(sin(radians(c.lat - p_lat) / 2), 2) +
      cos(radians(p_lat)) * cos(radians(c.lat)) * power(sin(radians(c.lng - p_lng) / 2), 2)))) as dkm
    from complexes c
    where c.active and c.lat is not null and c.lng is not null
      -- recorte grueso por caja antes de calcular (1° de latitud ≈ 111 km)
      and c.lat between p_lat - v_km / 111.0 and p_lat + v_km / 111.0
  )
  select c.id, c.name, c.address, c.city, c.lat, c.lng, c.photo_url, c.phone, c.whatsapp,
         round(d.dkm::numeric, 1)::double precision,
         array(select distinct f.size from fields f where f.complex_id = c.id and f.active order by 1),
         (select min(f.price) from fields f where f.complex_id = c.id and f.active),
         (select count(*)::int from fields f where f.complex_id = c.id and f.active)
  from d join complexes c on c.id = d.cid
  where d.dkm <= v_km
    and exists (select 1 from fields f where f.complex_id = c.id and f.active)
    and (p_size is null or exists (select 1 from fields f where f.complex_id = c.id and f.active and f.size = p_size))
  order by d.dkm, c.id
  limit least(greatest(coalesce(p_limit, 50), 1), 100) offset greatest(coalesce(p_offset, 0), 0);
end $$;
revoke execute on function search_complexes(double precision, double precision, double precision, smallint, int, int) from public, anon;
grant execute on function search_complexes(double precision, double precision, double precision, smallint, int, int) to authenticated;

-- Mis reservas (como jugador): las que pedí y las de mis grupos. Con los datos de contacto del complejo.
-- Hasta 100 que todavía no terminaron (las más próximas) + hasta 100 ya terminadas desde p_from (las más recientes): un historial largo
-- no deja afuera las reservas que vienen. Salen ordenadas por fecha, de la más vieja a la más nueva.
create or replace function my_bookings(p_from timestamptz default now() - interval '1 day')
returns table (id uuid, complex_id uuid, complex_name text, field_id uuid, field_name text, starts_at timestamptz, ends_at timestamptz,
               status text, price numeric, community_id uuid, match_id uuid, mine boolean, note text, owner_note text,
               complex_address text, complex_phone text, complex_whatsapp text)
language sql stable security definer set search_path = public as $$
  with mine as (
    select b.id, c.id as cid, c.name as cname, f.id as fid, f.name as fname, b.starts_at, b.ends_at, b.status, b.price, b.community_id,
           b.match_id, b.requested_by = me() as is_mine, b.note, b.owner_note, c.address, c.phone, c.whatsapp
    from bookings b join complexes c on c.id = b.complex_id join fields f on f.id = b.field_id
    where me() is not null and b.kind = 'request' and b.ends_at >= p_from
      and (b.requested_by = me() or (b.community_id is not null and is_member(b.community_id)))
  ),
  upcoming as (select * from mine where ends_at >= now() order by starts_at, id limit 100),
  past as (select * from mine where ends_at < now() order by starts_at desc, id limit 100)
  select x.id, x.cid, x.cname, x.fid, x.fname, x.starts_at, x.ends_at, x.status, x.price, x.community_id, x.match_id, x.is_mine,
         x.note, x.owner_note, x.address, x.phone, x.whatsapp
  from (select * from upcoming union all select * from past) x
  order by x.starts_at, x.id
$$;
revoke execute on function my_bookings(timestamptz) from public, anon;
grant execute on function my_bookings(timestamptz) to authenticated;

-- La cancha de un grupo para el complejo de un turno: la crea si falta (venues.complex_id) y devuelve su id junto con el texto que va en
-- matches.location (el nombre del complejo, más " · Cancha X" si el complejo tiene varias canchas activas). Sirve para elegir esa cancha
-- al crear o editar un partido sin vincularlo todavía (la app usa venue_id y location con create_match / update_match).
--   * Solo quien pidió el turno (pendiente o confirmado) y tiene que ser admin del grupo p_community.
create or replace function ensure_complex_venue(p_booking uuid, p_community uuid)
returns table (venue_id uuid, location text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare b bookings; cx complexes; f fields; vid uuid; loc text; v_me uuid := me();
begin
  if v_me is null then raise exception 'forbidden'; end if;
  select * into b from bookings where id = p_booking;
  if b.id is null or b.requested_by is distinct from v_me or b.kind <> 'request' then raise exception 'forbidden'; end if;
  if b.status not in ('pending', 'confirmed') then raise exception 'not_active'; end if;
  if p_community is null or not is_admin(p_community) then raise exception 'forbidden'; end if;
  select * into cx from complexes where id = b.complex_id;
  select * into f from fields where id = b.field_id;

  insert into venues (community_id, name, address, maps_url, lat, lng, created_by, complex_id)
    values (p_community, left(btrim(cx.name), 80), left(cx.address, 160), cx.maps_url, cx.lat, cx.lng, v_me, cx.id)
    on conflict (community_id, complex_id) where complex_id is not null do nothing;
  select v.id into vid from venues v where v.community_id = p_community and v.complex_id = cx.id;

  loc := left(cx.name || case when (select count(*) from fields x where x.complex_id = cx.id and x.active) > 1 then ' · ' || f.name else '' end, 200);
  return query select vid, loc;
end $$;
revoke execute on function ensure_complex_venue(uuid, uuid) from public, anon;
grant execute on function ensure_complex_venue(uuid, uuid) to authenticated;

-- Vincular un turno CONFIRMADO a un partido de mi grupo: la cancha del partido pasa a ser la del complejo.
--   * Solo quien pidió el turno, y tiene que ser admin del grupo del partido (y el partido, abierto o cerrado).
--   * Usa ensure_complex_venue (crea la cancha del grupo si falta) y se la pone al partido (venue_id + location). Si el partido ya tiene
--     esa cancha y ese texto no se toca (no hay aviso de "cambió el lugar"); si cambia, push_on_match_change avisa al grupo como siempre.
--   * No cambia la hora del partido: si no coincide con el turno, la app lo avisa y el admin la edita.
--   * Un partido tiene a lo sumo un turno vinculado: si había otro, se desvincula.
create or replace function link_booking_match(p_booking uuid, p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b bookings; m matches; vid uuid; loc text; v_me uuid := me();
begin
  if v_me is null then raise exception 'forbidden'; end if;
  select * into b from bookings where id = p_booking for update;
  if b.id is null or b.requested_by is distinct from v_me or b.kind <> 'request' then raise exception 'forbidden'; end if;
  if b.status <> 'confirmed' then raise exception 'not_confirmed'; end if;
  select * into m from matches where id = p_match for update;
  if m.id is null or not is_admin(m.community_id) then raise exception 'forbidden'; end if;
  if m.status not in ('open', 'closed') then raise exception 'not_editable'; end if;

  select e.venue_id, e.location into vid, loc from ensure_complex_venue(p_booking, m.community_id) e;
  update matches set venue_id = vid, location = loc
    where id = p_match and (venue_id is distinct from vid or location is distinct from loc);
  update bookings set match_id = null where match_id = p_match and id <> p_booking;
  update bookings set match_id = p_match, community_id = coalesce(community_id, m.community_id) where id = p_booking;
end $$;
revoke execute on function link_booking_match(uuid, uuid) from public, anon;
grant execute on function link_booking_match(uuid, uuid) to authenticated;

-- Desvincular el turno del partido (el partido conserva la cancha que tenga: se cambia desde "Editar partido").
create or replace function unlink_booking_match(p_booking uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b bookings;
begin
  select * into b from bookings where id = p_booking for update;
  if b.id is null or b.requested_by is distinct from me() then raise exception 'forbidden'; end if;
  update bookings set match_id = null where id = p_booking;
end $$;
revoke execute on function unlink_booking_match(uuid) from public, anon;
grant execute on function unlink_booking_match(uuid) to authenticated;

-- =========================================================================================
-- 7) Avisos
--    booking_request  : pedido nuevo → a los encargados del complejo.
--    booking_status   : cambió el estado (status = confirmed | rejected | cancelled). `by` = 'requester' si lo cambió quien pidió
--                       (cancelación del jugador → se le avisa al dueño) o 'staff' si lo cambió el complejo (→ se le avisa a quien pidió).
--    Los block (cargados por el dueño) no avisan.
-- =========================================================================================
create or replace function push_on_booking() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind <> 'request' then return null; end if;
  if tg_op = 'INSERT' then
    perform push_call(jsonb_build_object('type', 'booking_request', 'booking_id', new.id));
  elsif new.status is distinct from old.status and new.status in ('confirmed', 'rejected', 'cancelled') then
    perform push_call(jsonb_build_object('type', 'booking_status', 'booking_id', new.id, 'status', new.status,
      'by', case when me() is not null and me() is not distinct from new.requested_by then 'requester' else 'staff' end));
  end if;
  return null;
end $$;
revoke all on function push_on_booking() from public, anon, authenticated;
drop trigger if exists push_booking on bookings;
create trigger push_booking after insert or update of status on bookings for each row execute function push_on_booking();

-- Agenda en vivo del dueño (llegan pedidos y cambios sin recargar). RLS filtra: cada uno recibe solo lo que puede leer.
do $$ begin
  alter publication supabase_realtime add table bookings;
exception when duplicate_object or undefined_object then null; end $$;

-- =========================================================================================
-- 8) approve_claim: complejos, reservas y roles del que reclama pasan al perfil que queda
--    approve_claim suelta la cuenta del que reclama y borra su perfil: sin esto, sus complejos (complex_staff, en cascada),
--    sus reservas y sus roles se perderían. Para no pisar lo que otros agreguen a esa función (Mati y Eduardo aplican SQL
--    directo; las migraciones de temporadas y de zona también la tocan), no se reescribe a mano: se toma la definición VIVA,
--    se le agrega el bloque justo antes de "update profiles set user_id = null where id = p_claimant;" y se vuelve a crear.
--    Es idempotente (si ya menciona complex_staff no hace nada) y falla fuerte, sin tocar la función, si no encuentra dónde.
--    Si más adelante otra migración vuelve a crear approve_claim desde una versión vieja, correr de nuevo este bloque.
-- =========================================================================================
do $$
declare
  v_oid oid;
  v_def text;
  v_marker constant text := 'update profiles set user_id = null where id = p_claimant;';
  v_block constant text :=
    E'-- Complejos, reservas y roles (dueño de cancha): pasan al perfil que queda\n'
    || E'  delete from complex_staff s where s.profile_id = p_claimant\n'
    || E'    and exists (select 1 from complex_staff x where x.complex_id = s.complex_id and x.profile_id = p_placeholder);\n'
    || E'  update complex_staff set profile_id = p_placeholder where profile_id = p_claimant;\n'
    || E'  update complexes set created_by = p_placeholder where created_by = p_claimant;\n'
    || E'  update bookings set requested_by = p_placeholder where requested_by = p_claimant;\n'
    || E'  update profiles p set is_owner = p.is_owner or c.is_owner, is_player = p.is_player or c.is_player, role_chosen = true\n'
    || E'    from profiles c where p.id = p_placeholder and c.id = p_claimant;\n\n  ';
begin
  select p.oid into v_oid from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'approve_claim'
    and pg_get_function_identity_arguments(p.oid) = 'p_placeholder uuid, p_claimant uuid';
  if v_oid is null then
    raise notice 'approve_claim no existe en esta base: nada que actualizar';
    return;
  end if;
  v_def := pg_get_functiondef(v_oid);
  if position('complex_staff' in v_def) > 0 then
    raise notice 'approve_claim ya mueve complejos y reservas';
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_marker, ''))) / length(v_marker) <> 1 then
    raise exception 'approve_claim: no encontre un unico "%" para mover complejos y reservas; revisar la definicion viva', v_marker;
  end if;
  execute replace(v_def, v_marker, v_block || v_marker);
end $$;

notify pgrst, 'reload schema';
