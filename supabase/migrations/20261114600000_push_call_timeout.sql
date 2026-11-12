-- push_call: igual que la versión viva (20261110000000_push.sql, verificada con pg_get_functiondef el 2026-11-12); solo cambia
-- el timeout de pg_net (5 s por defecto → 30 s). El 12/11 a las 10:00 el aviso "Hoy jugás" se perdió: la Edge Function
-- arrancó en frío y pg_net cortó a los 5 s ("Timeout of 5000 ms reached") antes de que mandara nada; push_tick ya había
-- marcado el partido como avisado, así que no se reintentó. Idempotente; no toca datos.

begin;

create or replace function push_call(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare u text; s text;
begin
  select decrypted_secret into u from vault.decrypted_secrets where name = 'push_url';
  select decrypted_secret into s from vault.decrypted_secrets where name = 'push_secret';
  if u is null or s is null then return; end if;
  perform net.http_post(url := u, body := p,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', s),
    timeout_milliseconds := 30000);
exception when others then
  raise warning 'push_call: %', sqlerrm;
end $$;
revoke all on function push_call(jsonb) from public, anon, authenticated;

commit;
