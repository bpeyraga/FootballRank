-- Canchas por comunidad (idempotente, sin borrar datos).
-- Los admins guardan una cancha una vez (nombre + link de Google Maps) y la eligen al crear o editar un partido.
-- matches.location sigue existiendo y se completa con el nombre de la cancha: los avisos push y el texto de
-- compartir lo usan.

-- ---------- 1) Tabla ----------
create table if not exists venues (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  address text check (address is null or length(address) <= 160),
  maps_url text check (maps_url is null or (maps_url ~ '^https://' and length(maps_url) <= 1000)),
  lat double precision,
  lng double precision,
  created_by uuid references profiles on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists venues_community_idx on venues (community_id);

alter table venues enable row level security;

-- Leen los miembros; crean, editan y borran solo owner/admins
drop policy if exists ve_read on venues;
create policy ve_read on venues for select using (is_member(community_id));

drop policy if exists ve_ins on venues;
create policy ve_ins on venues for insert with check (is_admin(community_id) and created_by = me());

drop policy if exists ve_upd on venues;
create policy ve_upd on venues for update using (is_admin(community_id)) with check (is_admin(community_id));

drop policy if exists ve_del on venues;
create policy ve_del on venues for delete using (is_admin(community_id));

-- ---------- 2) Cancha del partido ----------
-- Si se borra la cancha, los partidos quedan sin cancha (conservan el texto de matches.location).
alter table matches add column if not exists venue_id uuid references venues(id) on delete set null;

-- Las policies de insert/update de matches no miraban venue_id: ahora la cancha tiene que ser de la misma comunidad.
drop policy if exists mt_ins on matches;
create policy mt_ins on matches for insert with check (
  is_admin(community_id) and created_by = me()
  and (venue_id is null or exists (select 1 from venues v where v.id = matches.venue_id and v.community_id = matches.community_id))
);

drop policy if exists mt_upd on matches;
create policy mt_upd on matches for update using (is_admin(community_id)) with check (
  is_admin(community_id)
  and (venue_id is null or exists (select 1 from venues v where v.id = matches.venue_id and v.community_id = matches.community_id))
);

-- ---------- 3) Editar un partido: ahora también la cancha ----------
-- Misma lógica que la versión de 20261108100000_admin_tools.sql (única definición hasta ahora) + p_venue.
-- p_venue null = sin cancha guardada (una app vieja que no manda p_venue deja el partido sin cancha).
-- Se borra la firma vieja (5 argumentos) para que no haya dos sobrecargas ambiguas.
drop function if exists update_match(uuid, text, timestamptz, text, int);
create or replace function update_match(p_match uuid, p_title text, p_starts_at timestamptz, p_location text, p_slots int, p_venue uuid default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  m matches;
  ttl text := btrim(coalesce(p_title, ''));
  loc text := nullif(btrim(coalesce(p_location, '')), '');
  taken int;
begin
  select * into m from matches where id = p_match for update;
  if m.id is null or not is_admin(m.community_id) then raise exception 'forbidden'; end if;
  if m.status not in ('open', 'closed') then raise exception 'not_editable'; end if;
  if length(ttl) not between 1 and 80 then raise exception 'bad_title'; end if;
  if p_starts_at is null then raise exception 'bad_date'; end if;
  if loc is not null and length(loc) > 200 then raise exception 'bad_location'; end if;
  if p_slots is null or p_slots not between 2 and 40 then raise exception 'bad_slots'; end if;
  if p_venue is not null and not exists (select 1 from venues where id = p_venue and community_id = m.community_id) then
    raise exception 'bad_venue';
  end if;

  update matches set title = ttl, starts_at = p_starts_at, location = loc, slots = p_slots, venue_id = p_venue where id = p_match;

  select count(*) into taken from match_signups where match_id = p_match and status = 'in';
  if taken > p_slots then
    update match_signups set status = 'waitlist', team = null
      where match_id = p_match and profile_id in (
        select profile_id from match_signups where match_id = p_match and status = 'in'
        order by created_at desc, profile_id desc limit taken - p_slots);
  elsif taken < p_slots then
    update match_signups set status = 'in'
      where match_id = p_match and profile_id in (
        select profile_id from match_signups where match_id = p_match and status = 'waitlist'
        order by created_at, profile_id limit p_slots - taken);
  end if;
end $$;
revoke execute on function update_match(uuid, text, timestamptz, text, int, uuid) from public, anon;
grant execute on function update_match(uuid, text, timestamptz, text, int, uuid) to authenticated;
