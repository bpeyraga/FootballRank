-- Caché de "Fútbol argentino" (idempotente, sin borrar datos).
-- La Edge Function `futbol` guarda acá lo que trae de afuera (tabla, partidos, noticias, datos por club) para no
-- pegarle a las fuentes en cada visita: escribe con la service role (que se saltea RLS), así que no hay policies
-- de insert/update/delete. Cualquier usuario logueado puede leer.

create table if not exists public.futbol_cache (
  key text primary key,
  data jsonb not null,
  fetched_at timestamptz not null default now()
);

alter table public.futbol_cache enable row level security;

drop policy if exists futbol_cache_read on public.futbol_cache;
create policy futbol_cache_read on public.futbol_cache for select to authenticated using (true);

-- Por las dudas: la app (anon / authenticated) solo lee.
revoke insert, update, delete on public.futbol_cache from anon, authenticated;
revoke select on public.futbol_cache from anon;
