-- Capitán por equipo en cada partido. Idempotente: se puede pegar en el SQL editor y correr más de una vez.

alter table match_signups add column if not exists captain boolean not null default false;

-- Un solo capitán por equipo y partido
create unique index if not exists match_signups_one_captain
  on match_signups (match_id, team) where captain and team is not null;

-- Elige (o saca, con p_on = false) al capitán de su equipo. Puede un admin o un jugador de ese mismo equipo.
create or replace function set_captain(p_match uuid, p_profile uuid, p_on boolean default true) returns void
language plpgsql security definer set search_path = public as $$
declare t text; c uuid;
begin
  select m.community_id into c from matches m where m.id = p_match;
  if c is null then raise exception 'no_match'; end if;
  select team into t from match_signups
    where match_id = p_match and profile_id = p_profile and status = 'in';
  if t is null then raise exception 'no_team'; end if;
  if not is_admin(c) and not exists (
    select 1 from match_signups where match_id = p_match and profile_id = me() and status = 'in' and team = t)
    then raise exception 'forbidden'; end if;
  update match_signups set captain = false where match_id = p_match and team = t and captain;
  if p_on then
    update match_signups set captain = true where match_id = p_match and profile_id = p_profile;
  end if;
end $$;

grant execute on function set_captain(uuid, uuid, boolean) to authenticated;
