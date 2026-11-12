// Ilustraciones de la landing: maquetas chicas (HTML/CSS/SVG, sin imágenes) de cada función de la app.
// Son decorativas (aria-hidden): los datos son de ejemplo y el texto de cada tarjeta ya explica la función.
import { FutCard } from '../../shared/ui/FutCard';
import { Crest } from '../../shared/ui/Crest';
import type { Stats } from '../../shared/model';

// OVR ponderado por posición (ver POS_WEIGHTS): uno de cada color.
const VOS: Stats = { rit: 86, tir: 84, pas: 79, reg: 88, def: 45, fis: 76 };   // DEL · OVR 82 · oro
const FACU: Stats = { rit: 72, tir: 68, pas: 80, reg: 74, def: 62, fis: 70 };  // MED · OVR 73 · plata
const NICO: Stats = { rit: 55, tir: 45, pas: 58, reg: 50, def: 68, fis: 66 };  // DEF · OVR 62 · bronce

const tier = (o: number) => o >= 75 ? 'gold' : o >= 65 ? 'silver' : 'bronze';

/** Tres cartas en abanico, la del medio en oro. */
export function CardFan() {
  return (
    <div class="ld-fan" aria-hidden="true">
      <span class="ld-fan-glow" />
      <div class="ld-fc l"><FutCard p={{ name: 'Facu', pos: 'MED', photo_url: null }} stats={FACU} /></div>
      <div class="ld-fc r"><FutCard p={{ name: 'Nico', pos: 'DEF', photo_url: null }} stats={NICO} /></div>
      <div class="ld-fc c"><FutCard p={{ name: 'Vos', pos: 'DEL', photo_url: null }} stats={VOS} /></div>
      <div class="ld-chip c1"><i>🔔</i><span><b>Hoy jugás</b> · 21:00</span></div>
      <div class="ld-chip c2"><i>⭐</i><span><b>Figura</b> del partido</span></div>
    </div>
  );
}

const BARS: [string, number][] = [['RIT', 86], ['TIR', 84], ['PAS', 79], ['REG', 88], ['DEF', 45], ['FIS', 76]];

/** Carta votada por el grupo: OVR y las seis barras. */
export function ArtStats() {
  return (
    <div class="a-stats" aria-hidden="true">
      <div class="a-ovr"><b>76</b><span>DEL</span></div>
      <ul class="a-bars">
        {BARS.map(([k, v]) => <li><span>{k}</span><i style={`--w:${v}%`} /><b>{v}</b></li>)}
      </ul>
    </div>
  );
}

const A: [string, number][] = [['Maxi', 78], ['Nico', 74], ['Lean', 70], ['Santi', 66], ['Fede', 62]];
const B: [string, number][] = [['Dami', 77], ['Juli', 73], ['Tomi', 69], ['Lucho', 67], ['Gabi', 63]];

/** Dos equipos con el mismo nivel promedio. */
export function ArtTeams() {
  const col = (k: 'A' | 'B', l: [string, number][]) => (
    <div class={`a-team ${k}`}>
      <h4>Equipo {k}<b>{Math.round(l.reduce((t, x) => t + x[1], 0) / l.length)}</b></h4>
      <ul>{l.map(([n, o]) => <li><span>{n}</span><em class={`ovr ${tier(o)}`}>{o}</em></li>)}</ul>
    </div>
  );
  return (
    <div class="a-teams" aria-hidden="true">
      {col('A', A)}
      <span class="a-vs">VS</span>
      {col('B', B)}
    </div>
  );
}

/** Avisos al celular. */
export function ArtNotifs() {
  const n = (t: string, d: string, w: string) => (
    <div class="a-notif">
      <img src="/icon.png" width={32} height={32} alt="" loading="lazy" />
      <div><b>{t}<small>{w}</small></b><span>{d}</span></div>
    </div>
  );
  return (
    <div class="a-notifs" aria-hidden="true">
      {n('Ranking Fútbol', 'Hoy jugás a las 21:00. ¡Nos vemos en la cancha!', 'ahora')}
      {n('Ranking Fútbol', 'Falta 1 hora para el partido.', 'hace 1 h')}
      {n('Ranking Fútbol', 'Se liberó un lugar: entraste de la lista de espera.', 'hace 3 h')}
    </div>
  );
}

