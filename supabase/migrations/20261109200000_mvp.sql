-- MVP del partido. Idempotente: se puede pegar en el SQL editor y correr más de una vez.
-- Vota cada jugador que jugó (anotado, con equipo, no ausente) y puede elegir a cualquiera de los dos equipos, menos a sí mismo.

create table if not exists mvp_votes (
  match_id uuid not null references matches on delete cascade,
  voter_id uuid not null references profiles on delete cascade,
  target_id uuid not null references profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (match_id, voter_id),
  check (voter_id <> target_id)
);
create index if not exists mvp_votes_target_idx on mvp_votes (target_id);

alter table mvp_votes enable row level security;
-- Cada uno ve solo su propio voto; el conteo se ve con match_mvp (abajo). Se vota vía RPC.
drop policy if exists mvp_read on mvp_votes;
create policy mvp_read on mvp_votes for select using (voter_id = me());

-- Conteo por jugador. Vista con permisos del dueño (lee todos los votos) filtrada a las comunidades del que consulta.
drop view if exists match_mvp;
create view match_mvp as
  select v.match_id, v.target_id as profile_id, count(*)::int as votes
  from mvp_votes v join matches m on m.id = v.match_id
  where is_member(m.community_id)
  group by v.match_id, v.target_id;
grant select on match_mvp to authenticated;

create or replace function vote_mvp(p_match uuid, p_target uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if (select status from matches where id = p_match) is distinct from 'played' then raise exception 'not_played'; end if;
  if p_target = me() then raise exception 'self_vote'; end if;
  if not exists (select 1 from match_signups where match_id = p_match and profile_id = me()
                 and status = 'in' and team is not null and not absent) then raise exception 'not_player'; end if;
  if not exists (select 1 from match_signups where match_id = p_match and profile_id = p_target
                 and status = 'in' and team is not null and not absent) then raise exception 'not_in_match'; end if;
  insert into mvp_votes (match_id, voter_id, target_id) values (p_match, me(), p_target)
    on conflict (match_id, voter_id) do update set target_id = excluded.target_id, created_at = now();
end $$;

grant execute on function vote_mvp(uuid, uuid) to authenticated;
