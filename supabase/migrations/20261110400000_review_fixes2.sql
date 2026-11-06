-- Correcciones de la revisión (tanda 1). Idempotente; no borra datos.

-- 1) Partido fijo: no duplicar si un admin le cambió la hora a la convocatoria creada (se compara por FECHA
--    de la ocurrencia, no por hora exacta), y respetar open_days_before > 6 mirando también la semana siguiente.
create or replace function create_scheduled_matches(p_only uuid default null) returns int
language plpgsql security definer set search_path = public as $$
declare s match_schedules; today date; nd date; ts timestamptz; k int := 0; owner uuid; i int;
begin
  for s in select * from match_schedules where active and (p_only is null or id = p_only) loop
    today := (now() at time zone s.tz)::date;
    for i in 0..1 loop
      nd := today + ((s.weekday - extract(dow from today)::int + 7) % 7) + 7 * i;
      ts := (nd + s.at_time) at time zone s.tz;
      continue when ts <= now();
      continue when nd - s.open_days_before > today;
      -- Ya existe la de esa fecha (aunque la hayan movido de hora o cancelado): no se recrea.
      continue when exists (select 1 from matches where schedule_id = s.id and (starts_at at time zone s.tz)::date = nd);
      -- Un admin ya creó a mano un partido ese mismo día y hora: no se duplica.
      continue when exists (select 1 from matches where community_id = s.community_id and starts_at = ts and status <> 'cancelled');
      select owner_id into owner from communities where id = s.community_id;
      insert into matches (community_id, title, starts_at, location, venue_id, slots, fee_total, schedule_id, created_by)
        values (s.community_id, s.title, ts,
                coalesce(s.location, (select name from venues where id = s.venue_id)),
                s.venue_id, s.slots, s.fee_total, s.id, coalesce(s.created_by, owner))
        on conflict (schedule_id, starts_at) where schedule_id is not null do nothing;
      if found then k := k + 1; end if;
    end loop;
  end loop;
  return k;
end $$;
revoke all on function create_scheduled_matches(uuid) from public, anon, authenticated;

-- 2) update_match (versión de 20261110100000_venues.sql) + si cambia la hora, vuelve a avisar "falta 1 hora".
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

  update matches set title = ttl, starts_at = p_starts_at, location = loc, slots = p_slots, venue_id = p_venue,
    reminded_at = case when p_starts_at is distinct from m.starts_at then null else reminded_at end
    where id = p_match;

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

-- 3) Partido cargado ya jugado ("Cargar partido jugado"): avisar "votá la figura" si es reciente.
create or replace function push_on_match() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'played' then
    if new.starts_at > now() - interval '2 days' then
      perform push_call(jsonb_build_object('type', 'mvp', 'match_id', new.id));
    end if;
  elsif new.starts_at > now() then
    perform push_call(jsonb_build_object('type', 'match', 'match_id', new.id));
  end if;
  return null;
end $$;
