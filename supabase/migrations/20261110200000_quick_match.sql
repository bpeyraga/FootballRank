-- Carga rápida de un partido ya jugado: partido + jugadores (con equipo) + resultado + goles/asistencias/tarjetas
-- en una sola llamada y en una sola transacción. Solo admins. Idempotente; no borra datos.
-- Requiere 20261110100000_venues.sql (columna matches.venue_id y tabla venues).

create or replace function load_played_match(
  p_community uuid, p_title text, p_starts_at timestamptz, p_location text, p_venue uuid,
  p_players jsonb, p_a int, p_b int, p_events jsonb default '[]'
) returns uuid language plpgsql security definer set search_path = public as $$
declare mid uuid; n int;
begin
  if not is_admin(p_community) then raise exception 'forbidden'; end if;
  if p_starts_at is null or p_starts_at > now() then raise exception 'not_started'; end if;
  if p_a is null or p_b is null or p_a not between 0 and 99 or p_b not between 0 and 99 then raise exception 'bad_score'; end if;
  if p_venue is not null and not exists (select 1 from venues where id = p_venue and community_id = p_community)
    then raise exception 'bad_venue'; end if;
  if jsonb_typeof(p_players) <> 'array' or jsonb_array_length(p_players) > 80
     or jsonb_typeof(coalesce(p_events, '[]')) <> 'array' or jsonb_array_length(coalesce(p_events, '[]')) > 300
    then raise exception 'bad_input'; end if;

  create temp table _pl on commit drop as
    select distinct on (x.id) x.id, nullif(x.team, '') as team
    from jsonb_to_recordset(p_players) as x(id uuid, team text) where x.id is not null;
  select count(*) into n from _pl;
  if n < 2 then raise exception 'few_players'; end if;
  if exists (select 1 from _pl where team is not null and team not in ('A', 'B')) then raise exception 'bad_team'; end if;
  if exists (select 1 from _pl where not exists (
      select 1 from memberships m where m.community_id = p_community and m.profile_id = _pl.id))
    then raise exception 'not_member'; end if;
  if exists (select 1 from jsonb_to_recordset(coalesce(p_events, '[]')) as e(id uuid, kind text)
      where e.kind is null or e.kind not in ('goal', 'assist', 'yellow', 'red')
         or not exists (select 1 from _pl where _pl.id = e.id))
    then raise exception 'bad_event'; end if;

  insert into matches (community_id, created_by, title, starts_at, location, venue_id, slots, status, score_a, score_b, result_by)
    values (p_community, me(), coalesce(nullif(trim(p_title), ''), 'Partido'), p_starts_at,
            nullif(trim(coalesce(p_location, '')), ''), p_venue, least(greatest(n, 2), 40), 'played', p_a, p_b, me())
    returning id into mid;
  insert into match_signups (match_id, profile_id, status, team) select mid, id, 'in', team from _pl;
  insert into match_events (match_id, community_id, profile_id, kind, created_by)
    select mid, p_community, e.id, e.kind, me() from jsonb_to_recordset(coalesce(p_events, '[]')) as e(id uuid, kind text);
  return mid;
end $$;
grant execute on function load_played_match(uuid, text, timestamptz, text, uuid, jsonb, int, int, jsonb) to authenticated;

-- Anotar a varios de una (convocatoria abierta): mismo criterio que add_to_match, uno por uno, en orden.
create or replace function add_many_to_match(p_match uuid, p_profiles uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare p uuid; k int := 0;
begin
  if array_length(p_profiles, 1) > 80 then raise exception 'bad_input'; end if;
  foreach p in array coalesce(p_profiles, '{}') loop
    perform add_to_match(p_match, p);
    k := k + 1;
  end loop;
  return k;
end $$;
grant execute on function add_many_to_match(uuid, uuid[]) to authenticated;
