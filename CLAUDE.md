# Ranking Fútbol

App web para calificar a los jugadores de un equipo amateur al estilo FIFA y armar equipos parejos. Cualquiera con el link vota; el puntaje de cada jugador es el promedio de todos los votos.

## Arquitectura
- Front en un solo archivo: `index.html`, sin build ni librerías. Back: funciones de Vercel en `api/` (ver abajo).
- Modos, en orden de detección: claude.ai (`db` + `user`, legado), Vercel (`/api/data` responde) y local (`localStorage`, clave `futrank-v1`, voterId `"local"`, con banner "Modo local").
- Capa de datos abstraída en el objeto `store` (`addPlayer`, `deletePlayer`, `saveVote`); la UI no sabe qué backend usa.
- Vistas por hash: `#plantel` (default), `#votar`, `#equipos`.

## Plantel fijo
- `ROSTER` en `index.html` tiene los jugadores del equipo hardcodeados con ids estables (`javier`, `david`, …). `withRoster()` los mezcla con los de la db / localStorage; no se pueden borrar desde la app. Para cambiar nombre o posición, editar `ROSTER` y republicar (los votos se mantienen porque van por id).

## Vercel (modo principal)
- `api/data.js` (GET), `api/players.js` (POST/DELETE), `api/vote.js` (PUT); helpers en `api/_redis.js` (REST de Upstash vía `fetch`, sin dependencias). `package.json` solo marca `"type":"module"`.
- Redis: hash `players` (pid → JSON), hash `votes` (`voter|pid` → JSON de 6 atributos). Toda mutación devuelve `{players,votes}` completo.
- Votante anónimo: id `v…` en localStorage (`futrank-voter`). Sin login; el front refresca cada 15 s.
- Env vars: `KV_REST_API_URL`/`KV_REST_API_TOKEN` (o `UPSTASH_REDIS_REST_*`).
- El artifact de claude.ai fue borrado; el modo `db` de claude.ai queda en el código pero no se usa.

## Modelo de datos (modo claude.ai)
- `players/{pid}`: `{name, pos, createdBy, createdAt}`, con `pos` en `ARQ|DEF|MED|DEL`.
- `votes/{voterId}`: un doc por votante, `{ratings:{[pid]:{rit,tir,pas,reg,def,fis}}, updatedAt}`. Cada persona escribe solo su doc con `.set(docCompleto)`, de a una escritura por vez.
- Solo se guardan ids, nunca nombres de votantes. Los nombres de jugadores se muestran con `textContent`.
- Atributos 1–99: RIT, TIR, PAS, REG, DEF, FIS. Promedio por atributo entre votantes, `ovr` = promedio de los 6. Sin votos: se muestra "—" y cuenta como 50 al armar equipos.
- Suscripciones `onSnapshot` una sola vez al inicio (nunca dentro de render).

## Capacidades al publicar
```
{db:{rules:[{path:"votes",read:"view",write:"owner"},{path:"votes/{self}",write:"interact"}]},user:{}}
```
- Todos pueden leer los votos; cada persona escribe solo su propio doc `votes/{self}`; el dueño puede moderar (escribir cualquier voto).
- `players` queda escribible por Colaboradores (default). Un `invalid_argument` en una escritura se interpreta como falta de permiso.

## Algoritmo de equipos
`balance(players)` devuelve las 5 mejores particiones. Con n ≤ 22 enumera todo (jugador 0 fijo en A); con n > 22 usa 300 arranques aleatorios + hill-climbing por intercambios. El costo combina diferencia de OVR, de atributos, arqueros y posiciones (ver código).

## Convenciones
- UI en español rioplatense ("vos").
- Mantener todo en un solo archivo.
- Contrato de página Artifact: sin etiquetas `html/head/body`, empieza con `<title>`; solo fuentes de Google Fonts y CDNs permitidos; sin `alert/confirm/prompt` (usar confirmaciones inline).
- Colores como tokens en `:root`, con variantes dark (media query + `data-theme`).
- Deploy: push a `main` (Vercel conectado al repo) o `vercel --prod`. Commits sin línea de coautoría de Claude.

## Preferencias de trabajo
- Ahorrar tokens: no explorar de más, no releer archivos.
- Planificar con Opus; delegar la ejecución a Sonnet (high) o hacerla con Opus, pero siempre revisar con Opus. La calidad final importa más que el ahorro.
- Sin `db`/`user` (sin sesión) se ve el ranking compartido en solo lectura; el modo local es solo para abrir el archivo fuera de claude.ai.
