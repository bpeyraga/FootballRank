-- Apodo, número de camiseta favorito y equipo del que es hincha. Idempotente: se puede pegar en el SQL editor y correr más de una vez.

alter table profiles add column if not exists nickname text;
alter table profiles add column if not exists shirt_number smallint;

alter table profiles drop constraint if exists profiles_nickname_check;
alter table profiles add constraint profiles_nickname_check check (nickname is null or length(nickname) between 1 and 20);
alter table profiles drop constraint if exists profiles_shirt_number_check;
alter table profiles add constraint profiles_shirt_number_check check (shirt_number is null or shirt_number between 1 and 99);

-- approve_claim: el placeholder hereda apodo y número del claimant si no tenía
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

-- Equipo del que es hincha (texto libre acotado: la lista de equipos vive en el front y cambia por temporada)
alter table profiles add column if not exists fav_team text;
alter table profiles drop constraint if exists profiles_fav_team_check;
alter table profiles add constraint profiles_fav_team_check check (fav_team is null or length(fav_team) between 1 and 40);
