-- Que el tutorial y el aviso de cookies no vuelvan a preguntar en cada dispositivo: se recuerdan en la cuenta.
-- 1) profiles.tour_seen_at: cuándo vio (o salteó) el tutorial. Solo se escribe con mark_tour_seen() (profiles tiene
--    UPDATE por columnas: no se amplía). 2) my_consent(): la última elección de cookies de la cuenta para una versión
--    del aviso (consent_log sigue sin policies: nadie lo lee por la API salvo por esta función, solo lo propio).
-- Idempotente; no borra ni cambia datos existentes.

begin;

alter table profiles add column if not exists tour_seen_at timestamptz;

-- Marca el tutorial como visto para quien llama; conserva la primera fecha.
create or replace function mark_tour_seen() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  update profiles set tour_seen_at = coalesce(tour_seen_at, now()) where user_id = auth.uid();
end $$;
revoke execute on function mark_tour_seen() from public, anon;
grant execute on function mark_tour_seen() to authenticated, service_role;

-- La última elección de cookies de esta cuenta para esa versión del aviso (0 filas si nunca eligió con sesión).
create or replace function my_consent(p_version int) returns table (consent_id uuid, choice text, version smallint, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.consent_id, c.choice, c.version, c.created_at
  from consent_log c
  where c.user_id = auth.uid() and auth.uid() is not null and c.version = p_version
  order by c.created_at desc, c.id desc
  limit 1
$$;
revoke execute on function my_consent(int) from public, anon;
grant execute on function my_consent(int) to authenticated, service_role;

commit;

notify pgrst, 'reload schema';
