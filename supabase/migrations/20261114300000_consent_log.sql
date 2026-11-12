-- Registro del consentimiento de cookies (aviso de la app): constancia de cada elección.
-- Guarda un id al azar de la elección (no es el id de visitas), qué eligió, la versión del aviso, la fecha y la cuenta
-- si había sesión. Nadie lo lee por la API (RLS sin policies); solo record_consent escribe. Idempotente; no toca datos.

begin;

create table if not exists consent_log (
  id bigint generated always as identity primary key,
  consent_id uuid not null,
  choice text not null check (choice in ('all', 'necessary')),
  version smallint not null check (version between 1 and 999),
  user_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists consent_log_consent_idx on consent_log (consent_id, created_at desc);
create index if not exists consent_log_user_idx on consent_log (user_id) where user_id is not null;
alter table consent_log enable row level security;
revoke all on consent_log from public, anon, authenticated;

-- La llama la app con o sin sesión. Tope suave: una misma elección no se registra más de 20 veces por día.
create or replace function record_consent(p_id uuid, p_choice text, p_version int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_id is null or p_choice not in ('all', 'necessary') or p_version is null or p_version not between 1 and 999 then
    raise exception 'bad_consent';
  end if;
  if (select count(*) from consent_log where consent_id = p_id and created_at > now() - interval '1 day') >= 20 then
    return;
  end if;
  insert into consent_log (consent_id, choice, version, user_id) values (p_id, p_choice, p_version::smallint, auth.uid());
end $$;
revoke execute on function record_consent(uuid, text, int) from public;
grant execute on function record_consent(uuid, text, int) to anon, authenticated, service_role;

commit;

notify pgrst, 'reload schema';
