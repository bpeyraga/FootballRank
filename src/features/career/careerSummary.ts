// "De potrero a leyenda": el resumen mínimo que muestra la tarjeta de Inicio (nombre y temporada de la carrera en curso, y tu mejor carrera).
// Lo escribe careerStore cada vez que guarda. NO importa nada del juego (careerCore, datos, eventos): así Inicio lee esto sin cargar el simulador entero.

/** Lo guardado se separa por perfil: otra cuenta en el mismo celular no retoma tu carrera. Sin perfil, un cajón común. */
export const scopeOf = (uid?: string | null): string => uid || 'guest';

/** Versión del formato del juego: la 2 es la de los clubes reales. Un resumen de otra versión se descarta (arranca vacío). */
export const SUMMARY_V = 2;

export interface CareerSummary {
  run: { name: string; season: number } | null;
  best: { label: string; score: number } | null;
}

const SUMMARY_KEY = 'futrank-career-sum';
export const summaryKey = (uid?: string | null) => `${SUMMARY_KEY}:${scopeOf(uid)}`;
const EMPTY: CareerSummary = { run: null, best: null };

/** Lee el resumen (con cualquier basura, versión vieja o storage roto, devuelve vacío). */
export function loadSummary(uid?: string | null): CareerSummary {
  try {
    const raw = localStorage.getItem(summaryKey(uid));
    if (!raw) return EMPTY;
    const s = JSON.parse(raw) as { v?: unknown; run?: { name?: unknown; season?: unknown } | null; best?: { label?: unknown; score?: unknown } | null } | null;
    if (!s || s.v !== SUMMARY_V) return EMPTY;
    const r = s.run, b = s.best;
    return {
      run: r && typeof r.name === 'string' && typeof r.season === 'number' && Number.isInteger(r.season) && r.season > 0 ? { name: r.name.slice(0, 24), season: r.season } : null,
      best: b && typeof b.label === 'string' && typeof b.score === 'number' && Number.isFinite(b.score) ? { label: b.label.slice(0, 40), score: b.score } : null,
    };
  } catch { return EMPTY; }
}

/** Actualiza una parte del resumen (y no escribe si no cambió nada). */
export function writeSummary(uid: string | null | undefined, patch: Partial<CareerSummary>) {
  try {
    const json = JSON.stringify({ v: SUMMARY_V, ...loadSummary(uid), ...patch });
    const key = summaryKey(uid);
    if (localStorage.getItem(key) !== json) localStorage.setItem(key, json);
  } catch { /* sin storage */ }
}
