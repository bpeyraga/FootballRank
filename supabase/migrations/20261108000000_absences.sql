-- Ausencias y suspensiones.
-- * Cualquier miembro marca a un anotado como ausente (no se presentó), una vez empezado el partido.
--   Bajarse en la app nunca cuenta como falta.
-- * Un admin decide suspender a alguien: queda afuera del próximo partido de la comunidad
--   (si ya estaba anotado, se lo baja y sube el primero de la lista de espera).
-- * Si ese partido se cancela, la suspensión pasa al siguiente.

-- ---------- Ausencias ----------
alter table match_signups add column if not exists absent boolean not null default false;

create or replace function set_absent(p_match uuid, p_profile uuid, p_absent boolean) returns void
language plpgsql security definer set search_path = public as $$
declare m matches;
begin
  select * into m from matches where id = p_match;
  if m.id is null or not is_member(m.community_id) then raise exception 'forbidden'; end if;
  if m.status = 'cancelled' then raise exception 'cancelled'; end if;
  if m.starts_at > now() then raise exception 'not_started'; end if;
  update match_signups set absent = p_absent where match_id = p_match and profile_id = p_profile and status = 'in';
  if not found then raise exception 'not_player'; end if;
  -- Un ausente no califica ni es calificado en ese partido
  if p_absent then
    delete from match_ratings where match_id = p_match and (rater_id = p_profile or target_id = p_profile);
  end if;
end $$;

