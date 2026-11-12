// Dueños de cancha: tipos y lógica pura (horarios, agenda, turnos, validaciones). No toca Supabase ni el DOM: se testea sin red.
// Hora: todo se calcula en la zona horaria del complejo (`tz`), no en la del navegador. Un "día de agenda" es el día comercial:
// si el complejo cierra pasada la medianoche (18:00 → 02:00), el turno de las 01:00 pertenece al día anterior.

export const DEFAULT_TZ = 'America/Argentina/Buenos_Aires';

// ---------- Tipos ----------
export type BookingStatus = 'pending' | 'confirmed' | 'rejected' | 'cancelled';
export type BookingKind = 'request' | 'block';
/** Quién canceló: 'requester' = quien pidió el turno, 'staff' = el complejo (dueño o encargado). */
export type CancelRole = 'requester' | 'staff';
export type Surface = 'sintetico' | 'cesped' | 'cemento' | 'parquet';

export interface Complex {
  id: string; name: string; description: string | null; address: string | null; city: string | null;
  lat: number | null; lng: number | null; maps_url: string | null; phone: string | null; whatsapp: string | null;
  photo_url: string | null; amenities: string[]; slot_minutes: number; tz: string; active: boolean; created_at: string;
}
export interface Field {
  id: string; complex_id: string; name: string; size: number; surface: Surface; roofed: boolean; price: number | null; active: boolean;
}
/** Una fila de complex_hours: weekday 0 = domingo; opens/closes "HH:MM" (o "HH:MM:SS"). Un día sin fila está cerrado. */
export interface HoursRow { weekday: number; opens: string; closes: string }
export interface Booking {
  id: string; field_id: string; starts_at: string; ends_at: string; status: BookingStatus; kind: BookingKind;
  note: string | null; owner_note: string | null; price: number | null;
  requester_id: string | null; requester_name: string | null; requester_photo: string | null; community_name: string | null; created_at: string;
  /** Quién la canceló y cuándo se decidió (migración 20261114500000). Ausentes si la base todavía no la tiene o si la cancelación es anterior: no se muestra quién. */
  cancelled_by?: string | null; cancelled_by_name?: string | null; cancel_role?: CancelRole | null; decided_at?: string | null;
}
export interface Overview { complex_id: string; pending: number; today: number }
/** Un complejo con sus canchas y horarios (lo que carga el panel). */
export interface ComplexData { complex: Complex; fields: Field[]; hours: HoursRow[] }

// ---------- Catálogos ----------
export const FIELD_SIZES = [5, 6, 7, 8, 9, 11] as const;
export const sizeLabel = (n: number) => `F${n}`;
export const SURFACES: { key: Surface; label: string }[] = [
  { key: 'sintetico', label: 'Sintético' }, { key: 'cesped', label: 'Césped natural' },
  { key: 'cemento', label: 'Cemento' }, { key: 'parquet', label: 'Parquet' },
];
export const surfaceLabel = (s: string) => SURFACES.find(x => x.key === s)?.label ?? s;
export const SLOT_OPTIONS = [30, 60, 90, 120] as const;

export const AMENITIES: { key: string; label: string; icon: string }[] = [
  { key: 'vestuarios', label: 'Vestuarios', icon: '🚪' }, { key: 'duchas', label: 'Duchas', icon: '🚿' },
  { key: 'estacionamiento', label: 'Estacionamiento', icon: '🅿️' }, { key: 'bar', label: 'Bar / buffet', icon: '🍺' },
  { key: 'parrilla', label: 'Parrilla', icon: '🔥' }, { key: 'wifi', label: 'Wi-Fi', icon: '📶' },
  { key: 'iluminacion', label: 'Iluminación', icon: '💡' }, { key: 'pecheras', label: 'Pecheras', icon: '🎽' },
  { key: 'accesible', label: 'Accesible', icon: '♿' },
];

/** Lunes primero (como se lee en Argentina); el número es el de la base (0 = domingo). */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
export const WEEKDAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export const WEEKDAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export const STATUS_LABEL: Record<BookingStatus, string> = {
  pending: 'Pendiente', confirmed: 'Confirmado', rejected: 'Rechazado', cancelled: 'Cancelado',
};

