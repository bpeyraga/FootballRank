// Carga rápida de un partido ya jugado y goles/tarjetas con − / +: lógica pura (sin Supabase),
// para poder testearla sin variables de entorno.
import type { EventKind } from './statsCore';

/** Quién jugó y de qué lado: 'A' / 'B', o 'X' = jugó pero todavía sin equipo. Quien no está en el mapa, no jugó. */
export type Side = 'A' | 'B' | 'X';
export type Sel = Record<string, Side>;

export interface Counts { goal: number; assist: number; yellow: number; red: number }
export type CountsMap = Record<string, Counts>;

/** Topes por jugador (el servidor acepta hasta 300 eventos y 80 jugadores en total). */
export const MAX_COUNT: Record<EventKind, number> = { goal: 30, assist: 30, yellow: 2, red: 1 };
export const MAX_SCORE = 99, MAX_PLAYERS = 80, MAX_EVENTS = 300;
const KINDS: readonly EventKind[] = ['goal', 'assist', 'yellow', 'red'];

export const emptyCounts = (): Counts => ({ goal: 0, assist: 0, yellow: 0, red: 0 });
export const countsOf = (m: CountsMap, id: string): Counts => m[id] ?? emptyCounts();

/** Suma o resta uno (delta) a un contador, siempre entre 0 y su tope. Devuelve el mismo mapa si no cambia. */
export function bump(m: CountsMap, id: string, kind: EventKind, delta: number): CountsMap {
  const c = countsOf(m, id);
  const n = Math.min(MAX_COUNT[kind], Math.max(0, c[kind] + delta));
  return n === c[kind] ? m : { ...m, [id]: { ...c, [kind]: n } };
}

// ---- Quiénes jugaron ----

/** Pone a alguien de un lado (o lo saca con null). */
export function setSide(sel: Sel, id: string, side: Side | null): Sel {
  if (side === null) {
    if (!(id in sel)) return sel;
    const out = { ...sel }; delete out[id]; return out;
  }
  return sel[id] === side ? sel : { ...sel, [id]: side };
}

/** Tocar el nombre: no jugó ↔ jugó (sin equipo); si ya tenía equipo, lo saca. */
export const toggleSide = (sel: Sel, id: string): Sel => setSide(sel, id, id in sel ? null : 'X');

/** "Todos": los que no estaban marcados pasan a "jugó, sin equipo"; los que ya tenían equipo lo conservan. */
export function selectAll(sel: Sel, ids: string[]): Sel {
  const out = { ...sel };
  for (const id of ids) if (!(id in out)) out[id] = 'X';
  return out;
}

/** Aplica un reparto de equipos (p. ej. el de balance()) sin tocar al resto. */
export function applyTeams(sel: Sel, A: string[], B: string[]): Sel {
  const out = { ...sel };
  for (const id of A) out[id] = 'A';
  for (const id of B) out[id] = 'B';
  return out;
}

export interface Tally { a: number; b: number; none: number; total: number }
export function tally(sel: Sel): Tally {
  const t = { a: 0, b: 0, none: 0, total: 0 };
  for (const s of Object.values(sel)) { t.total++; if (s === 'A') t.a++; else if (s === 'B') t.b++; else t.none++; }
  return t;
}

// ---- Resultado ----

/** Goles de cada equipo según los goles cargados a sus jugadores (tope 99). */
export function autoScore(sel: Sel, counts: CountsMap): { a: number; b: number } {
  let a = 0, b = 0;
  for (const [id, side] of Object.entries(sel)) {
    const g = counts[id]?.goal ?? 0;
    if (side === 'A') a += g; else if (side === 'B') b += g;
  }
  return { a: Math.min(a, MAX_SCORE), b: Math.min(b, MAX_SCORE) };
}

export const clampScore = (n: number) => Math.min(MAX_SCORE, Math.max(0, Math.round(n) || 0));
const isScore = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= MAX_SCORE;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Avisos (no bloquean): goles cargados de más para un equipo respecto del resultado. */
export function warnings(sel: Sel, counts: CountsMap, a: number, b: number): string[] {
  const g = autoScore(sel, counts), out: string[] = [];
  if (g.a > a) out.push(`Cargaste ${plural(g.a, 'gol', 'goles')} del Equipo A y el resultado dice ${a}.`);
  if (g.b > b) out.push(`Cargaste ${plural(g.b, 'gol', 'goles')} del Equipo B y el resultado dice ${b}.`);
  return out;
}

// ---- Fecha ----

/** Valor de <input type="datetime-local"> (hora local, sin segundos). */
export const toLocalInput = (d: Date) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60e3).toISOString().slice(0, 16);

