-- Herramientas de admin y comodidades del partido. Idempotente: se puede pegar en el SQL editor y correr más de una vez.
--   1) Editar un partido (update_match), con reacomodo de anotados / lista de espera
--   2) La lista se cierra sola al empezar el partido (signup y leave_match)
--   3) Transferir ownership (transfer_ownership)
--   4) Links de invitación que vencen (invite_expires_at)

-- ---------- 4) Invitaciones que vencen (null = no vence) ----------
alter table communities add column if not exists invite_expires_at timestamptz;

-- Antes era regenerate_invite(uuid). Si quedaran las dos firmas, PostgREST no sabría a cuál llamar
-- cuando el front manda solo p_community (ambiguo). Se reemplaza por una sola con p_hours opcional.
drop function if exists regenerate_invite(uuid);
create or replace function regenerate_invite(p_community uuid, p_hours int default null) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare code text := encode(gen_random_bytes(6), 'hex');
begin
  if not is_admin(p_community) then raise exception 'forbidden'; end if;
  if p_hours is not null and p_hours not between 1 and 8760 then raise exception 'bad_hours'; end if;
  update communities
    set invite_code = code,
        invite_expires_at = case when p_hours is null then null else now() + make_interval(hours => p_hours) end
    where id = p_community;
  return code;
end $$;
revoke execute on function regenerate_invite(uuid, int) from public, anon;
grant execute on function regenerate_invite(uuid, int) to authenticated;

-- Código inexistente: sin filas (el front dice "no es válido"). Código vencido: error 'expired'.
create or replace function invite_info(p_code text) returns table (name text, members bigint)
language plpgsql stable security definer set search_path = public as $$
declare c communities;
begin
  select * into c from communities where invite_code = p_code;
  if c.id is null then return; end if;
  if c.invite_expires_at is not null and c.invite_expires_at <= now() then raise exception 'expired'; end if;
  return query select c.name, (select count(*) from memberships mm where mm.community_id = c.id);
end $$;

create or replace function join_community(p_code text) returns communities
language plpgsql security definer set search_path = public as $$
declare c communities;
begin
  if me() is null then raise exception 'no_profile'; end if;
  select * into c from communities where invite_code = p_code;
  if c.id is null then raise exception 'invalid_code'; end if;
  if c.invite_expires_at is not null and c.invite_expires_at <= now() then raise exception 'expired'; end if;
  insert into memberships (community_id, profile_id) values (c.id, me()) on conflict do nothing;
  return c;
end $$;

-- ---------- 2) La lista se cierra sola al empezar el partido (sin cron) ----------
-- signup: la versión de 20261108000000_absences (bloquea suspendidos) + rechaza si el partido ya empezó.
create or replace function signup(p_match uuid) returns text
language plpgsql security definer set search_path = public as $$
declare m matches; taken int; st text;
begin
  select * into m from matches where id = p_match for update;
  if m.id is null or not is_member(m.community_id) then raise exception 'forbidden'; end if;
  if m.status <> 'open' or m.starts_at <= now() then raise exception 'closed'; end if;
  if exists (select 1 from suspensions where match_id = p_match and profile_id = me()) then raise exception 'suspended'; end if;
  select status into st from match_signups where match_id = p_match and profile_id = me();
  if st in ('in','waitlist') then return st; end if;
  select count(*) into taken from match_signups where match_id = p_match and status = 'in';
  st := case when taken < m.slots then 'in' else 'waitlist' end;
  insert into match_signups (match_id, profile_id, status) values (p_match, me(), st)
    on conflict (match_id, profile_id) do update set status = excluded.status, created_at = now(), team = null, absent = false;
  return st;
end $$;

-- leave_match: igual que antes, pero un jugador ya no puede bajarse después de que empezó
-- (los admins siguen pudiendo bajar o sacar a cualquiera).
create or replace function leave_match(p_match uuid, p_profile uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare m matches; target uuid := coalesce(p_profile, me()); nxt uuid;
begin
  select * into m from matches where id = p_match for update;
  if m.id is null or not is_member(m.community_id) then raise exception 'forbidden'; end if;
  if target <> me() and not is_admin(m.community_id) then raise exception 'forbidden'; end if;
  if m.status in ('played','cancelled') then raise exception 'closed'; end if;
  if m.starts_at <= now() and not is_admin(m.community_id) then raise exception 'already_started'; end if;
  update match_signups set status = 'out', team = null where match_id = p_match and profile_id = target;
  if (select count(*) from match_signups where match_id = p_match and status = 'in') < m.slots then
    select profile_id into nxt from match_signups where match_id = p_match and status = 'waitlist'
      order by created_at limit 1;
    if nxt is not null then
      update match_signups set status = 'in' where match_id = p_match and profile_id = nxt;
    end if;
  end if;
end $$;

-- ---------- 1) Editar un partido (solo admins; solo abierto o cerrado) ----------
-- Si suben los cupos, entran los primeros de la lista de espera (por orden de anotación).
-- Si bajan por debajo de los anotados, los últimos en anotarse pasan a la lista de espera
-- (y quedan primeros en ella, porque se anotaron antes que quienes ya esperaban).
create or replace function update_match(p_match uuid, p_title text, p_starts_at timestamptz, p_location text, p_slots int)
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

  update matches set title = ttl, starts_at = p_starts_at, location = loc, slots = p_slots where id = p_match;

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
revoke execute on function update_match(uuid, text, timestamptz, text, int) from public, anon;
grant execute on function update_match(uuid, text, timestamptz, text, int) to authenticated;

-- ---------- 3) Transferir ownership (atómico: una sola transacción) ----------
-- Solo el owner actual. El destino tiene que ser miembro con cuenta (no un perfil sin reclamar).
-- El owner queda como admin.
create or replace function transfer_ownership(p_community uuid, p_profile uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c communities;
begin
  select * into c from communities where id = p_community for update;
  if c.id is null or coalesce(role_in(p_community), '') <> 'owner' then raise exception 'forbidden'; end if;
  if p_profile is null or p_profile = me() then raise exception 'bad_target'; end if;
  if not exists (select 1 from memberships where community_id = p_community and profile_id = p_profile)
    then raise exception 'not_member'; end if;
  if not exists (select 1 from profiles where id = p_profile and user_id is not null)
    then raise exception 'bad_target'; end if;
  update memberships set role = 'admin' where community_id = p_community and profile_id = me();
  update memberships set role = 'owner' where community_id = p_community and profile_id = p_profile;
  update communities set owner_id = p_profile where id = p_community;
end $$;
revoke execute on function transfer_ownership(uuid, uuid) from public, anon;
grant execute on function transfer_ownership(uuid, uuid) to authenticated;

-- Que PostgREST vea las firmas nuevas enseguida
notify pgrst, 'reload schema';