-- Calificar: igual que antes, pero ni el que califica ni el calificado pueden estar ausentes
create or replace function rate_teammates(p_match uuid, p_scores jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare my_team text; k text; v int;
begin
  if (select status from matches where id = p_match) <> 'played' then raise exception 'not_played'; end if;
  select team into my_team from match_signups
    where match_id = p_match and profile_id = me() and status = 'in' and not absent;
  if my_team is null then raise exception 'not_player'; end if;
  for k, v in select key, value::int from jsonb_each_text(p_scores) loop
    if k::uuid = me() then continue; end if;
    if not exists (select 1 from match_signups where match_id = p_match and profile_id = k::uuid
                   and status = 'in' and team = my_team and not absent) then raise exception 'not_teammate'; end if;
    insert into match_ratings (match_id, rater_id, target_id, score) values (p_match, me(), k::uuid, v)
      on conflict (match_id, rater_id, target_id) do update set score = excluded.score;
  end loop;
end $$;

-- ---------- Suspensiones ----------
create table if not exists suspensions (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities on delete cascade,
  profile_id uuid not null references profiles on delete cascade,
  match_id uuid references matches on delete set null, -- partido que se pierde; null = el próximo que se cree
  reason text check (reason is null or length(reason) <= 120),
  created_by uuid not null references profiles,
  created_at timestamptz not null default now()
);
create index if not exists suspensions_match_idx on suspensions (match_id);
create unique index if not exists suspensions_one_pending on suspensions (community_id, profile_id) where match_id is null;

alter table suspensions enable row level security;
drop policy if exists su_read on suspensions;
create policy su_read on suspensions for select using (is_member(community_id));
drop policy if exists su_del on suspensions;
create policy su_del on suspensions for delete using (is_admin(community_id)); -- levantar suspensión
-- crear vía RPC suspend

-- Próximo partido jugable de la comunidad (excluyendo uno, p. ej. el que se cancela)
create or replace function next_match(p_community uuid, p_except uuid default null) returns uuid
language sql stable security definer set search_path = public as $$
  select id from matches
  where community_id = p_community and status in ('open','closed') and starts_at > now()
    and id is distinct from p_except
  order by starts_at limit 1
$$;

-- Baja a alguien de un partido y sube al primero de la espera (sin chequeos de permiso; uso interno)
create or replace function drop_from_match(p_match uuid, p_profile uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m matches; nxt uuid;
begin
  select * into m from matches where id = p_match for update;
  update match_signups set status = 'out', team = null
    where match_id = p_match and profile_id = p_profile and status in ('in','waitlist');
  if not found then return; end if;
  if (select count(*) from match_signups where match_id = p_match and status = 'in') < m.slots then
    select s.profile_id into nxt from match_signups s
      where s.match_id = p_match and s.status = 'waitlist'
        and not exists (select 1 from suspensions x where x.match_id = p_match and x.profile_id = s.profile_id)
      order by s.created_at limit 1;
    if nxt is not null then
      update match_signups set status = 'in' where match_id = p_match and profile_id = nxt;
    end if;
  end if;
end $$;
revoke execute on function drop_from_match(uuid, uuid) from public, anon, authenticated;

create or replace function suspend(p_community uuid, p_profile uuid, p_reason text default null) returns suspensions
language plpgsql security definer set search_path = public as $$
declare s suspensions; mid uuid;
begin
  if not is_admin(p_community) then raise exception 'forbidden'; end if;
  if not exists (select 1 from memberships where community_id = p_community and profile_id = p_profile)
    then raise exception 'not_member'; end if;
  mid := next_match(p_community);
  if exists (select 1 from suspensions where community_id = p_community and profile_id = p_profile
             and (match_id is null or match_id = mid)) then raise exception 'already_suspended'; end if;
  insert into suspensions (community_id, profile_id, match_id, reason, created_by)
    values (p_community, p_profile, mid, nullif(trim(p_reason), ''), me()) returning * into s;
  if mid is not null then perform drop_from_match(mid, p_profile); end if;
  return s;
end $$;

-- Al crear un partido, las suspensiones pendientes pasan a ese partido (si es el próximo)
create or replace function assign_pending_suspensions() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.id = next_match(new.community_id) then
    update suspensions set match_id = new.id where community_id = new.community_id and match_id is null;
  end if;
  return new;
end $$;
drop trigger if exists matches_assign_suspensions on matches;
create trigger matches_assign_suspensions after insert on matches
  for each row execute function assign_pending_suspensions();

-- Si se cancela el partido de la suspensión, pasa al siguiente (o queda pendiente)
create or replace function move_suspensions_on_cancel() returns trigger
language plpgsql security definer set search_path = public as $$
declare nxt uuid; r record;
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    nxt := next_match(new.community_id, new.id);
    for r in select * from suspensions where match_id = new.id loop
      if nxt is not null and exists (select 1 from suspensions where community_id = r.community_id
                                     and profile_id = r.profile_id and match_id = nxt) then
        delete from suspensions where id = r.id; -- ya tiene una para el siguiente
      elsif nxt is null and exists (select 1 from suspensions where community_id = r.community_id
                                    and profile_id = r.profile_id and match_id is null) then
        delete from suspensions where id = r.id;
      else
        update suspensions set match_id = nxt where id = r.id;
        if nxt is not null then perform drop_from_match(nxt, r.profile_id); end if;
      end if;
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists matches_move_suspensions on matches;
create trigger matches_move_suspensions after update of status on matches
  for each row execute function move_suspensions_on_cancel();

-- ---------- signup / add_to_match: bloquear suspendidos ----------
create or replace function signup(p_match uuid) returns text
language plpgsql security definer set search_path = public as $$
declare m matches; taken int; st text;
begin
  select * into m from matches where id = p_match for update;
  if m.id is null or not is_member(m.community_id) then raise exception 'forbidden'; end if;
  if m.status <> 'open' then raise exception 'closed'; end if;
  if exists (select 1 from suspensions where match_id = p_match and profile_id = me()) then raise exception 'suspended'; end if;
  select status into st from match_signups where match_id = p_match and profile_id = me();
  if st in ('in','waitlist') then return st; end if;
  select count(*) into taken from match_signups where match_id = p_match and status = 'in';
  st := case when taken < m.slots then 'in' else 'waitlist' end;
  insert into match_signups (match_id, profile_id, status) values (p_match, me(), st)
    on conflict (match_id, profile_id) do update set status = excluded.status, created_at = now(), team = null, absent = false;
  return st;
end $$;

create or replace function add_to_match(p_match uuid, p_profile uuid) returns text
language plpgsql security definer set search_path = public as $$
declare m matches; taken int; st text;
begin
  select * into m from matches where id = p_match for update;
  if m.id is null or not is_admin(m.community_id) then raise exception 'forbidden'; end if;
  if not exists (select 1 from memberships where community_id = m.community_id and profile_id = p_profile)
    then raise exception 'not_member'; end if;
  if exists (select 1 from suspensions where match_id = p_match and profile_id = p_profile) then raise exception 'suspended'; end if;
  select count(*) into taken from match_signups where match_id = p_match and status = 'in' and profile_id <> p_profile;
  st := case when taken < m.slots then 'in' else 'waitlist' end;
  insert into match_signups (match_id, profile_id, status) values (p_match, p_profile, st)
    on conflict (match_id, profile_id) do update set status = excluded.status, absent = false;
  return st;
end $$;

-- Promedios de notas sin contar ausentes
create or replace view match_scores with (security_invoker = true) as
  select r.match_id, r.target_id as profile_id, round(avg(r.score), 1) as avg_score, count(*) n
  from match_ratings r
  where not exists (select 1 from match_signups s where s.match_id = r.match_id and s.profile_id = r.target_id and s.absent)
  group by r.match_id, r.target_id;