/** Fecha de un valor datetime-local; null si está vacío o es inválido. */
export function parseLocal(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(+d) ? null : d;
}

/** Cuándo se jugó, por defecto: hoy a las 21 si ya pasó; si no, ayer a las 21. */
export function defaultStart(now: Date): Date {
  const d = new Date(now); d.setHours(21, 0, 0, 0);
  if (+d > +now) d.setDate(d.getDate() - 1);
  return d;
}

// ---- Armado del pedido ----

export const buildPlayers = (sel: Sel) =>
  Object.entries(sel).map(([id, s]) => ({ id, team: s === 'X' ? null : s }));

/** Un renglón por evento, solo de quienes jugaron (el servidor rechaza eventos de otros). */
export function buildEvents(sel: Sel, counts: CountsMap): { id: string; kind: EventKind }[] {
  const out: { id: string; kind: EventKind }[] = [];
  for (const id of Object.keys(sel)) {
    const c = counts[id];
    if (c) for (const kind of KINDS) for (let i = 0; i < c[kind]; i++) out.push({ id, kind });
  }
  return out;
}

export interface QuickInput { sel: Sel; counts: CountsMap; a: number; b: number; when: string; now: Date }

/** Primer problema que impide guardar (en español) o null si está todo bien. */
export function validateQuick(i: QuickInput): string | null {
  const t = tally(i.sel);
  if (t.total < 2) return 'Marcá al menos 2 jugadores.';
  if (t.total > MAX_PLAYERS) return `Son demasiados jugadores (máximo ${MAX_PLAYERS}).`;
  if (t.none > 0 && t.none < t.total)
    return `${plural(t.none, 'jugador sin equipo', 'jugadores sin equipo')}: elegí A o B para cada uno.`;
  const d = parseLocal(i.when);
  if (!d) return 'Elegí la fecha y hora del partido.';
  if (+d > +i.now) return 'La fecha y hora tiene que ser pasada: el partido ya se jugó.';
  if (!isScore(i.a) || !isScore(i.b)) return `El resultado tiene que ser un número entre 0 y ${MAX_SCORE}.`;
  if (buildEvents(i.sel, i.counts).length > MAX_EVENTS) return 'Hay demasiados goles y tarjetas cargados.';
  return null;
}

/** Mensaje en español para un error de load_played_match (o de la red). */
export function quickError(m: string): string {
  if (m.includes('Could not find the function') || m.includes('PGRST202'))
    return 'La carga rápida todavía no está habilitada en el servidor. Avisale al admin técnico.';
  if (m.includes('forbidden') || m.includes('row-level security')) return 'Solo los admins pueden cargar partidos jugados.';
  if (m.includes('not_started')) return 'La fecha y hora tiene que ser pasada: el partido ya se jugó.';
  if (m.includes('bad_score')) return `El resultado tiene que ser un número entre 0 y ${MAX_SCORE}.`;
  if (m.includes('bad_venue')) return 'Esa cancha no es de esta comunidad. Elegí otra.';
  if (m.includes('bad_input')) return `Hay demasiados jugadores o goles y tarjetas (máximo ${MAX_PLAYERS} jugadores y ${MAX_EVENTS} eventos).`;
  if (m.includes('few_players')) return 'Marcá al menos 2 jugadores.';
  if (m.includes('bad_team')) return 'Algún jugador tiene un equipo inválido. Elegí A o B de nuevo.';
  if (m.includes('not_member')) return 'Alguno de los jugadores ya no es miembro de la comunidad. Recargá la pantalla y revisá la lista.';
  if (m.includes('bad_event')) return 'Hay goles o tarjetas de alguien que no está marcado como jugador. Revisá la lista.';
  if (m.includes('Failed to fetch') || m.includes('NetworkError') || m.includes('Load failed')) return 'Sin conexión. Probá de nuevo.';
  return `No pudimos guardar el partido. ${m}`.trim();
}

// ---- Goles y tarjetas de un partido ya cargado (pantalla del partido) ----

/** Cuántos eventos de cada tipo tiene cada jugador. */
export function eventCounts(events: { profile_id: string; kind: EventKind }[]): CountsMap {
  const out: CountsMap = {};
  for (const e of events) {
    const c = out[e.profile_id] ?? (out[e.profile_id] = emptyCounts());
    c[e.kind]++;
  }
  return out;
}

/** El último evento (el más reciente de la lista) de ese jugador y tipo: es el que borra el "−". */
export function lastEvent<T extends { profile_id: string; kind: EventKind }>(events: T[], profileId: string, kind: EventKind): T | undefined {
  for (let i = events.length - 1; i >= 0; i--) if (events[i].profile_id === profileId && events[i].kind === kind) return events[i];
  return undefined;
}
