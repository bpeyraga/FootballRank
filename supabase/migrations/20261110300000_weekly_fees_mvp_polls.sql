-- Tanda 2: partido fijo semanal, cuotas de la cancha, figura del partido y encuestas en el chat.
-- Idempotente; solo agrega tablas/columnas/funciones. No borra datos.

-- =========================================================================================
-- 1) Partido fijo semanal: la convocatoria se crea sola N días antes (y dispara el aviso push).
-- =========================================================================================
create table if not exists match_schedules (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),           -- 0 = domingo (extract dow)
  at_time time not null,
  tz text not null default 'America/Argentina/Buenos_Aires',
  title text not null default 'Partido' check (length(trim(title)) between 1 and 80),
  venue_id uuid references venues on delete set null,
  location text check (location is null or length(location) <= 200),
  slots int not null default 10 check (slots between 2 and 40),
  fee_total numeric(10,2) check (fee_total is null or fee_total between 0 and 10000000),
  open_days_before smallint not null default 6 check (open_days_before between 0 and 13),
  active boolean not null default true,
  created_by uuid references profiles on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists match_schedules_community on match_schedules (community_id);
alter table match_schedules enable row level security;
drop policy if exists sch_read on match_schedules;
create policy sch_read on match_schedules for select using (is_member(community_id));
drop policy if exists sch_ins on match_schedules;
create policy sch_ins on match_schedules for insert with check (
  is_admin(community_id) and created_by = me()
  and (venue_id is null or exists (select 1 from venues v where v.id = venue_id and v.community_id = match_schedules.community_id)));
drop policy if exists sch_upd on match_schedules;
create policy sch_upd on match_schedules for update using (is_admin(community_id)) with check (
  is_admin(community_id)
  and (venue_id is null or exists (select 1 from venues v where v.id = venue_id and v.community_id = match_schedules.community_id)));
drop policy if exists sch_del on match_schedules;
create policy sch_del on match_schedules for delete using (is_admin(community_id));

alter table matches add column if not exists schedule_id uuid references match_schedules on delete set null;
-- Una sola convocatoria por fecha de cada horario fijo (aunque después la cancelen, no se recrea).
create unique index if not exists matches_schedule_once on matches (schedule_id, starts_at) where schedule_id is not null;

-- Crea las convocatorias que tocan (todas, o solo las de un horario). Lo llama el reloj y el guardado.
create or replace function create_scheduled_matches(p_only uuid default null) returns int
language plpgsql security definer set search_path = public as $$
declare s match_schedules; today date; nd date; ts timestamptz; k int := 0; owner uuid;
begin
  for s in select * from match_schedules where active and (p_only is null or id = p_only) loop
    today := (now() at time zone s.tz)::date;
    nd := today + ((s.weekday - extract(dow from today)::int + 7) % 7);
    ts := (nd + s.at_time) at time zone s.tz;
    if ts <= now() then nd := nd + 7; ts := (nd + s.at_time) at time zone s.tz; end if;
    continue when nd - s.open_days_before > today;
    -- Si un admin ya creó a mano un partido ese mismo día y hora, no se duplica.
    continue when exists (select 1 from matches where community_id = s.community_id and starts_at = ts and status <> 'cancelled');
    select owner_id into owner from communities where id = s.community_id;
    insert into matches (community_id, title, starts_at, location, venue_id, slots, fee_total, schedule_id, created_by)
      values (s.community_id, s.title, ts,
              coalesce(s.location, (select name from venues where id = s.venue_id)),
              s.venue_id, s.slots, s.fee_total, s.id, coalesce(s.created_by, owner))
      on conflict (schedule_id, starts_at) where schedule_id is not null do nothing;
    if found then k := k + 1; end if;
  end loop;
  return k;
end $$;
revoke all on function create_scheduled_matches(uuid) from public, anon, authenticated;

-- Al guardar/activar un horario, crear ya la convocatoria si corresponde.
create or replace function on_schedule_saved() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.active then perform create_scheduled_matches(new.id); end if;
  return null;
end $$;
drop trigger if exists schedule_saved on match_schedules;
create trigger schedule_saved after insert or update on match_schedules for each row execute function on_schedule_saved();

select cron.schedule('weekly-matches', '7 * * * *', 'select public.create_scheduled_matches()');

