# Ranking Fútbol

App para armar comunidades de fútbol amateur, calificar jugadores al estilo FIFA, convocar partidos y armar equipos parejos.

## Estructura
- `web/`: la app (Preact + TypeScript + Vite). Es lo único que se publica.
- `supabase/migrations/`: esquema de la base (tablas, RLS, funciones). Se aplica en el SQL Editor de Supabase o con `supabase db push`.
- La app vieja (index.html + `api/` con Upstash Redis) fue eliminada.

## Desarrollo
```
cd web
npm install
npm run dev     # http://localhost:5173
npm test        # vitest
npm run build   # tsc + vite build → web/dist
```
- Variables en `web/.env.local` (ver `web/.env.example`): `VITE_SUPABASE_URL` (solo `https://xxx.supabase.co`, sin `/rest/v1`) y `VITE_SUPABASE_ANON_KEY` (clave anon/publishable, nunca service_role ni la contraseña de la base).
- `src/lib/model.ts`: constantes y tipos puros (sin Supabase) para que los tests no necesiten variables de entorno. `supabase.ts` los re-exporta.

## Auth
- Login con Google vía Supabase Auth. En Supabase → Authentication → URL Configuration: Site URL y Redirect URLs deben incluir `http://localhost:5173/**` y `https://footbal-rank.vercel.app/**`.

## Deploy
- Vercel, proyecto `footbal-rank`, Root Directory = `web`, framework Vite. Push a `main` publica solo.
- Variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` cargadas en Vercel (se leen al compilar: cambiar una requiere redeploy).

## Convenciones
- UI en español rioplatense ("vos"), mobile-first.
- Commits sin línea de coautoría de Claude.
- Ahorrar tokens; planificar con Opus y revisar siempre con Opus. La calidad final importa más que el ahorro.