// ---------- Fechas y horas en la zona del complejo ----------
const fmtCache = new Map<string, Intl.DateTimeFormat>();
function parts(tz: string, ms: number): Record<string, number> {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    fmtCache.set(tz, f);
  }
  const o: Record<string, number> = {};
  for (const p of f.formatToParts(new Date(ms))) if (p.type !== 'literal') o[p.type] = +p.value;
  return o;
}
/** Cuánto se adelanta la hora local de `tz` respecto de UTC en ese instante (ms). */
function offsetMs(tz: string, ms: number): number {
  const p = parts(tz, ms);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}
const pad = (n: number) => String(n).padStart(2, '0');

/** Día local ("2026-11-12"), minutos desde la medianoche local y día de la semana (0 = domingo) de un instante. */
export function localParts(ms: number, tz: string = DEFAULT_TZ): { date: string; minutes: number; weekday: number } {
  const p = parts(tz, ms);
  const date = `${p.year}-${pad(p.month)}-${pad(p.day)}`;
  return { date, minutes: (p.hour % 24) * 60 + p.minute, weekday: weekdayOf(date) };
}
/** Instante (ms UTC) de "las `minutes` minutos del día local `date`" (acepta minutes > 1440: pasada la medianoche). */
export function zonedToUtc(date: string, minutes: number, tz: string = DEFAULT_TZ): number {
  const [y, m, d] = date.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  let t = guess - offsetMs(tz, guess);
  const again = guess - offsetMs(tz, t);
  if (again !== t) t = again;
  return t;
}
const asUtc = (date: string) => { const [y, m, d] = date.split('-').map(Number); return Date.UTC(y, m - 1, d, 12); };
export const weekdayOf = (date: string): number => new Date(asUtc(date)).getUTCDay();
export function addDays(date: string, n: number): string {
  const d = new Date(asUtc(date) + n * 86_400_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
/** Lunes de la semana de `date`. */
export const startOfWeek = (date: string): string => addDays(date, -((weekdayOf(date) + 6) % 7));
export const today = (tz: string = DEFAULT_TZ, nowMs = Date.now()): string => localParts(nowMs, tz).date;
export const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && addDays(s, 0) === s;

/** "18:30" / "18:30:00" → 1110. null si no es una hora. */
export function parseHHMM(s: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec((s ?? '').trim());
  if (!m) return null;
  const h = +m[1], min = +m[2];
  return h < 24 && min < 60 ? h * 60 + min : null;
}
/** 1110 → "18:30"; pasada la medianoche (1500) → "01:00". */
export const fmtHHMM = (minutes: number): string => `${pad(Math.floor(minutes / 60) % 24)}:${pad(((minutes % 60) + 60) % 60)}`;
/**
 * Una hora de la agenda (minutos desde la medianoche del día de agenda; pasa de 1440 en la madrugada de un local que cierra a las 02:00)
 * como día calendario y "HH:MM": 1500 minutos del jueves son las 01:00 del viernes.
 */
export function minuteToLocal(date: string, minutes: number): { date: string; time: string } {
  const days = Math.floor(minutes / 1440);
  return { date: addDays(date, days), time: fmtHHMM(minutes - days * 1440) };
}
export const hhmm = (s: string): string => { const m = parseHHMM(s); return m === null ? s : fmtHHMM(m); };

export const fmtDuration = (min: number): string => {
  const h = Math.floor(min / 60), m = min % 60;
  return h && m ? `${h} h ${m}` : h ? `${h} h` : `${m} min`;
};
const dayFmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', ...opts });
/** "jueves 12 de noviembre" */
export const fmtDayLong = (date: string) => dayFmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(asUtc(date));
/** "12 nov" */
export const fmtDayShort = (date: string) => dayFmt({ day: 'numeric', month: 'short' }).format(asUtc(date)).replace('.', '');
/** "jue 12" */
export const fmtDayChip = (date: string) => `${WEEKDAY_SHORT[weekdayOf(date)]} ${+date.slice(8)}`;
/** "21:00 – 22:30" en la hora del complejo. */
export function fmtRange(startMs: number, endMs: number, tz: string = DEFAULT_TZ): string {
  return `${fmtHHMM(localParts(startMs, tz).minutes)} – ${fmtHHMM(localParts(endMs, tz).minutes)}`;
}
/** "$ 20.000" */
export const fmtPrice = (n: number | null | undefined): string =>
  n === null || n === undefined || Number.isNaN(+n) ? '' : `$ ${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(+n)}`;

// ---------- Horarios de apertura ----------
export interface DayHours { open: number; close: number }
/** Apertura y cierre en minutos desde la medianoche del día; `close` > 1440 si cierra pasada la medianoche. null = cerrado. */
export function dayHours(hours: HoursRow[], weekday: number): DayHours | null {
  const r = hours.find(h => h.weekday === weekday);
  if (!r) return null;
  const open = parseHHMM(r.opens), close0 = parseHHMM(r.closes);
  if (open === null || close0 === null) return null;
  return { open, close: close0 <= open ? close0 + 1440 : close0 };
}

export interface HoursDraftDay { open: boolean; opens: string; closes: string }
export type HoursDraft = Record<number, HoursDraftDay>;
export const DEFAULT_OPENS = '09:00', DEFAULT_CLOSES = '00:00';

export function hoursToDraft(rows: HoursRow[]): HoursDraft {
  const d: HoursDraft = {};
  for (let w = 0; w < 7; w++) {
    const r = rows.find(x => x.weekday === w);
    d[w] = r ? { open: true, opens: hhmm(r.opens), closes: hhmm(r.closes) } : { open: false, opens: DEFAULT_OPENS, closes: DEFAULT_CLOSES };
  }
  return d;
}
export function draftToRows(d: HoursDraft): HoursRow[] {
  return WEEK_ORDER.filter(w => d[w]?.open).map(w => ({ weekday: w, opens: d[w].opens, closes: d[w].closes }));
}
/** Copia el horario de un día a los demás (o solo a los de `to`). */
export function copyDay(d: HoursDraft, from: number, to: readonly number[] = [0, 1, 2, 3, 4, 5, 6]): HoursDraft {
  const out = { ...d };
  for (const w of to) if (w !== from) out[w] = { ...d[from] };
  return out;
}
export function hoursError(d: HoursDraft): string | null {
  const days = WEEK_ORDER.filter(w => d[w]?.open);
  if (!days.length) return 'Marcá al menos un día en que abrís.';
  for (const w of days) {
    if (parseHHMM(d[w].opens) === null || parseHHMM(d[w].closes) === null) return `Revisá el horario del ${WEEKDAY_NAMES[w].toLowerCase()}.`;
  }
  return null;
}
/** "18:00 a 01:00" o "Cerrado" */
export function hoursLabel(day: HoursDraftDay | null | undefined): string {
  if (!day?.open) return 'Cerrado';
  const o = parseHHMM(day.opens), c = parseHHMM(day.closes);
  if (o !== null && c !== null && o === c) return 'Las 24 horas';
  return `${hhmm(day.opens)} a ${hhmm(day.closes)}`;
}
/** Resumen para listas: "Todos los días 09:00 a 00:00" / "Lun a Vie 18:00 a 01:00 · …" */
export function hoursSummary(rows: HoursRow[]): string {
  if (!rows.length) return 'Sin horarios cargados';
  const draft = hoursToDraft(rows);
  const groups: { days: number[]; label: string }[] = [];
  const idx = (w: number) => (WEEK_ORDER as readonly number[]).indexOf(w);
  for (const w of WEEK_ORDER) {
    if (!draft[w].open) continue;
    const label = hoursLabel(draft[w]);
    const last = groups[groups.length - 1];
    if (last && last.label === label && idx(last.days[last.days.length - 1]) === idx(w) - 1) last.days.push(w);
    else groups.push({ days: [w], label });
  }
  if (groups.length === 1 && groups[0].days.length === 7) return `Todos los días ${groups[0].label}`;
  return groups.map(g => `${g.days.length === 1 ? WEEKDAY_SHORT[g.days[0]] : `${WEEKDAY_SHORT[g.days[0]]} a ${WEEKDAY_SHORT[g.days[g.days.length - 1]]}`} ${g.label}`).join(' · ');
}

// ---------- Turnos en la agenda ----------
export interface Slot { id: string; fieldId: string; startMs: number; endMs: number; booking: Booking }

export const startMs = (b: Pick<Booking, 'starts_at'>) => new Date(b.starts_at).getTime();
export const endMs = (b: Pick<Booking, 'ends_at'>) => new Date(b.ends_at).getTime();
export const durationMin = (b: Pick<Booking, 'starts_at' | 'ends_at'>) => Math.round((endMs(b) - startMs(b)) / 60_000);
const overlaps = (a: Booking, b: Booking) => a.field_id === b.field_id && startMs(a) < endMs(b) && endMs(a) > startMs(b);

/** Activos en la agenda: confirmados (incluye bloqueos) y pendientes. */
export const isActive = (b: Pick<Booking, 'status'>) => b.status === 'pending' || b.status === 'confirmed';
export const isBlock = (b: Pick<Booking, 'kind'>) => b.kind === 'block';

/** El pedido pendiente se pisa con un turno confirmado de la misma cancha: no se puede aceptar. */
export function pendingConflict(b: Booking, all: Booking[]): Booking | null {
  if (b.status !== 'pending') return null;
  return all.find(o => o.id !== b.id && o.status === 'confirmed' && overlaps(b, o)) ?? null;
}
/** Otros pedidos pendientes que piden el mismo horario (aceptar uno deja a los otros sin lugar). */
export const competingPending = (b: Booking, all: Booking[]): Booking[] =>
  b.status !== 'pending' ? [] : all.filter(o => o.id !== b.id && o.status === 'pending' && overlaps(b, o));

/** Día de agenda (día comercial) y posición en minutos desde la medianoche de ese día. */
export function placeBooking(b: Pick<Booking, 'starts_at' | 'ends_at'>, hours: HoursRow[], tz: string = DEFAULT_TZ): { date: string; start: number; end: number } {
  const s = localParts(startMs(b), tz);
  const dur = durationMin(b);
  // ¿Cae dentro del horario de ayer pasado de medianoche? Entonces es de la agenda de ayer.
  const prevDate = addDays(s.date, -1);
  const prev = dayHours(hours, weekdayOf(prevDate));
  if (prev && prev.close > 1440 && s.minutes < prev.close - 1440) {
    const start = s.minutes + 1440;
    return { date: prevDate, start, end: start + dur };
  }
  return { date: s.date, start: s.minutes, end: s.minutes + dur };
}

export interface DayWindow { date: string; start: number; end: number; closed: boolean }
/**
 * Tramo que dibuja la agenda de un día: del horario de apertura, ampliado (a horas enteras) si hay turnos fuera de él.
 * Si el día está cerrado y no hay turnos, `closed` y una ventana de ejemplo.
 */
export function dayWindow(date: string, hours: HoursRow[], placed: { start: number; end: number }[]): DayWindow {
  const h = dayHours(hours, weekdayOf(date));
  // Cerrado y sin turnos: una ventana de ejemplo (la pantalla dice "cerrado"). Cerrado con turnos: lo que ocupan.
  let start = h?.open ?? (placed.length ? Infinity : 10 * 60), end = h?.close ?? (placed.length ? -Infinity : 22 * 60);
  for (const p of placed) { start = Math.min(start, p.start); end = Math.max(end, p.end); }
  start = Math.floor(start / 60) * 60; end = Math.ceil(end / 60) * 60;
  return { date, start, end, closed: !h && !placed.length };
}

/** Turnos de un día de agenda (activos o no), ordenados por hora. */
export function bookingsOfDay(date: string, all: Booking[], hours: HoursRow[], tz: string = DEFAULT_TZ) {
  return all
    .map(b => ({ b, pos: placeBooking(b, hours, tz) }))
    .filter(x => x.pos.date === date)
    .sort((x, y) => x.pos.start - y.pos.start || x.b.created_at.localeCompare(y.b.created_at));
}
/** Agrupa por día de agenda (para la vista de semana y la lista de pedidos). */
export function groupByDay(all: Booking[], hours: HoursRow[], tz: string = DEFAULT_TZ): Map<string, Booking[]> {
  const m = new Map<string, Booking[]>();
  for (const { b, pos } of all.map(b => ({ b, pos: placeBooking(b, hours, tz) })).sort((x, y) => x.pos.date.localeCompare(y.pos.date) || x.pos.start - y.pos.start)) {
    (m.get(pos.date) ?? m.set(pos.date, []).get(pos.date)!).push(b);
  }
  return m;
}

export interface Placed<T> { item: T; lane: number; lanes: number }
/** Reparte en carriles lo que se superpone en una misma columna (pendientes que se pisan se ven lado a lado). */
export function layoutLanes<T>(items: T[], range: (t: T) => [number, number]): Placed<T>[] {
  const sorted = [...items].sort((a, b) => range(a)[0] - range(b)[0] || range(a)[1] - range(b)[1]);
  const out: Placed<T>[] = [];
  let cluster: Placed<T>[] = [], clusterEnd = -Infinity;
  const laneEnds: number[] = [];
  const flush = () => { for (const p of cluster) p.lanes = laneEnds.length; out.push(...cluster); cluster = []; laneEnds.length = 0; };
  for (const item of sorted) {
    const [s, e] = range(item);
    if (s >= clusterEnd && cluster.length) { flush(); clusterEnd = -Infinity; }
    let lane = laneEnds.findIndex(le => le <= s);
    if (lane < 0) { lane = laneEnds.length; laneEnds.push(e); } else laneEnds[lane] = e;
    cluster.push({ item, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, e);
  }
  flush();
  return out;
}

/** Minuto del día al que apunta un toque a `offsetPx` del borde de arriba de la grilla, redondeado hacia abajo al paso del complejo. */
export function snapMinute(offsetPx: number, pxPerMin: number, windowStart: number, step: number): number {
  const raw = windowStart + Math.max(0, offsetPx) / pxPerMin;
  return Math.floor(raw / step) * step;
}

/** Tramos libres de una cancha en un día (entre `from` y `to`, en minutos), descontando los turnos activos. */
export function freeRanges(from: number, to: number, taken: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  let cur = from;
  for (const [s, e] of [...taken].sort((a, b) => a[0] - b[0])) {
    if (s > cur) out.push([cur, Math.min(s, to)]);
    cur = Math.max(cur, e);
    if (cur >= to) break;
  }
  if (cur < to) out.push([cur, to]);
  return out.filter(([a, b]) => b > a);
}

/** Duraciones que se pueden ofrecer al bloquear: múltiplos del turno del complejo hasta 24 h (30 min mínimo). */
export function blockDurations(slot: number): number[] {
  const base = [slot, slot * 2, slot * 3, slot * 4, 360, 480, 720, 1440];
  return [...new Set(base)].filter(m => m % 30 === 0 && m <= 1440).sort((a, b) => a - b);
}

export interface Counts { pending: number; confirmed: number; blocks: number }
export function dayCounts(list: Booking[]): Counts {
  return list.reduce((c, b) => ({
    pending: c.pending + (b.status === 'pending' ? 1 : 0),
    confirmed: c.confirmed + (b.status === 'confirmed' && b.kind === 'request' ? 1 : 0),
    blocks: c.blocks + (b.status === 'confirmed' && b.kind === 'block' ? 1 : 0),
  }), { pending: 0, confirmed: 0, blocks: 0 });
}
/** Lo que se espera cobrar de los turnos confirmados (con precio). */
export const dayRevenue = (list: Booking[]): number =>
  list.reduce((s, b) => s + (b.status === 'confirmed' && b.kind === 'request' && b.price ? +b.price : 0), 0);

/** Pedidos para responder: pendientes que todavía no terminaron, los que empiezan antes primero. */
export const openRequests = (all: Booking[], nowMs: number): Booking[] =>
  all.filter(b => b.kind === 'request' && b.status === 'pending' && endMs(b) > nowMs).sort((a, b) => startMs(a) - startMs(b));

// ---------- Cancelaciones ----------
/** "hace 5 min", "hace 3 h", "hace 2 días"; pasada una semana, la fecha ("5 nov"). */
export function fmtAgo(ms: number, nowMs: number, tz: string = DEFAULT_TZ): string {
  const min = Math.floor((nowMs - ms) / 60_000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return d < 7 ? `hace ${d} día${d === 1 ? '' : 's'}` : fmtDayShort(localParts(ms, tz).date);
}
/** "jue 12 nov · 21:00 – 22:30" en la hora del complejo. */
export function fmtSlotWhen(startMs: number, endMs: number, tz: string = DEFAULT_TZ): string {
  const { date, weekday } = localParts(startMs, tz);
  return `${WEEKDAY_SHORT[weekday]} ${fmtDayShort(date)} · ${fmtRange(startMs, endMs, tz)}`;
}
/**
 * Quién canceló, para el dueño: "Cancelada por vos" / "Cancelada por Beto (quien la pidió)" / "Cancelada por Ana (del complejo)".
 * Sin nombre (se borró la cuenta) queda el rol; sin ningún dato (cancelaciones anteriores a la migración) es null: no se adivina.
 */
export function cancelledByLabel(b: Pick<Booking, 'status' | 'kind' | 'cancelled_by' | 'cancelled_by_name' | 'cancel_role'>, meId?: string | null): string | null {
  if (b.status !== 'cancelled') return null;
  const verb = isBlock(b) ? 'Liberado' : 'Cancelada';
  if (meId && b.cancelled_by === meId) return `${verb} por vos`;
  const name = b.cancelled_by_name?.trim();
  const role = b.cancel_role;
  const tag = role === 'requester' ? 'quien la pidió' : role === 'staff' ? 'del complejo' : '';
  if (name) return tag ? `${verb} por ${name} (${tag})` : `${verb} por ${name}`;
  if (role === 'requester') return `${verb} por quien la pidió`;
  if (role === 'staff') return `${verb} por el complejo`;
  return null;
}
/** Lo de arriba más cuándo: "Cancelada por Beto (quien la pidió) · hace 2 h". null si no se sabe quién. */
export function cancelledLine(b: Parameters<typeof cancelledByLabel>[0] & Pick<Booking, 'decided_at'>, meId: string | null | undefined, nowMs: number, tz: string = DEFAULT_TZ): string | null {
  const who = cancelledByLabel(b, meId);
  if (!who) return null;
  const at = b.decided_at ? Date.parse(b.decided_at) : NaN;
  return Number.isFinite(at) ? `${who} · ${fmtAgo(at, nowMs, tz)}` : who;
}

export const RECENT_CANCEL_DAYS = 7;
/**
 * Cancelaciones recientes que el dueño tiene que ver: las que hizo quien pidió el turno (las del propio complejo ya las conoce) en los
 * últimos 7 días, de turnos que todavía no pasaron del todo (empezaron hace menos de un día o empiezan más adelante). Las más nuevas primero.
 */
export function recentCancellations(all: Booking[], nowMs: number): Booking[] {
  const since = nowMs - RECENT_CANCEL_DAYS * 86_400_000;
  const decided = (b: Booking) => (b.decided_at ? Date.parse(b.decided_at) : NaN);
  return all
    .filter(b => b.status === 'cancelled' && b.kind === 'request' && b.cancel_role === 'requester'
      && decided(b) >= since && startMs(b) >= nowMs - 86_400_000)
    .sort((a, b) => decided(b) - decided(a));
}

// ---------- Canchas ----------
export interface FieldDraft { name: string; size: number; surface: Surface; roofed: boolean; price: string; active: boolean }
export const emptyField = (n: number): FieldDraft => ({ name: `Cancha ${n}`, size: 5, surface: 'sintetico', roofed: false, price: '', active: true });
export const fieldToDraft = (f: Field): FieldDraft => ({
  name: f.name, size: f.size, surface: f.surface, roofed: f.roofed, price: f.price === null ? '' : String(+f.price), active: f.active,
});
export const parsePrice = (s: string): number | null | undefined => {
  const t = s.trim().replace(/[$\s]/g, '').replace(/\./g, '').replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n <= 10_000_000 ? Math.round(n * 100) / 100 : undefined;
};
export function fieldError(d: FieldDraft): string | null {
  if (!d.name.trim()) return 'Poné un nombre a la cancha.';
  if (d.name.trim().length > 40) return 'El nombre es muy largo (máximo 40).';
  if (!FIELD_SIZES.includes(d.size as any)) return 'Elegí el tamaño de la cancha.';
  if (parsePrice(d.price) === undefined) return 'El precio no es válido.';
  return null;
}
export const fieldLine = (f: Pick<Field, 'size' | 'surface' | 'roofed' | 'price'>, withSize = true): string =>
  [...(withSize ? [sizeLabel(f.size)] : []), surfaceLabel(f.surface), f.roofed ? 'Techada' : 'Descubierta', f.price !== null && f.price !== undefined ? `${fmtPrice(f.price)}/h` : 'Sin precio'].join(' · ');

// ---------- Datos del complejo ----------
/**
 * WhatsApp con código de país y solo dígitos (5491155551234). Heurística para números argentinos (saca el 0 y el 15, agrega el 549);
 * un número de otro país se deja como vino. null si no es un número. La pantalla muestra el resultado para que el dueño lo revise.
 */
export function normalizeWhatsapp(input: string): string | null {
  let d = input.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (!d) return null;
  // Número argentino sin el 54: código de área + abonado (10 dígitos), sin el 0 de larga distancia ni el 15 de celular.
  const national = (n: string): string => {
    n = n.replace(/^0+/, '');
    if (n.length === 12) for (const i of [2, 3, 4]) if (n.slice(i, i + 2) === '15') { n = n.slice(0, i) + n.slice(i + 2); break; }
    return n;
  };
  if (d.startsWith('54')) {
    let n = d.slice(2);
    if (n.startsWith('9')) n = n.slice(1);
    n = national(n);
    return n.length === 10 ? '549' + n : null;
  }
  const n = national(d);
  if (n.length === 10) return '549' + n;
  return d.length >= 8 && d.length <= 15 ? d : null;
}
export const whatsappLink = (num: string, text?: string) => `https://wa.me/${num}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
export const PHONE_RE = /^[0-9+ ()-]{6,25}$/;

export interface ComplexDraft {
  name: string; address: string; city: string; lat: number | null; lng: number | null; maps_url: string;
  phone: string; whatsapp: string; description: string;
}
export const emptyComplex = (): ComplexDraft => ({ name: '', address: '', city: '', lat: null, lng: null, maps_url: '', phone: '', whatsapp: '', description: '' });
export const complexToDraft = (c: Complex): ComplexDraft => ({
  name: c.name, address: c.address ?? '', city: c.city ?? '', lat: c.lat, lng: c.lng, maps_url: c.maps_url ?? '',
  phone: c.phone ?? '', whatsapp: c.whatsapp ?? '', description: c.description ?? '',
});
export function complexError(d: ComplexDraft): string | null {
  const name = d.name.trim();
  if (name.length < 2) return 'Poné el nombre del complejo (mínimo 2 letras).';
  if (name.length > 80) return 'El nombre es muy largo (máximo 80).';
  if (d.lat === null || d.lng === null) return 'Buscá tu barrio o ciudad para ubicar el complejo en el mapa.';
  if (d.address.trim().length > 160) return 'La dirección es muy larga.';
  if (d.phone.trim() && !PHONE_RE.test(d.phone.trim())) return 'El teléfono no es válido (solo números, +, espacios y guiones).';
  if (d.whatsapp.trim() && !normalizeWhatsapp(d.whatsapp)) return 'El WhatsApp no es válido. Escribilo con el código de área, por ejemplo 11 5555 1234.';
  if (d.description.length > 600) return 'La descripción es muy larga (máximo 600).';
  return null;
}

// ---------- Publicación ----------
export interface CheckItem { key: 'location' | 'fields' | 'hours' | 'contact' | 'photo'; label: string; ok: boolean; required: boolean; tab: string }
/** Qué le falta al complejo para aparecer en el buscador de canchas. */
export function setupChecklist(c: Complex, fields: Field[], hours: HoursRow[]): CheckItem[] {
  return [
    { key: 'location', label: 'Ubicación en el mapa', ok: c.lat !== null && c.lng !== null, required: true, tab: 'datos' },
    { key: 'fields', label: 'Al menos una cancha activa', ok: fields.some(f => f.active), required: true, tab: 'canchas' },
    { key: 'hours', label: 'Horarios de apertura', ok: hours.length > 0, required: true, tab: 'horarios' },
    { key: 'contact', label: 'Teléfono o WhatsApp', ok: !!(c.phone || c.whatsapp), required: false, tab: 'datos' },
    { key: 'photo', label: 'Foto del complejo', ok: !!c.photo_url, required: false, tab: 'datos' },
  ];
}
export const isPublished = (items: CheckItem[], active: boolean) => active && items.filter(i => i.required).every(i => i.ok);

// ---------- Errores ----------
const ERRORS: [RegExp, string][] = [
  [/slot_taken|bookings_no_overlap|conflicting key value/, 'Ese horario ya está ocupado por un turno confirmado.'],
  [/forbidden|row-level security|permission denied/, 'No tenés permiso para hacer esto.'],
  [/not_pending/, 'Ese pedido ya fue respondido o cancelado.'],
  [/not_active/, 'Ese turno ya no está activo.'],
  [/\bpast\b/, 'Ese turno ya pasó: no se puede hacer eso. Si es un pedido vencido, rechazalo.'],
  [/bad_duration/, 'La duración no es válida.'],
  [/too_far/, 'La fecha es demasiado lejana.'],
  [/too_many/, 'Llegaste al máximo de complejos por cuenta (10).'],
  [/bad_name/, 'El nombre del complejo no es válido (entre 2 y 80 letras).'],
  [/bad_coords/, 'La ubicación no es válida. Buscala de nuevo.'],
  [/bad_maps_url/, 'El link de Google Maps no es válido.'],
  [/bad_phone/, 'El teléfono no es válido.'],
  [/bad_whatsapp/, 'El WhatsApp no es válido.'],
  [/bad_description/, 'La descripción es muy larga.'],
  [/bad_amenities/, 'Alguno de los servicios no es válido.'],
  [/bad_slot/, 'La duración del turno no es válida.'],
  [/bad_hours/, 'Los horarios no son válidos. Revisalos.'],
  [/bad_photo/, 'La foto no es válida. Probá con otra.'],
  [/PGRST202|PGRST205|Could not find the (function|table)|does not exist|schema cache/, 'Esta función todavía no está disponible. Probá de nuevo más tarde.'],
  [/Failed to fetch|NetworkError|Load failed|network/i, 'No hay conexión. Revisala y probá de nuevo.'],
];
export function ownerErrorText(e: unknown): string {
  const msg = typeof e === 'string' ? e : (e as { message?: string })?.message ?? '';
  for (const [re, text] of ERRORS) if (re.test(msg)) return text;
  return msg ? `No pudimos completar la acción. ${msg}` : 'No pudimos completar la acción. Probá de nuevo.';
}
/** ¿Falta la migración de complejos en la base? (para mostrar un aviso en vez de un error técnico) */
export const isMissingOwnerApi = (e: unknown): boolean => /PGRST202|PGRST205|Could not find the (function|table)|schema cache/.test((e as { message?: string })?.message ?? '');

// ---------- Rutas del panel ----------
export const TABS = [
  { id: 'agenda', label: 'Agenda' }, { id: 'pedidos', label: 'Pedidos' }, { id: 'canchas', label: 'Canchas' },
  { id: 'horarios', label: 'Horarios' }, { id: 'datos', label: 'Datos' },
] as const;
export type TabId = typeof TABS[number]['id'];
export const isTab = (s: string | undefined): s is TabId => TABS.some(t => t.id === s);