-- =========================================================================================
-- 2) Cuotas de la cancha: costo total del partido, cada uno marca "pagué".
-- =========================================================================================
alter table matches add column if not exists fee_total numeric(10,2);
do $$ begin
  alter table matches add constraint matches_fee_check check (fee_total is null or fee_total between 0 and 10000000);
exception when duplicate_object then null; end $$;
alter table matches add column if not exists fee_reminded_at timestamptz;
alter table match_signups add column if not exists paid_at timestamptz;

-- Costo total del partido (admins). null = sin cuota.
create or replace function set_fee(p_match uuid, p_total numeric) returns void
language plpgsql security definer set search_path = public as $$
declare m matches;
begin
  select * into m from matches where id = p_match;
  if m.id is null or not is_admin(m.community_id) then raise exception 'forbidden'; end if;
  if p_total is not null and (p_total < 0 or p_total > 10000000) then raise exception 'bad_fee'; end if;
  update matches set fee_total = nullif(p_total, 0) where id = p_match;
end $$;
grant execute on function set_fee(uuid, numeric) to authenticated;

-- Marcar/desmarcar pago: cada uno el suyo; los admins el de cualquiera.
create or replace function set_paid(p_match uuid, p_profile uuid, p_paid boolean) returns void
language plpgsql security definer set search_path = public as $$
declare m matches;
begin
  select * into m from matches where id = p_match;
  if m.id is null or not is_member(m.community_id) then raise exception 'forbidden'; end if;
  if p_profile <> me() and not is_admin(m.community_id) then raise exception 'forbidden'; end if;
  update match_signups set paid_at = case when p_paid then coalesce(paid_at, now()) end
    where match_id = p_match and profile_id = p_profile and status = 'in';
  if not found then raise exception 'not_player'; end if;
end $$;
grant execute on function set_paid(uuid, uuid, boolean) to authenticated;

-- =========================================================================================
-- 3) Figura del partido: cada jugador vota a uno (no a sí mismo) hasta 7 días después.
-- =========================================================================================
create table if not exists mvp_votes (
  match_id uuid not null references matches on delete cascade,
  voter_id uuid not null references profiles on delete cascade,
  target_id uuid not null references profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (match_id, voter_id),
  check (voter_id <> target_id)
);
create index if not exists mvp_votes_target on mvp_votes (target_id);
alter table mvp_votes enable row level security;
-- El voto de cada uno es secreto: solo ves el tuyo; los totales salen de match_mvp / community_mvps.
drop policy if exists mvp_read on mvp_votes;
create policy mvp_read on mvp_votes for select using (voter_id = me());

