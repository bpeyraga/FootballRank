# FootballRank

Ranking estilo FIFA para el equipo de fútbol: cada uno vota los atributos de los jugadores (Ritmo, Tiro, Pase, Regate, Defensa, Físico) y la app arma los equipos más parejos.

- Front: `index.html` (un solo archivo, sin build).
- Back: funciones de Vercel en `api/` + Upstash Redis (Vercel → Storage).
- Abierto como archivo local, guarda los datos solo en ese navegador.

## Deploy en Vercel

1. Importar el repo en Vercel (o `vercel --prod`).
2. En el proyecto: **Storage → Create → Upstash Redis** y conectarlo al proyecto (agrega `KV_REST_API_URL` y `KV_REST_API_TOKEN`).
3. Redeploy. Listo: cualquiera con el link vota, sin login.
