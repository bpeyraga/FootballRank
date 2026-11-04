-- FootballRank v2: schema, RLS y RPCs
create extension if not exists pgcrypto;

-- ---------- Tablas ----------
create table profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users on delete set null, -- null = placeholder sin reclamar
  name text not null check (length(name) between 1 and 40),
  pos text not null default 'MED' check (pos in ('ARQ','DEF','MED','DEL')),
  photo_url text,
  onboarded boolean not null default false,
  created_at timestamptz not null default now()
);

create table base_stats (
  profile_id uuid primary key references profiles on delete cascade,
  rit int not null check (rit between 1 and 99),
  tir int not null check (tir between 1 and 99),
  pas int not null check (pas between 1 and 99),
  reg int not null check (reg between 1 and 99),
  def int not null check (def between 1 and 99),
  fis int not null check (fis between 1 and 99),
  updated_at timestamptz not null default now()
);

create table communities (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 60),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  invite_code text not null unique default encode(gen_random_bytes(6), 'hex'),
  owner_id uuid not null references profiles,
  created_at timestamptz not null default now()
);

create table memberships (
  community_id uuid references communities on delete cascade,
  profile_id uuid references profiles on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  joined_at timestamptz not null default now(),
  primary key (community_id, profile_id)
);

create table stat_votes (
  community_id uuid references communities on delete cascade,
  voter_id uuid references profiles on delete cascade,
  target_id uuid references profiles on delete cascade,
  rit int not null check (rit between 1 and 99),
  tir int not null check (tir between 1 and 99),
  pas int not null check (pas between 1 and 99),
  reg int not null check (reg between 1 and 99),
  def int not null check (def between 1 and 99),
  fis int not null check (fis between 1 and 99),
  updated_at timestamptz not null default now(),
  primary key (community_id, voter_id, target_id)
);

create table custom_stats (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities on delete cascade,
  target_id uuid not null references profiles on delete cascade,
  created_by uuid not null references profiles on delete cascade,
  label text not null check (length(label) between 1 and 24),
  value int not null check (value between 1 and 99),
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  unique (community_id, target_id, created_by, label)
);

create table matches (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities on delete cascade,
  title text not null check (length(title) between 1 and 80),
  starts_at timestamptz not null,
  location text,
  slots int not null check (slots between 2 and 40),
  status text not null default 'open' check (status in ('open','closed','played','cancelled')),
  score_a int check (score_a >= 0),
  score_b int check (score_b >= 0),
  result_by uuid references profiles,
  created_by uuid not null references profiles,
  created_at timestamptz not null default now()
);

create table match_signups (
  match_id uuid references matches on delete cascade,
  profile_id uuid references profiles on delete cascade,
  status text not null check (status in ('in','waitlist','out')),
  team text check (team in ('A','B')),
  created_at timestamptz not null default now(),
  primary key (match_id, profile_id)
);

create table match_ratings (
  match_id uuid references matches on delete cascade,
  rater_id uuid references profiles on delete cascade,
  target_id uuid references profiles on delete cascade,
  score int not null check (score between 1 and 10),
  primary key (match_id, rater_id, target_id),
  check (rater_id <> target_id)
);

-- Pedidos de "soy yo" sobre perfiles migrados
create table claims (
  placeholder_id uuid references profiles on delete cascade,
  claimant_id uuid references profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (placeholder_id, claimant_id)
);

-- ---------- Helpers ----------
create function me() returns uuid language sql stable security definer set search_path = public as $$
  select id from profiles where user_id = auth.uid()
$$;

create function role_in(c uuid) returns text language sql stable security definer set search_path = public as $$
  select role from memberships where community_id = c and profile_id = me()
$$;

create function is_member(c uuid) returns boolean language sql stable as $$ select role_in(c) is not null $$;
create function is_admin(c uuid) returns boolean language sql stable as $$ select role_in(c) in ('owner','admin') $$;

