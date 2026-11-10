// Partido en vivo: reloj, minuto, marcador y manejo de eventos en tiempo real.
// Lógica pura (sin Supabase ni DOM) para poder testearla sin variables de entorno.
import type { EventKind, Team } from '../stats/statsCore';

export type LiveState = 'running' | 'paused' | 'ended';
export type LiveAction = 'start' | 'pause' | 'resume' | 'half' | 'end' | 'reset';

/**
 * Columnas del reloj en `matches` (ver live_clock en 20261111400000_fouls_live.sql):
 * tiempo del partido = live_elapsed + (ahora - live_since, solo si está 'running').
 * `undefined` en live_state significa que la base todavía no tiene las columnas.
 */
export interface LiveClock {
  live_state?: LiveState | null;
  live_half?: number | null;
  live_since?: string | null;
  live_elapsed?: number | null;
}

/** Tope del minuto que se guarda (el servidor acepta 0..200). */
export const MAX_MINUTE = 200;
/** El servidor deja arrancar el partido en vivo hasta 2 horas antes de la hora. */
export const EARLY_MS = 2 * 3600e3;
/** Pasado este tiempo desde la hora del partido ya no se ofrece "en vivo" (para eso está cargar el resultado). */
export const LATE_MS = 24 * 3600e3;

export const isLive = (c: LiveClock) => c.live_state === 'running' || c.live_state === 'paused' || c.live_state === 'ended';

/** Segundos de juego transcurridos en el instante `nowMs` (nunca negativo; entero). */
export function elapsedSec(c: LiveClock, nowMs: number): number {
  const base = Math.max(0, Math.floor(Number(c.live_elapsed) || 0));
  if (c.live_state !== 'running' || !c.live_since) return base;
  const since = Date.parse(c.live_since);
  if (isNaN(since)) return base;
  return base + Math.max(0, Math.floor((nowMs - since) / 1000));
}

/** "mm:ss" (los minutos pueden pasar de 99: "100:05"). */
export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec) || 0);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Minuto del partido en curso (1 durante el primer minuto), tope 200. */
export const minuteOf = (sec: number) => Math.min(MAX_MINUTE, Math.floor(Math.max(0, sec) / 60) + 1);

/** "23'" o '' si el evento no tiene minuto. */
export const fmtMinute = (min: number | null | undefined) => min == null ? '' : `${min}'`;

/**
 * Diferencia (ms) entre la hora del servidor y la del celular, para sumarla a Date.now().
 * `sentMs` y `recvMs` son la hora local al pedirla y al recibir la respuesta: se asume que el servidor
 * contestó a mitad de camino.
 */
export const clockOffset = (serverMs: number, sentMs: number, recvMs: number) =>
  serverMs - Math.round((sentMs + recvMs) / 2);

/** Qué mostrar arriba del cronómetro. */
export function liveLabel(c: LiveClock): string {
  if (c.live_state === 'ended') return 'Terminó';
  if (c.live_state === 'paused') return c.live_half === 2 ? 'Pausa · 2º tiempo' : 'En pausa';
  if (c.live_state === 'running') return c.live_half === 2 ? '2º tiempo' : '1er tiempo';
  return '';
}

/** ¿Es "de hoy"? Desde 2 h antes de la hora del partido hasta 24 h después. */
export function inLiveWindow(startsAt: string, nowMs: number): boolean {
  const at = Date.parse(startsAt);
  return !isNaN(at) && nowMs >= at - EARLY_MS && nowMs <= at + LATE_MS;
}

/** ¿Se puede ofrecer "Iniciar partido en vivo"? Lista abierta o cerrada, sin reloj, y de hoy. */
export function canStartLive(m: LiveClock & { status: string; starts_at: string }, nowMs: number): boolean {
  if (m.live_state !== null) return false; // undefined: la base todavía no tiene el reloj
  if (m.status !== 'open' && m.status !== 'closed') return false;
  return inLiveWindow(m.starts_at, nowMs);
}

// ---- Marcador ----

