-- Foto grupal de la comunidad. Idempotente: se puede pegar en el SQL editor y correr más de una vez.

alter table communities add column if not exists photo_url text;

-- Bucket público; ruta: <comunidad>/<uuid>.jpg. Solo owner/admin de esa comunidad suben o borran.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('communities', 'communities', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists comm_up on storage.objects;
create policy comm_up on storage.objects for insert to authenticated with check (
  bucket_id = 'communities' and public.is_admin(((storage.foldername(name))[1])::uuid)
);
drop policy if exists comm_del on storage.objects;
create policy comm_del on storage.objects for delete to authenticated using (
  bucket_id = 'communities' and public.is_admin(((storage.foldername(name))[1])::uuid)
);

-- Owner o admin cambian (o quitan, con null) la foto. Solo se aceptan fotos del bucket de esa comunidad.
create or replace function set_community_photo(p_community uuid, p_url text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin(p_community) then raise exception 'forbidden'; end if;
  if p_url is not null and p_url !~ ('/storage/v1/object/public/communities/' || p_community::text || '/[0-9a-f-]+\.jpg(\?v=\d+)?$')
    then raise exception 'bad_photo'; end if;
  update communities set photo_url = p_url where id = p_community;
end $$;

grant execute on function set_community_photo(uuid, text) to authenticated;
