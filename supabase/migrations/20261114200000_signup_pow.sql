-- Anti-bots en el registro con correo: prueba de trabajo propia (sin servicios externos ni cuentas en ningún lado).
--
-- 1) pow_challenge() (la puede llamar cualquiera, sin sesión): genera un número secreto al azar n ≤ maxnumber y devuelve
--    challenge = sha256(salt || n) firmado con una clave HMAC que vive en el Vault. El salt lleva el vencimiento (10 min).
-- 2) El navegador prueba números hasta encontrar n (uno o dos segundos) y lo manda en signUp, en options.data.pow.
-- 3) pow_guard, trigger BEFORE INSERT en auth.users: si la cuenta es de correo, exige una solución válida, no vencida y
--    no usada antes; si no, el alta falla ("Database error saving new user"). Siempre saca "pow" de los metadatos para
--    que no quede guardado. Las altas con Google no pasan por acá.
-- Si falta la clave en el Vault, el trigger deja pasar (no traba el registro). Idempotente; no toca datos existentes.
--
-- OJO, crear usuarios a mano (Dashboard "Add user" / "Invite", auth.admin.createUser): Supabase marca invitado o
-- confirmado DESPUÉS de insertar, así que el trigger no los distingue de un registro común y los frena. Para eso:
--   alter table auth.users disable trigger pow_guard;  -- crear el usuario --  alter table auth.users enable trigger pow_guard;
-- Orden de deploy: primero el front (manda la solución; sin esta migración sigue andando igual), después esta migración.

begin;

-- Soluciones ya usadas (una solución sirve una sola vez). Solo la usan las funciones de abajo.
create table if not exists pow_used (
  challenge text primary key,
  used_at timestamptz not null default now()
);
alter table pow_used enable row level security;
revoke all on pow_used from public, anon, authenticated;

-- Clave HMAC (se crea una sola vez; nunca sale de la base).
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'pow_key') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'pow_key',
      'Clave HMAC de la prueba de trabajo del registro (pow_challenge / pow_guard)');
  end if;
end $$;

create or replace function pow_challenge() returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  k text;
  mx constant int := 60000;                       -- en un celular promedio, uno o dos segundos
  n int := (('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint % (mx + 1))::int;
  salt text := encode(gen_random_bytes(12), 'hex') || '?expires=' || (extract(epoch from now())::bigint + 600);
  ch text;
begin
  select decrypted_secret into k from vault.decrypted_secrets where name = 'pow_key';
  if k is null then return null; end if;
  ch := encode(digest(salt || n::text, 'sha256'), 'hex');
  return jsonb_build_object('algorithm', 'SHA-256', 'salt', salt, 'challenge', ch, 'maxnumber', mx,
                            'signature', encode(hmac(ch, k, 'sha256'), 'hex'));
end $$;
revoke execute on function pow_challenge() from public;
grant execute on function pow_challenge() to anon, authenticated, service_role;

create or replace function pow_check(p jsonb) returns boolean
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  k text;
  salt text := p->>'salt';
  num text := p->>'number';
  ch text := p->>'challenge';
  sig text := p->>'signature';
  exp bigint;
begin
  if p is null or jsonb_typeof(p) <> 'object' or salt is null or num is null or ch is null or sig is null then return false; end if;
  if num !~ '^\d{1,7}$' or length(salt) > 100 or ch !~ '^[0-9a-f]{64}$' or sig !~ '^[0-9a-f]{64}$' then return false; end if;
  exp := substring(salt from '\?expires=(\d{1,12})$')::bigint;
  if exp is null or exp < extract(epoch from now()) then return false; end if;
  select decrypted_secret into k from vault.decrypted_secrets where name = 'pow_key';
  if k is null then return false; end if;
  if encode(hmac(ch, k, 'sha256'), 'hex') <> sig then return false; end if;     -- el desafío lo emitimos nosotros
  if encode(digest(salt || num, 'sha256'), 'hex') <> ch then return false; end if; -- y está resuelto
  delete from pow_used where used_at < now() - interval '1 day';
  insert into pow_used (challenge) values (ch) on conflict do nothing;
  return found;                                                                  -- false si ya se había usado
end $$;
revoke execute on function pow_check(jsonb) from public, anon, authenticated;

create or replace function pow_guard() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if coalesce(new.raw_app_meta_data->>'provider', 'email') = 'email'
     and exists (select 1 from vault.secrets where name = 'pow_key')
     and not pow_check(new.raw_user_meta_data->'pow') then
    raise exception 'pow_failed' using errcode = 'P0001';
  end if;
  new.raw_user_meta_data := coalesce(new.raw_user_meta_data, '{}'::jsonb) - 'pow';
  return new;
end $$;
revoke execute on function pow_guard() from public, anon, authenticated;

drop trigger if exists pow_guard on auth.users;
create trigger pow_guard before insert on auth.users
  for each row execute function public.pow_guard();

commit;

notify pgrst, 'reload schema';