/** Goles de cada equipo según los goles cargados (los de jugadores sin equipo no cuentan). */
export function scoreFromEvents(events: { profile_id: string; kind: EventKind }[], teamOf: (pid: string) => Team | null): { a: number; b: number } {
  let a = 0, b = 0;
  for (const e of events) {
    if (e.kind !== 'goal') continue;
    const t = teamOf(e.profile_id);
    if (t === 'A') a++; else if (t === 'B') b++;
  }
  return { a, b };
}

// ---- Eventos en orden y en tiempo real ----

interface Ev { id: number; profile_id: string; kind: EventKind; created_by?: string | null }

// Los ids reales van por orden de carga; los provisorios (negativos, todavía sin guardar) van al final, el más nuevo último.
const orderKey = (e: { id: number }) => e.id > 0 ? e.id : 1e15 - e.id;

/** Del más viejo al más nuevo. */
export const chronological = <T extends { id: number }>(events: T[]): T[] => [...events].sort((a, b) => orderKey(a) - orderKey(b));

/** El último evento cargado (el que deshace "Deshacer"). */
export function lastEventOf<T extends { id: number }>(events: T[]): T | undefined {
  let best: T | undefined;
  for (const e of events) if (!best || orderKey(e) > orderKey(best)) best = e;
  return best;
}

/** El último evento que cargué yo (el que deshace "Deshacer": no le saca a otro admin lo que cargó). */
export const lastMineOf = <T extends { id: number; created_by?: string | null }>(events: T[], meId: string): T | undefined =>
  lastEventOf(events.filter(e => e.created_by === meId));

/** Llegó un INSERT por realtime: se agrega salvo que ya esté (mismo id). */
export function applyInsert<T extends { id: number }>(list: T[], row: T): T[] {
  return list.some(e => e.id === row.id) ? list : [...list, row];
}

/**
 * ¿Esta fila que llegó por realtime puede ser el eco de un insert mío que todavía no respondió?
 * (la hice yo y tengo una fila provisoria del mismo jugador y tipo). Quien lo llama la deja "en espera" hasta que
 * responda el insert: si la respuesta trae ese id, era mía; si no, es de otro celular y se agrega al terminar la cola.
 */
export function mayBeMyPending<T extends Ev>(list: T[], row: T, meId: string): boolean {
  return row.created_by === meId && list.some(e => e.id < 0 && e.profile_id === row.profile_id && e.kind === row.kind);
}

/** Llegó un DELETE por realtime (solo trae el id). */
export const applyDelete = <T extends { id: number }>(list: T[], id: number): T[] =>
  list.some(e => e.id === id) ? list.filter(e => e.id !== id) : list;

/** Respondió el insert: la fila provisoria pasa a tener su id real; si realtime ya había traído esa fila, se descarta la provisoria. */
export function settleInsert<T extends { id: number }>(list: T[], tmpId: number, realId: number): T[] {
  if (list.some(e => e.id === realId)) return list.filter(e => e.id !== tmpId);
  return list.map(e => e.id === tmpId ? { ...e, id: realId } : e);
}

// ---- Errores ----

/** Mensaje en español para un error de live_clock (o de la red). */
export function liveError(m: string): string {
  if (m.includes('Could not find the function') || m.includes('PGRST202'))
    return 'El partido en vivo todavía no está habilitado en el servidor. Avisale al admin técnico.';
  if (m.includes('forbidden') || m.includes('row-level security')) return 'Solo los admins pueden manejar el partido en vivo.';
  if (m.includes('cancelled')) return 'El partido está cancelado.';
  if (m.includes('live_over')) return 'El resultado ya está guardado: el partido terminó.';
  if (m.includes('too_early')) return 'Todavía falta para el partido: se puede iniciar hasta 2 horas antes.';
  if (m.includes('too_late')) return 'Ese partido ya pasó hace más de un día: cargá el resultado directamente.';
  if (m.includes('bad_state')) return 'El reloj ya cambió (puede que otro admin lo haya tocado). Mirá cómo quedó.';
  if (m.includes('bad_action')) return 'Esa acción no existe.';
  if (m.includes('Failed to fetch') || m.includes('NetworkError') || m.includes('Load failed')) return 'Sin conexión. Probá de nuevo.';
  return m;
}