create function shares_community(p uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships a join memberships b using (community_id)
                 where a.profile_id = me() and b.profile_id = p)
$$;

-- Al crear un usuario de auth se crea su perfil
create function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (user_id, name, photo_url)
  values (new.id,
          left(coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)), 40),
          new.raw_user_meta_data->>'avatar_url');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- ---------- RLS ----------
alter table profiles enable row level security;
alter table base_stats enable row level security;
alter table communities enable row level security;
alter table memberships enable row level security;
alter table stat_votes enable row level security;
alter table custom_stats enable row level security;
alter table matches enable row level security;
alter table match_signups enable row level security;
alter table match_ratings enable row level security;
alter table claims enable row level security;

create policy p_read on profiles for select using (id = me() or shares_community(id));
create policy p_upd on profiles for update using (id = me()) with check (id = me() and user_id = auth.uid());

create policy bs_read on base_stats for select using (profile_id = me() or shares_community(profile_id));
create policy bs_ins on base_stats for insert with check (profile_id = me());
create policy bs_upd on base_stats for update using (profile_id = me());

create policy c_read on communities for select using (is_member(id));
create policy c_upd on communities for update using (role_in(id) = 'owner');
create policy c_del on communities for delete using (role_in(id) = 'owner');
-- insert solo vía RPC create_community

create policy m_read on memberships for select using (is_member(community_id));
create policy m_leave on memberships for delete using (profile_id = me() and role <> 'owner');
create policy m_kick on memberships for delete using (is_admin(community_id) and role = 'member');
-- cambios de rol vía RPC set_role

create policy sv_read on stat_votes for select using (is_member(community_id));
create policy sv_ins on stat_votes for insert with check (voter_id = me() and is_member(community_id) and shares_community(target_id));
create policy sv_upd on stat_votes for update using (voter_id = me());
create policy sv_del on stat_votes for delete using (voter_id = me() or is_admin(community_id));

create policy cs_read on custom_stats for select using (is_member(community_id));
create policy cs_ins on custom_stats for insert with check (created_by = me() and is_member(community_id) and shares_community(target_id));
create policy cs_upd on custom_stats for update using (created_by = me() or target_id = me() or is_admin(community_id));
create policy cs_del on custom_stats for delete using (created_by = me() or is_admin(community_id));

create policy mt_read on matches for select using (is_member(community_id));
create policy mt_ins on matches for insert with check (is_admin(community_id) and created_by = me());
create policy mt_upd on matches for update using (is_admin(community_id));
create policy mt_del on matches for delete using (is_admin(community_id));
-- resultado por cualquier miembro vía RPC set_result

create policy ms_read on match_signups for select
  using (exists (select 1 from matches m where m.id = match_id and is_member(m.community_id)));
create policy ms_team on match_signups for update
  using (exists (select 1 from matches m where m.id = match_id and is_admin(m.community_id)));
-- anotarse/bajarse vía RPC

create policy mr_read on match_ratings for select
  using (exists (select 1 from matches m where m.id = match_id and is_member(m.community_id)));
-- calificar vía RPC rate_teammates

create policy cl_read on claims for select using (claimant_id = me() or exists (
  select 1 from memberships m where m.profile_id = placeholder_id and role_in(m.community_id) = 'owner'));

-- ---------- RPCs ----------
create function create_community(p_name text, p_slug text) returns communities
language plpgsql security definer set search_path = public as $$
declare c communities;
begin
  if me() is null then raise exception 'no_profile'; end if;
  insert into communities (name, slug, owner_id) values (p_name, p_slug, me()) returning * into c;
  insert into memberships (community_id, profile_id, role) values (c.id, me(), 'owner');
  return c;
end $$;