create or replace function vote_mvp(p_match uuid, p_target uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m matches;
begin
  select * into m from matches where id = p_match;
  if m.id is null or not is_member(m.community_id) then raise exception 'forbidden'; end if;
  if m.status <> 'played' then raise exception 'not_played'; end if;
  if m.starts_at < now() - interval '7 days' then raise exception 'mvp_closed'; end if;
  if p_target = me() then raise exception 'self_vote'; end if;
  if not exists (select 1 from match_signups where match_id = p_match and profile_id = me() and status = 'in' and not absent)
    then raise exception 'not_player'; end if;
  if not exists (select 1 from match_signups where match_id = p_match and profile_id = p_target and status = 'in' and not absent)
    then raise exception 'bad_target'; end if;
  insert into mvp_votes (match_id, voter_id, target_id) values (p_match, me(), p_target)
    on conflict (match_id, voter_id) do update set target_id = excluded.target_id, created_at = now();
end $$;
grant execute on function vote_mvp(uuid, uuid) to authenticated;

-- Votos por jugador en un partido.
create or replace function match_mvp(p_match uuid) returns table (profile_id uuid, votes int)
language sql stable security definer set search_path = public as $$
  select v.target_id, count(*)::int from mvp_votes v join matches m on m.id = v.match_id
  where v.match_id = p_match and is_member(m.community_id)
  group by v.target_id order by 2 desc
$$;
grant execute on function match_mvp(uuid) to authenticated;

-- Veces figura por jugador en la comunidad (empate en votos = figura los dos).
create or replace function community_mvps(p_community uuid) returns table (profile_id uuid, times int)
language sql stable security definer set search_path = public as $$
  with t as (
    select v.match_id, v.target_id, count(*) n from mvp_votes v join matches m on m.id = v.match_id
    where m.community_id = p_community and m.status = 'played' group by 1, 2
  ), top as (
    select match_id, target_id from (select *, rank() over (partition by match_id order by n desc) r from t) x where r = 1
  )
  select target_id, count(*)::int from top where is_member(p_community) group by 1 order by 2 desc
$$;
grant execute on function community_mvps(uuid) to authenticated;

-- =========================================================================================
-- 4) Encuestas en el chat: un mensaje con su encuesta adjunta.
-- =========================================================================================
create table if not exists polls (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities on delete cascade,
  message_id bigint not null references messages on delete cascade,
  question text not null check (length(trim(question)) between 1 and 140),
  options text[] not null check (array_length(options, 1) between 2 and 8),
  multi boolean not null default false,
  created_by uuid references profiles on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists polls_message on polls (message_id);
create table if not exists poll_votes (
  poll_id uuid not null references polls on delete cascade,
  profile_id uuid not null references profiles on delete cascade,
  option smallint not null check (option between 0 and 7),
  community_id uuid not null references communities on delete cascade,
  created_at timestamptz not null default now(),
  primary key (poll_id, profile_id, option)
);
alter table polls enable row level security;
alter table poll_votes enable row level security;
drop policy if exists poll_read on polls;
create policy poll_read on polls for select using (is_member(community_id));
drop policy if exists pv_read on poll_votes;
create policy pv_read on poll_votes for select using (is_member(community_id));

create or replace function create_poll(p_community uuid, p_question text, p_options text[], p_multi boolean default false)
returns bigint language plpgsql security definer set search_path = public as $$
declare mid bigint; opts text[];
begin
  if not is_member(p_community) then raise exception 'forbidden'; end if;
  select array_agg(btrim(o)) into opts from unnest(p_options) o where btrim(o) <> '';
  if coalesce(array_length(opts, 1), 0) not between 2 and 8 or exists (select 1 from unnest(opts) o where length(o) > 60)
    then raise exception 'bad_options'; end if;
  if length(btrim(coalesce(p_question, ''))) not between 1 and 140 then raise exception 'bad_question'; end if;
  insert into messages (community_id, author_id, body) values (p_community, me(), '📊 ' || btrim(p_question))
    returning id into mid;
  insert into polls (community_id, message_id, question, options, multi, created_by)
    values (p_community, mid, btrim(p_question), opts, coalesce(p_multi, false), me());
  return mid;
end $$;
grant execute on function create_poll(uuid, text, text[], boolean) to authenticated;

-- Reemplaza los votos de uno en la encuesta (array vacío = sacar el voto).
create or replace function vote_poll(p_poll uuid, p_options smallint[]) returns void
language plpgsql security definer set search_path = public as $$
declare p polls;
begin
  select * into p from polls where id = p_poll;
  if p.id is null or not is_member(p.community_id) then raise exception 'forbidden'; end if;
  if exists (select 1 from unnest(coalesce(p_options, '{}')) o where o < 0 or o >= array_length(p.options, 1))
    then raise exception 'bad_option'; end if;
  if not p.multi and coalesce(array_length(p_options, 1), 0) > 1 then raise exception 'single_choice'; end if;
  delete from poll_votes where poll_id = p_poll and profile_id = me();
  insert into poll_votes (poll_id, profile_id, option, community_id)
    select distinct p_poll, me(), o, p.community_id from unnest(coalesce(p_options, '{}')) o;
end $$;
grant execute on function vote_poll(uuid, smallint[]) to authenticated;

do $$ begin
  alter publication supabase_realtime add table poll_votes;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table polls;
exception when duplicate_object then null; end $$;

-- =========================================================================================
-- 5) Avisos: "votá la figura" al cargar el resultado, y recordatorio de pago al día siguiente.
-- =========================================================================================
create or replace function push_on_played() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'played' and old.status is distinct from 'played' and new.starts_at > now() - interval '2 days' then
    perform push_call(jsonb_build_object('type', 'mvp', 'match_id', new.id));
  end if;
  return null;
end $$;
drop trigger if exists push_match_played on matches;
create trigger push_match_played after update of status on matches for each row execute function push_on_played();

