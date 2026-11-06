-- Historial de OVR por jugador y comunidad (una fila por día). Idempotente: se puede pegar en el SQL editor y correr más de una vez.
--
-- Cada vez que cambia un voto (alta, edición o baja) un trigger recalcula el OVR de ese jugador en esa comunidad,
-- con la misma cuenta que la vista community_ranking, y deja el valor en la fila de hoy. Si el OVR cambia varias veces
-- en el día queda el último. El "día" es el de Buenos Aires (la base corre en UTC y un voto a las 22 h caería en mañana).
-- Los clientes solo leen: nadie escribe esta tabla salvo el trigger.

create table if not exists ovr_history (
  community_id uuid not null references communities on delete cascade,
  profile_id uuid not null references profiles on delete cascade,
  day date not null,
  ovr int not null check (ovr between 1 and 99),
  n_votes int not null check (n_votes > 0),
  primary key (community_id, profile_id, day)
);

alter table ovr_history enable row level security;

drop policy if exists oh_read on ovr_history;
create policy oh_read on ovr_history for select using (is_member(community_id));
-- sin policies de insert/update/delete: con RLS activa eso las niega; el trigger corre como SECURITY DEFINER

revoke insert, update, delete on ovr_history from anon, authenticated;

-- Recalcula el OVR de (comunidad, jugador) y actualiza la fila de hoy. Sin votos: borra la de hoy (los días anteriores quedan).
create or replace function record_ovr(p_community uuid, p_profile uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_n int; v_ovr int; v_day date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  select count(*), round((avg(rit) + avg(tir) + avg(pas) + avg(reg) + avg(def) + avg(fis)) / 6)::int
    into v_n, v_ovr
    from stat_votes where community_id = p_community and target_id = p_profile;

  if v_n = 0 then
    delete from ovr_history where community_id = p_community and profile_id = p_profile and day = v_day;
  else
    -- el exists evita insertar contra una comunidad/perfil que se está borrando en cascada
    insert into ovr_history (community_id, profile_id, day, ovr, n_votes)
    select p_community, p_profile, v_day, v_ovr, v_n
    where exists (select 1 from communities where id = p_community)
      and exists (select 1 from profiles where id = p_profile)
    on conflict (community_id, profile_id, day) do update set ovr = excluded.ovr, n_votes = excluded.n_votes;
  end if;
end $$;
-- Función interna: que no quede expuesta como RPC
revoke execute on function record_ovr(uuid, uuid) from public, anon, authenticated;

create or replace function on_stat_vote_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform record_ovr(old.community_id, old.target_id);
  else
    perform record_ovr(new.community_id, new.target_id);
    -- un update puede mover el voto a otro jugador/comunidad: recalcular también el de origen
    if tg_op = 'UPDATE' and (old.community_id <> new.community_id or old.target_id <> new.target_id) then
      perform record_ovr(old.community_id, old.target_id);
    end if;
  end if;
  return null;
end $$;

drop trigger if exists stat_votes_ovr_history on stat_votes;
create trigger stat_votes_ovr_history after insert or update or delete on stat_votes
  for each row execute function on_stat_vote_change();

-- Primer punto: el OVR actual de todos los que ya tienen votos (de antes no hay forma de reconstruirlo)
insert into ovr_history (community_id, profile_id, day, ovr, n_votes)
select community_id, profile_id, (now() at time zone 'America/Argentina/Buenos_Aires')::date, ovr, n_votes
from community_ranking
on conflict (community_id, profile_id, day) do update set ovr = excluded.ovr, n_votes = excluded.n_votes;
