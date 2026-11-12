// "De potrero a leyenda": lo guardado en este dispositivo (carrera en curso y mejor carrera). Nada va al servidor.
// Todo acceso al storage va en try/catch: en modo privado o con el storage bloqueado el juego sigue andando, solo que no guarda.
// Las claves llevan el id del perfil: otra cuenta en el mismo celular no retoma tu carrera ni ve tu mejor marca.
// (Las claves viejas sin perfil, `futrank-career` y `futrank-career-best`, ya no se leen.)
import { bestOf, parseBest, parseCareer, type Best, type Career } from './careerCore';
import { scopeOf, writeSummary, type CareerSummary } from './careerSummary';

export const RUN_KEY = 'futrank-career';
export const BEST_KEY = 'futrank-career-best';
export const runKey = (uid?: string | null) => `${RUN_KEY}:${scopeOf(uid)}`;
export const bestKey = (uid?: string | null) => `${BEST_KEY}:${scopeOf(uid)}`;

const runSummary = (c: Career | null): CareerSummary['run'] =>
  c && c.phase !== 'over' ? { name: c.name, season: c.history.length + (c.phase === 'decide' ? 1 : 0) } : null;
const bestSummary = (b: Best | null): CareerSummary['best'] => (b ? { label: b.label, score: b.score } : null);

export function loadRun(uid?: string | null): Career | null {
  try {
    const raw = localStorage.getItem(runKey(uid));
    const c = raw ? parseCareer(raw) : null;
    writeSummary(uid, { run: runSummary(c) }); // la tarjeta de Inicio se mantiene al día aunque lo guardado esté roto
    return c;
  } catch { return null; }
}
/** Guarda la carrera en curso; con null la borra. */
export function saveRun(c: Career | null, uid?: string | null) {
  try { if (c) localStorage.setItem(runKey(uid), JSON.stringify(c)); else localStorage.removeItem(runKey(uid)); } catch { /* sin storage */ }
  writeSummary(uid, { run: runSummary(c) });
}

export function loadBest(uid?: string | null): Best | null {
  try {
    const raw = localStorage.getItem(bestKey(uid));
    const b = raw ? parseBest(raw) : null;
    writeSummary(uid, { best: bestSummary(b) });
    return b;
  } catch { return null; }
}
export function saveBest(b: Best, uid?: string | null) {
  try { localStorage.setItem(bestKey(uid), JSON.stringify(b)); } catch { /* sin storage */ }
  writeSummary(uid, { best: bestSummary(b) });
}

/** Si la carrera terminada supera (o iguala por primera vez) a la mejor guardada, la guarda y la devuelve; si no, devuelve la que había. */
export function recordIfBest(c: Career, current: Best | null, uid?: string | null): Best | null {
  if (c.phase !== 'over') return current;
  const b = bestOf(c);
  if (current && current.score >= b.score) return current;
  saveBest(b, uid);
  return b;
}
