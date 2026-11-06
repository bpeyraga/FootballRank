-- Tercer tiempo: cervezas por jugador en cada partido jugado.
-- Cualquier miembro de la comunidad carga las de cualquiera (es parte de la joda), solo para quienes jugaron.
create table if not exists match_beers (
  match_id uuid references matches on delete cascade,
  profile_id uuid references profiles on delete cascade,
  community_id uuid not null references communities on delete cascade,
  beers int not null check (beers between 0 and 99),
  updated_by uuid references profiles on delete set null,
  updated_at timestamptz not null default now(),
  primary key (match_id, profile_id)
);
create index if not exists match_beers_community on match_beers (community_id, profile_id);

alter table match_beers enable row level security;
drop policy if exists mb_read on match_beers;
create policy mb_read on match_beers for select using (is_member(community_id));
-- escritura solo vía set_beers

create or replace function set_beers(p_match uuid, p_profile uuid, p_beers int) returns void
language plpgsql security definer set search_path = public as $$
declare m matches;
begin
  select * into m from matches where id = p_match;
  if m.id is null or not is_member(m.community_id) then raise exception 'forbidden'; end if;
  if m.status <> 'played' then raise exception 'not_played'; end if;
  if p_beers < 0 or p_beers > 99 then raise exception 'bad_value'; end if;
  if not exists (select 1 from match_signups where match_id = p_match and profile_id = p_profile
                 and status = 'in' and not absent) then raise exception 'not_player'; end if;
  if p_beers = 0 then
    delete from match_beers where match_id = p_match and profile_id = p_profile;
  else
    insert into match_beers (match_id, profile_id, community_id, beers, updated_by)
      values (p_match, p_profile, m.community_id, p_beers, me())
      on conflict (match_id, profile_id) do update
        set beers = excluded.beers, updated_by = excluded.updated_by, updated_at = now();
  end if;
end $$;
revoke execute on function set_beers(uuid, uuid, int) from public, anon;
grant execute on function set_beers(uuid, uuid, int) to authenticated;
