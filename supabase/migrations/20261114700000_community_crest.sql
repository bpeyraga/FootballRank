-- Escudo diseñado en la app ("Crear escudo"). Idempotente; no borra ni cambia datos existentes.
--
--   communities.crest   jsonb: el diseño (forma, colores, dibujo, símbolo, textos) para poder reeditarlo. Null si el escudo es una
--                       imagen subida o no hay. Lo escribe solo set_community_crest (directo por la API, communities solo deja
--                       editar name y slug). Tope de 2000 caracteres y tiene que ser un objeto.
--   Bucket communities  ya acepta PNG (image/jpeg, image/png, image/webp; 5 MB) y las políticas de storage cubren la carpeta
--                       <comunidad>/ para owner y admins (comm_up / comm_del): no se toca nada de storage.
--
-- Funciones: se leyeron con pg_get_functiondef el 2026-11-12 y coinciden con 20261112100000_community_logo.sql.
--   set_community_logo   mismas firma, permisos y chequeos (imagen <comunidad>/logo-<uuid>.jpg del bucket); ahora además deja
--                        crest en null: subir una imagen o quitar el escudo reemplaza al diseño, que ya no corresponde.
--   set_community_crest  nueva: owner o admin dejan como escudo un PNG <comunidad>/crest-<uuid>.png del bucket junto con su
--                        diseño. Con p_url null quita el escudo (y el diseño).
-- El front funciona sin esta migración: si set_community_crest no existe, sube el escudo como JPEG por set_community_logo
-- (se ve igual dentro de la forma de siempre, pero sin poder reeditar el diseño).

begin;

alter table communities add column if not exists crest jsonb;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.communities'::regclass and conname = 'communities_crest_check') then
    alter table communities add constraint communities_crest_check
      check (crest is null or (jsonb_typeof(crest) = 'object' and length(crest::text) <= 2000));
  end if;
end $$;

-- Igual que antes (solo imágenes del bucket de esa comunidad); además limpia el diseño guardado.
create or replace function set_community_logo(p_community uuid, p_url text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin(p_community) then raise exception 'forbidden'; end if;
  if p_url is not null and p_url !~ ('/storage/v1/object/public/communities/' || p_community::text || '/logo-[0-9a-f-]+\.jpg(\?v=\d+)?$')
    then raise exception 'bad_photo'; end if;
  update communities set logo_url = p_url, crest = null where id = p_community;
end $$;

-- Owner o admin dejan un escudo diseñado: el PNG del bucket y su diseño (objeto json chico). Con p_url null lo quitan.
create or replace function set_community_crest(p_community uuid, p_url text, p_design jsonb default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin(p_community) then raise exception 'forbidden'; end if;
  if p_url is null then
    update communities set logo_url = null, crest = null where id = p_community;
    return;
  end if;
  if p_url !~ ('/storage/v1/object/public/communities/' || p_community::text || '/crest-[0-9a-f-]+\.png(\?v=\d+)?$')
    then raise exception 'bad_crest'; end if;
  if p_design is not null and (jsonb_typeof(p_design) <> 'object' or length(p_design::text) > 2000)
    then raise exception 'bad_crest'; end if;
  update communities set logo_url = p_url, crest = p_design where id = p_community;
end $$;

-- Como el resto de las RPCs: sin sesión no se puede ni intentar
revoke execute on function set_community_crest(uuid, text, jsonb) from public, anon;
grant execute on function set_community_crest(uuid, text, jsonb) to authenticated, service_role;

commit;

-- Para que la API vea la función y la columna enseguida
notify pgrst, 'reload schema';
