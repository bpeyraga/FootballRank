-- Imagen del escudo de la comunidad (va recortada dentro de la forma del escudo). Idempotente.
-- Usa el mismo bucket 'communities' que la portada: ruta <comunidad>/logo-<uuid>.jpg (las políticas de storage ya cubren la carpeta).

alter table communities add column if not exists logo_url text;

-- Owner o admin cambian (o quitan, con null) la imagen del escudo. Solo se aceptan imágenes del bucket de esa comunidad.
create or replace function set_community_logo(p_community uuid, p_url text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin(p_community) then raise exception 'forbidden'; end if;
  if p_url is not null and p_url !~ ('/storage/v1/object/public/communities/' || p_community::text || '/logo-[0-9a-f-]+\.jpg(\?v=\d+)?$')
    then raise exception 'bad_photo'; end if;
  update communities set logo_url = p_url where id = p_community;
end $$;

grant execute on function set_community_logo(uuid, text) to authenticated;