create function join_community(p_code text) returns communities
language plpgsql security definer set search_path = public as $$
declare c communities;
begin
  if me() is null then raise exception 'no_profile'; end if;
  select * into c from communities where invite_code = p_code;
  if c.id is null then raise exception 'invalid_code'; end if;
  insert into memberships (community_id, profile_id) values (c.id, me()) on conflict do nothing;
  return c;
end $$;

-- Datos mínimos para mostrar la invitación antes de unirse
create function invite_info(p_code text) returns table (name text, members bigint)
language sql stable security definer set search_path = public as $$
  select c.name, (select count(*) from memberships m where m.community_id = c.id)
  from communities c where c.invite_code = p_code
$$;

create function regenerate_invite(p_community uuid) returns text
language plpgsql security definer set search_path = public as $$
declare code text := encode(gen_random_bytes(6), 'hex');
begin
  if not is_admin(p_community) then raise exception 'forbidden'; end if;
  update communities set invite_code = code where id = p_community;
  return code;
end $$;

create function set_role(p_community uuid, p_profile uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if role_in(p_community) <> 'owner' then raise exception 'forbidden'; end if;
  if p_role not in ('admin','member','owner') then raise exception 'bad_role'; end if;
  if p_role = 'owner' then -- transferir ownership
    update memberships set role = 'admin' where community_id = p_community and profile_id = me();
    update communities set owner_id = p_profile where id = p_community;
  end if;
  update memberships set role = p_role where community_id = p_community and profile_id = p_profile;
  if not found then raise exception 'not_member'; end if;
end $$;

-- Anotarse: entra si hay cupo, si no a lista de espera. Lock por partido.
create function signup(p_match uuid) returns text
language plpgsql security definer set search_path = public as $$
declare m matches; taken int; st text;
begin
  select * into m from matches where id = p_match for update;
  if m.id is null or not is_member(m.community_id) then raise exception 'forbidden'; end if;
  if m.status <> 'open' then raise exception 'closed'; end if;
  select status into st from match_signups where match_id = p_match and profile_id = me();
  if st in ('in','waitlist') then return st; end if;
  select count(*) into taken from match_signups where match_id = p_match and status = 'in';
  st := case when taken < m.slots then 'in' else 'waitlist' end;
  insert into match_signups (match_id, profile_id, status) values (p_match, me(), st)
    on conflict (match_id, profile_id) do update set status = excluded.status, created_at = now(), team = null;
  return st;
end $$;

-- Bajarse (propio) o sacar a alguien (admin). Sube el primero de la lista de espera.
create function leave_match(p_match uuid, p_profile uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare m matches; target uuid := coalesce(p_profile, me()); nxt uuid;
begin
  select * into m from matches where id = p_match for update;
  if m.id is null or not is_member(m.community_id) then raise exception 'forbidden'; end if;
  if target <> me() and not is_admin(m.community_id) then raise exception 'forbidden'; end if;
  if m.status in ('played','cancelled') then raise exception 'closed'; end if;
  update match_signups set status = 'out', team = null where match_id = p_match and profile_id = target;
  if (select count(*) from match_signups where match_id = p_match and status = 'in') < m.slots then
    select profile_id into nxt from match_signups where match_id = p_match and status = 'waitlist'
      order by created_at limit 1;
    if nxt is not null then
      update match_signups set status = 'in' where match_id = p_match and profile_id = nxt;
    end if;
  end if;
end $$;

-- Admin agrega a un miembro (incluye placeholders)
create function add_to_match(p_match uuid, p_profile uuid) returns text
language plpgsql security definer set search_path = public as $$
declare m matches; taken int; st text;
begin
  select * into m from matches where id = p_match for update;
  if m.id is null or not is_admin(m.community_id) then raise exception 'forbidden'; end if;
  if not exists (select 1 from memberships where community_id = m.community_id and profile_id = p_profile)
    then raise exception 'not_member'; end if;
  select count(*) into taken from match_signups where match_id = p_match and status = 'in' and profile_id <> p_profile;
  st := case when taken < m.slots then 'in' else 'waitlist' end;
  insert into match_signups (match_id, profile_id, status) values (p_match, p_profile, st)
    on conflict (match_id, profile_id) do update set status = excluded.status;
  return st;
end $$;

-- Cualquier miembro carga el resultado
create function set_result(p_match uuid, p_a int, p_b int) returns void
language plpgsql security definer set search_path = public as $$
declare m matches;
begin
  select * into m from matches where id = p_match for update;
  if m.id is null or not is_member(m.community_id) then raise exception 'forbidden'; end if;
  if m.status = 'cancelled' then raise exception 'cancelled'; end if;
  if m.starts_at > now() then raise exception 'not_started'; end if;
  update matches set score_a = p_a, score_b = p_b, result_by = me(), status = 'played' where id = p_match;
end $$;

-- Calificar compañeros: p_scores = {"<profile_id>": 7, ...}
create function rate_teammates(p_match uuid, p_scores jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare my_team text; k text; v int;
begin
  if (select status from matches where id = p_match) <> 'played' then raise exception 'not_played'; end if;
  select team into my_team from match_signups where match_id = p_match and profile_id = me() and status = 'in';
  if my_team is null then raise exception 'not_player'; end if;
  for k, v in select key, value::int from jsonb_each_text(p_scores) loop
    if k::uuid = me() then continue; end if;
    if not exists (select 1 from match_signups where match_id = p_match and profile_id = k::uuid
                   and status = 'in' and team = my_team) then raise exception 'not_teammate'; end if;
    insert into match_ratings (match_id, rater_id, target_id, score) values (p_match, me(), k::uuid, v)
      on conflict (match_id, rater_id, target_id) do update set score = excluded.score;
  end loop;
end $$;

-- Reclamar perfil migrado
create function request_claim(p_placeholder uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles where id = p_placeholder and user_id is null) then raise exception 'not_placeholder'; end if;
  if not shares_community(p_placeholder) then raise exception 'forbidden'; end if;
  insert into claims (placeholder_id, claimant_id) values (p_placeholder, me()) on conflict do nothing;
end $$;

-- El owner aprueba: el usuario hereda el placeholder (votos, foto, historial) y se borra su perfil vacío
create function approve_claim(p_placeholder uuid, p_claimant uuid) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not exists (select 1 from memberships m where m.profile_id = p_placeholder and role_in(m.community_id) = 'owner')
    then raise exception 'forbidden'; end if;
  if not exists (select 1 from claims where placeholder_id = p_placeholder and claimant_id = p_claimant)
    then raise exception 'no_claim'; end if;
  select user_id into uid from profiles where id = p_claimant;
  -- membresías del claimant pasan al placeholder
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
  update profiles set user_id = null where id = p_claimant;
  update profiles p set user_id = uid, onboarded = true,
    photo_url = coalesce(p.photo_url, c.photo_url)
    from profiles c where p.id = p_placeholder and c.id = p_claimant;
  delete from profiles where id = p_claimant;
  delete from claims where placeholder_id = p_placeholder;
end $$;

-- ---------- Vistas de agregados ----------
create view community_ranking with (security_invoker = true) as
  select community_id, target_id as profile_id, count(*) as n_votes,
    round(avg(rit))::int rit, round(avg(tir))::int tir, round(avg(pas))::int pas,
    round(avg(reg))::int reg, round(avg(def))::int def, round(avg(fis))::int fis,
    round((avg(rit)+avg(tir)+avg(pas)+avg(reg)+avg(def)+avg(fis))/6)::int ovr
  from stat_votes group by community_id, target_id;

create view match_scores with (security_invoker = true) as
  select r.match_id, r.target_id as profile_id, round(avg(r.score), 1) as avg_score, count(*) n
  from match_ratings r group by r.match_id, r.target_id;

-- ---------- Storage ----------
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true) on conflict do nothing;
create policy av_write on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = me()::text);
create policy av_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = me()::text);