-- Reloj: igual que antes + recordatorio de pago (12 h después del partido, una sola vez).
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
  for r in update matches m set fee_reminded_at = now()
      where m.fee_reminded_at is null and m.fee_total > 0 and m.status = 'played'
        and m.starts_at < now() - interval '12 hours' and m.starts_at > now() - interval '7 days'
        and exists (select 1 from match_signups s where s.match_id = m.id and s.status = 'in' and not s.absent and s.paid_at is null)
      returning m.id loop
    perform push_call(jsonb_build_object('type', 'fee', 'match_id', r.id));
  end loop;
end $$;
revoke all on function push_tick() from public, anon, authenticated;

-- =========================================================================================
-- 6) approve_claim: la versión viva (20261108300000_review_fixes) + figura y encuestas.
-- =========================================================================================
create or replace function approve_claim(p_placeholder uuid, p_claimant uuid) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not exists (select 1 from memberships m where m.profile_id = p_placeholder and role_in(m.community_id) = 'owner')
    then raise exception 'forbidden'; end if;
  if not exists (select 1 from claims where placeholder_id = p_placeholder and claimant_id = p_claimant)
    then raise exception 'no_claim'; end if;
  select user_id into uid from profiles where id = p_claimant;
  insert into memberships (community_id, profile_id, role, joined_at)
    select community_id, p_placeholder, role, joined_at from memberships where profile_id = p_claimant
    on conflict (community_id, profile_id) do update set role =
      case when excluded.role = 'owner' or memberships.role = 'owner' then 'owner'
           when excluded.role = 'admin' or memberships.role = 'admin' then 'admin' else 'member' end;
  update communities set owner_id = p_placeholder where owner_id = p_claimant;
  update matches set created_by = p_placeholder where created_by = p_claimant;
  update matches set result_by = p_placeholder where result_by = p_claimant;
  insert into base_stats select p_placeholder, rit, tir, pas, reg, def, fis, now() from base_stats
    where profile_id = p_claimant on conflict (profile_id) do nothing;

  update messages set author_id = p_placeholder where author_id = p_claimant;
  delete from message_reactions r where r.profile_id = p_claimant
    and exists (select 1 from message_reactions x where x.message_id = r.message_id and x.profile_id = p_placeholder);
  update message_reactions set profile_id = p_placeholder where profile_id = p_claimant;
  update match_events set profile_id = p_placeholder where profile_id = p_claimant;
  update match_events set created_by = p_placeholder where created_by = p_claimant;
  delete from suspensions s where s.profile_id = p_claimant and s.match_id is null
    and exists (select 1 from suspensions x where x.profile_id = p_placeholder
                and x.community_id = s.community_id and x.match_id is null);
  update suspensions set profile_id = p_placeholder where profile_id = p_claimant;
  update suspensions set created_by = p_placeholder where created_by = p_claimant;

  -- Figura: si los dos votaron en el mismo partido queda el voto del perfil reclamado; votos a sí mismo se descartan.
  delete from mvp_votes v where v.voter_id = p_claimant
    and (v.target_id = p_placeholder
         or exists (select 1 from mvp_votes x where x.match_id = v.match_id and x.voter_id = p_placeholder));
  update mvp_votes set voter_id = p_placeholder where voter_id = p_claimant;
  delete from mvp_votes v where v.target_id = p_claimant and v.voter_id = p_placeholder;
  update mvp_votes set target_id = p_placeholder where target_id = p_claimant;
  -- Encuestas
  delete from poll_votes v where v.profile_id = p_claimant
    and exists (select 1 from poll_votes x where x.poll_id = v.poll_id and x.profile_id = p_placeholder);
  update poll_votes set profile_id = p_placeholder where profile_id = p_claimant;
  update polls set created_by = p_placeholder where created_by = p_claimant;
  update match_schedules set created_by = p_placeholder where created_by = p_claimant;

  update profiles set user_id = null where id = p_claimant;
  update profiles p set user_id = uid, onboarded = true,
    photo_url = coalesce(p.photo_url, c.photo_url),
    nickname = coalesce(p.nickname, c.nickname),
    shirt_number = coalesce(p.shirt_number, c.shirt_number),
    fav_team = coalesce(p.fav_team, c.fav_team)
    from profiles c where p.id = p_placeholder and c.id = p_claimant;
  delete from profiles where id = p_claimant;
  delete from claims where placeholder_id = p_placeholder;
end $$;
