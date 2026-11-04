# Ranking Fútbol

App web para calificar a los jugadores de un equipo amateur al estilo FIFA y armar equipos parejos. Cualquiera con el link vota; el puntaje de cada jugador es el promedio de todos los votos.

## Arquitectura
- Un solo archivo: `index.html`. Sin build, sin backend, sin librerías.
- Corre como Artifact de claude.ai con capacidades `db` + `user` (votación compartida), o abriendo el archivo localmente (fallback a `localStorage`, clave `futrank-v1`, voterId `"local"`, con banner "Modo local").
- Capa de datos abstraída en el objeto `store` (`addPlayer`, `deletePlayer`, `saveVote`); la UI no sabe qué backend usa.
- Vistas por hash: `#plantel` (default), `#votar`, `#equipos`.

## Plantel fijo
- `ROSTER` en `index.html` tiene los jugadores del equipo hardcodeados con ids estables (`javier`, `david`, …). `withRoster()` los mezcla con los de la db / localStorage; no se pueden borrar desde la app. Para cambiar nombre o posición, editar `ROSTER` y republicar (los votos se mantienen porque van por id).

## Modelo de datos
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
- Tras editar, republicar en la misma URL del artifact.

## Preferencias de trabajo
- Ahorrar tokens: no explorar de más, no releer archivos.
- Planificar con Opus; delegar la ejecución a Sonnet (high) o hacerla con Opus, pero siempre revisar con Opus. La calidad final importa más que el ahorro.
- Sin `db`/`user` (sin sesión) se ve el ranking compartido en solo lectura; el modo local es solo para abrir el archivo fuera de claude.ai.
