-- Endurecimiento de permisos y consistencia de datos (idempotente)

-- 1) Votos: nadie se vota a sí mismo y un voto no se puede "mover" a otra comunidad/jugador al editarlo.
delete from stat_votes where voter_id = target_id;
do $$ begin
  alter table stat_votes add constraint stat_votes_no_self check (voter_id <> target_id);
exception when duplicate_object then null;
end $$;
drop policy if exists sv_upd on stat_votes;
create policy sv_upd on stat_votes for update using (voter_id = me())
  with check (voter_id = me() and is_member(community_id) and shares_community(target_id));

-- 2) Si alguien sale (o lo sacan) de una comunidad, libera su lugar en los partidos abiertos
--    y sube el primero de la lista de espera.
create or replace function on_membership_removed() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record; nxt uuid;
begin
  for r in
    select s.match_id, m.slots from match_signups s join matches m on m.id = s.match_id
    where s.profile_id = old.profile_id and m.community_id = old.community_id
      and m.status in ('open', 'closed') and s.status in ('in', 'waitlist')
  loop
    update match_signups set status = 'out', team = null
      where match_id = r.match_id and profile_id = old.profile_id;
    if (select count(*) from match_signups where match_id = r.match_id and status = 'in') < r.slots then
      select profile_id into nxt from match_signups
        where match_id = r.match_id and status = 'waitlist' order by created_at limit 1;
      if nxt is not null then
        update match_signups set status = 'in' where match_id = r.match_id and profile_id = nxt;
      end if;
    end if;
  end loop;
  return old;
end $$;
drop trigger if exists membership_removed on memberships;
create trigger membership_removed after delete on memberships
  for each row execute function on_membership_removed();

-- 3) Resultado: lo cargan y corrigen solo owner/admins de la comunidad.
create or replace function set_result(p_match uuid, p_a int, p_b int) returns void
language plpgsql security definer set search_path = public as $$
declare m matches;
begin
  select * into m from matches where id = p_match for update;
  if m.id is null or not is_admin(m.community_id) then raise exception 'forbidden'; end if;
  if m.status = 'cancelled' then raise exception 'cancelled'; end if;
  if m.starts_at > now() then raise exception 'not_started'; end if;
  if p_a is null or p_b is null or p_a not between 0 and 99 or p_b not between 0 and 99 then
    raise exception 'bad_score';
  end if;
  update matches set score_a = p_a, score_b = p_b, result_by = me(), status = 'played' where id = p_match;
end $$;

-- 4) Fotos de perfil: solo imágenes y hasta 5 MB (la app sube JPG recortado de ~50 KB).
update storage.buckets
  set file_size_limit = 5242880, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
  where id = 'avatars';
