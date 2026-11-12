// "De potrero a leyenda": el resumen mínimo que muestra la tarjeta de Inicio (la carrera en curso, tu mejor carrera por dificultad y cuántos logros llevás).
// Lo escribe careerStore cada vez que guarda. NO importa nada del juego (careerCore, datos, eventos): así Inicio lee esto sin cargar el simulador entero.

/** Lo guardado se separa por perfil: otra cuenta en el mismo celular no retoma tu carrera. Sin perfil, un cajón común. */
export const scopeOf = (uid?: string | null): string => uid || 'guest';

/** Versión del formato del juego: la 3 suma dificultad, país y logros. Un resumen de otra versión se descarta (arranca vacío). */
export const SUMMARY_V = 3;

export type DiffKey = 'normal' | 'intenso' | 'experto';
export const DIFF_KEYS: readonly DiffKey[] = ['normal', 'intenso', 'experto'];
/** Nombres de las dificultades (copia chica de careerSetup para no traer el juego a Inicio). */
export const DIFF_TITLE: Record<DiffKey, string> = { normal: 'Normal', intenso: 'Intenso', experto: 'Experto' };

/** Cuántos logros hay en total (el test lo compara con la lista de careerAchievements). */
export const ACH_TOTAL = 24;

export interface BestSummary { label: string; score: number }
export interface CareerSummary {
  run: { name: string; season: number } | null;
  best: Partial<Record<DiffKey, BestSummary>>;
  /** Logros desbloqueados. */
  ach: number;
  /** Mejor puntaje del Desafío del día (y de qué día) y la racha de días seguidos. */
  day: { day: string; score: number } | null;
  streak: { last: string; n: number };
}

const SUMMARY_KEY = 'futrank-career-sum';
export const summaryKey = (uid?: string | null) => `${SUMMARY_KEY}:${scopeOf(uid)}`;
const EMPTY: CareerSummary = { run: null, best: {}, ach: 0, day: null, streak: { last: '', n: 0 } };
const isDayText = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x);

const okBest = (b: unknown): BestSummary | null => {
  const x = b as { label?: unknown; score?: unknown } | null;
  return x && typeof x.label === 'string' && typeof x.score === 'number' && Number.isFinite(x.score) ? { label: x.label.slice(0, 40), score: x.score } : null;
};

/** Lee el resumen (con cualquier basura, versión vieja o storage roto, devuelve vacío). */
export function loadSummary(uid?: string | null): CareerSummary {
  try {
    const raw = localStorage.getItem(summaryKey(uid));
    if (!raw) return EMPTY;
    const s = JSON.parse(raw) as { v?: unknown; run?: { name?: unknown; season?: unknown } | null; best?: Record<string, unknown> | null; ach?: unknown; day?: { day?: unknown; score?: unknown } | null; streak?: { last?: unknown; n?: unknown } | null } | null;
    if (!s || s.v !== SUMMARY_V) return EMPTY;
    const r = s.run;
    const best: CareerSummary['best'] = {};
    for (const d of DIFF_KEYS) { const b = okBest(s.best?.[d]); if (b) best[d] = b; }
    return {
      run: r && typeof r.name === 'string' && typeof r.season === 'number' && Number.isInteger(r.season) && r.season > 0 ? { name: r.name.slice(0, 24), season: r.season } : null,
      best, ach: typeof s.ach === 'number' && Number.isInteger(s.ach) && s.ach >= 0 && s.ach <= 99 ? s.ach : 0,
      day: s.day && isDayText(s.day.day) && typeof s.day.score === 'number' && Number.isFinite(s.day.score) ? { day: s.day.day, score: Math.max(0, Math.floor(s.day.score)) } : null,
      streak: s.streak && isDayText(s.streak.last) && typeof s.streak.n === 'number' && s.streak.n > 0 ? { last: s.streak.last, n: Math.floor(s.streak.n) } : { last: '', n: 0 },
    };
  } catch { return EMPTY; }
}

/** La mejor carrera de todas las dificultades (la de más puntos) y en cuál fue. */
export function topBest(s: CareerSummary): (BestSummary & { d: DiffKey }) | null {
  let out: (BestSummary & { d: DiffKey }) | null = null;
  for (const d of DIFF_KEYS) { const b = s.best[d]; if (b && (!out || b.score > out.score)) out = { ...b, d }; }
  return out;
}

export interface SummaryPatch { run?: CareerSummary['run']; best?: { d: DiffKey; v: BestSummary | null }; ach?: number; day?: CareerSummary['day']; streak?: CareerSummary['streak'] }
/** Actualiza una parte del resumen (y no escribe si no cambió nada). */
export function writeSummary(uid: string | null | undefined, patch: SummaryPatch) {
  try {
    const cur = loadSummary(uid);
    const best = { ...cur.best };
    if (patch.best) { if (patch.best.v) best[patch.best.d] = patch.best.v; else delete best[patch.best.d]; }
    const json = JSON.stringify({ v: SUMMARY_V, run: patch.run !== undefined ? patch.run : cur.run, best, ach: patch.ach ?? cur.ach, day: patch.day !== undefined ? patch.day : cur.day, streak: patch.streak ?? cur.streak });
    const key = summaryKey(uid);
    if (localStorage.getItem(key) !== json) localStorage.setItem(key, json);
  } catch { /* sin storage */ }
}