/** Carga de un partido: goles, asistencias, tarjetas y figura. */
export function ArtMatch() {
  const row = (e: string, l: string, n: number) => (
    <div class="a-step"><span>{e} {l}</span><span class="a-num"><i>−</i><b>{n}</b><i>+</i></span></div>
  );
  return (
    <div class="a-match" aria-hidden="true">
      <div class="a-score"><b>5</b><span>–</span><b>4</b><em>1 min</em></div>
      {row('⚽', 'Goles', 2)}
      {row('👟', 'Asistencias', 1)}
      {row('🟨', 'Tarjetas', 0)}
      <div class="a-step mvp"><span>⭐ Figura del partido</span><span class="a-who"><u>M</u>Maxi</span></div>
    </div>
  );
}

/** Ranking, logros y compartir en historias. */
export function ArtRank() {
  const r = (i: number, n: string, o: number) => (
    <li><b class="a-pos">{i}</b><u>{n[0]}</u><span>{n}</span><em class={`ovr ${tier(o)}`}>{o}</em></li>
  );
  return (
    <div class="a-rank" aria-hidden="true">
      <ol>{r(1, 'Maxi', 78)}{r(2, 'Dami', 77)}{r(3, 'Nico', 74)}</ol>
      <div class="a-badges">
        <span title="Hat-trick">🎩</span><span title="Racha">🔥</span><span title="Valla invicta">🧤</span><span title="Figura">⭐</span><span title="Leyenda">👑</span>
      </div>
      <div class="a-share">📲 Compartir mi carta en historias</div>
    </div>
  );
}

/** Chat del grupo con una encuesta. */
export function ArtChat() {
  return (
    <div class="a-chat" aria-hidden="true">
      <div class="a-bub in"><b>Dami</b>¿Jugamos el jueves? Armo la lista.</div>
      <div class="a-bub poll">
        <p>¿Quién viene el jueves?</p>
        <div class="a-opt on"><span class="a-tick">✓</span><span>Voy</span><i style="--w:75%" /><b>6</b></div>
        <div class="a-opt"><span class="a-tick" /><span>No puedo</span><i style="--w:25%" /><b>2</b></div>
      </div>
      <div class="a-bub out">Yo me anoto 💪</div>
    </div>
  );
}

const DAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

/** Partido fijo semanal y cuota de la cancha. */
export function ArtFixed() {
  const f = (n: string, ok: boolean) => <li><span>{n}</span><em class={ok ? 'ok' : 'due'}>{ok ? 'Pagó' : 'Debe'}</em></li>;
  return (
    <div class="a-fixed" aria-hidden="true">
      <div class="a-week">{DAYS.map((d, i) => <span class={i === 3 ? 'on' : ''}>{d}</span>)}</div>
      <p class="a-cap">Todos los jueves · 21:00</p>
      <ul class="a-fees">{f('Maxi', true)}{f('Dami', true)}{f('Lean', false)}</ul>
    </div>
  );
}

const CLUBS = ['River Plate', 'Boca Juniors', 'Independiente', 'Racing Club', 'San Lorenzo', 'Vélez Sarsfield'];

/** Fútbol argentino: pestañas y escudos de clubes (propios, no oficiales). */
export function ArtFut() {
  return (
    <div class="a-fut" aria-hidden="true">
      <div class="a-tabs"><span class="on">Tabla</span><span>Partidos</span><span>Noticias</span></div>
      <div class="a-crests">{CLUBS.map(c => <Crest team={c} size={28} />)}</div>
      <div class="a-news"><i style="--w:92%" /><i style="--w:70%" /><i style="--w:84%" /></div>
    </div>
  );
}
