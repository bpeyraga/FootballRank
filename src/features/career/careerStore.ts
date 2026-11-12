// "De potrero a leyenda": lo guardado en este dispositivo (carrera en curso, mejor carrera de cada dificultad y logros). Nada va al servidor.
// Todo acceso al storage va en try/catch: en modo privado o con el storage bloqueado el juego sigue andando, solo que no guarda.
// Las claves llevan el id del perfil: otra cuenta en el mismo celular no retoma tu carrera ni ve tu mejor marca.
// (Las claves viejas sin perfil o sin dificultad, `futrank-career` y `futrank-career-best` sin sufijo, ya no se leen.)
import { parseAch, unlockedCount, type AchStats, emptyAch } from './careerAchievements';
import { bestOf, parseBest, parseCareer, type Best, type Career } from './careerCore';
import type { Difficulty } from './careerTypes';
import { DIFF_KEYS, scopeOf, writeSummary } from './careerSummary';

export const RUN_KEY = 'futrank-career';
export const BEST_KEY = 'futrank-career-best';
export const ACH_KEY = 'futrank-career-ach';
export const runKey = (uid?: string | null) => `${RUN_KEY}:${scopeOf(uid)}`;
export const bestKey = (uid?: string | null, d: Difficulty = 'normal') => `${BEST_KEY}:${scopeOf(uid)}:${d}`;
export const achKey = (uid?: string | null) => `${ACH_KEY}:${scopeOf(uid)}`;

/** La temporada en curso: en el "momento clave" de una final la temporada ya se jugó (está en el historial), así que no se suma una más. */
const runSummary = (c: Career | null) => (c && c.phase !== 'over' ? { name: c.name, season: c.history.length + (c.phase === 'decide' && !c.tension ? 1 : 0) } : null);
const bestSummary = (b: Best | null) => (b ? { label: b.label, score: b.score } : null);

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

export function loadBest(uid?: string | null, d: Difficulty = 'normal'): Best | null {
  try {
    const raw = localStorage.getItem(bestKey(uid, d));
    const b = raw ? parseBest(raw) : null;
    const ok = b && b.d === d ? b : null;
    writeSummary(uid, { best: { d, v: bestSummary(ok) } });
    return ok;
  } catch { return null; }
}
/** La mejor carrera de cada dificultad. */
export function loadBests(uid?: string | null): Record<Difficulty, Best | null> {
  return { normal: loadBest(uid, 'normal'), intenso: loadBest(uid, 'intenso'), experto: loadBest(uid, 'experto') };
}
export function saveBest(b: Best, uid?: string | null) {
  try { localStorage.setItem(bestKey(uid, b.d), JSON.stringify(b)); } catch { /* sin storage */ }
  writeSummary(uid, { best: { d: b.d, v: bestSummary(b) } });
}

/** Si la carrera terminada supera (o iguala por primera vez) a la mejor de su dificultad, la guarda y la devuelve; si no, devuelve la que había. */
export function recordIfBest(c: Career, current: Best | null, uid?: string | null): Best | null {
  if (c.phase !== 'over') return current;
  const b = bestOf(c);
  if (current && current.score >= b.score) return current;
  saveBest(b, uid);
  return b;
}

export function loadAch(uid?: string | null): AchStats {
  try {
    const raw = localStorage.getItem(achKey(uid));
    const a = raw ? parseAch(raw) : emptyAch();
    writeSummary(uid, { ach: unlockedCount(a), day: a.dailyBest, streak: a.streak });
    return a;
  } catch { return emptyAch(); }
}
export function saveAch(a: AchStats, uid?: string | null) {
  try { localStorage.setItem(achKey(uid), JSON.stringify(a)); } catch { /* sin storage */ }
  writeSummary(uid, { ach: unlockedCount(a), day: a.dailyBest, streak: a.streak });
}

export { DIFF_KEYS };
