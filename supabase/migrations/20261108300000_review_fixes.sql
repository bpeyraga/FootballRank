-- Correcciones de la revisión (idempotente; no borra datos al aplicarse).

-- 1) Responder mensajes: en la política, `reply_to` sin calificar apuntaba a r.reply_to (la tabla
--    del subselect también tiene esa columna) y rechazaba TODAS las respuestas.
drop policy if exists msg_ins on messages;
create policy msg_ins on messages for insert with check (
  author_id = me() and is_member(community_id)
  and (messages.reply_to is null or exists (
    select 1 from messages r where r.id = messages.reply_to and r.community_id = messages.community_id))
);

-- 2) Fotos del chat: solo de la carpeta del autor en ESTA comunidad (no links a otros proyectos,
--    que servirían para registrar la IP de quien abre el chat). NOT VALID: no revisa filas viejas.
alter table messages drop constraint if exists messages_image_path_check;
alter table messages add constraint messages_image_path_check check (
  image_url is null
  or position('/storage/v1/object/public/chat/' || community_id::text || '/' || author_id::text || '/' in image_url) > 0
) not valid;

-- 3) Borrar la foto cuando un admin borra el mensaje de otro (el autor ya podía borrar las suyas).
drop policy if exists chat_del_admin on storage.objects;
create policy chat_del_admin on storage.objects for delete to authenticated using (
  bucket_id = 'chat' and public.is_admin(((storage.foldername(name))[1])::uuid)
);

-- 4) approve_claim: si los dos perfiles tienen una suspensión pendiente en la misma comunidad,
--    queda una sola (índice único suspensions_one_pending de 20261108000000_absences). Resto igual.
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
