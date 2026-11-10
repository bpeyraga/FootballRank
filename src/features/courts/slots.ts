// Horarios y turnos de un complejo: lógica pura (sin Supabase, sin Preact, sin red). Todo en la hora local DEL COMPLEJO (columna tz):
// el servidor (complex_open_at) hace la misma cuenta, así que lo que acá aparece libre es lo que el servidor deja pedir.

export const DEFAULT_TZ = 'America/Argentina/Buenos_Aires';
/** Duraciones que se ofrecen (minutos). Cada complejo acepta solo los múltiplos de su turno (slot_minutes): ver durationOptions. */
export const DURATIONS = [60, 90, 120] as const;
/** Cuántos días hacia adelante se muestran en el selector (el servidor acepta hasta 60). */
export const HORIZON_DAYS = 14;
const MIN = 60_000;

/** Horario de un día (weekday: 0 = domingo). `opens`/`closes` vienen como "18:00" o "18:00:00". Si cierra <= abre, cierra al día siguiente. */
export interface HoursRow { weekday: number; opens: string; closes: string }
/** Ocupación pública de un horario (complex_busy): sin datos de nadie. */
export interface Busy { field_id: string; starts_at: string; ends_at: string; status: string }

export const DOW_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'] as const;
export const DOW_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'] as const;
export const MONTH_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] as const;
export const MONTH_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'] as const;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const pad = (n: number) => String(n).padStart(2, '0');

// ---------- Horas del día ----------

/** "18:30" o "18:30:00" → minutos desde la medianoche. NaN si no es una hora. */
export function parseClock(s: string): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(s ?? '');
  if (!m) return NaN;
  const h = +m[1], mi = +m[2];
  return h <= 24 && mi < 60 ? h * 60 + mi : NaN;
}

/** Minutos desde la medianoche → "18:30" (pasadas las 24 h vuelve a empezar: 1470 → "00:30"). */
export const fmtClock = (min: number): string => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
};

// ---------- Zona horaria (sin librerías: Intl) ----------

const dtfCache = new Map<string, Intl.DateTimeFormat>();
/** La zona si Intl la conoce; si no (dato raro en la base), la de Argentina. */
export function safeTz(tz: string | null | undefined): string {
  const z = tz?.trim() || DEFAULT_TZ;
  if (dtfCache.has(z)) return z;
  try {
    dtfCache.set(z, new Intl.DateTimeFormat('en-US', {
      timeZone: z, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric',
    }));
    return z;
  } catch { return z === DEFAULT_TZ ? z : safeTz(DEFAULT_TZ); }
}
const dtf = (tz: string) => dtfCache.get(safeTz(tz))!;

export interface Local { y: number; m: number; d: number; h: number; mi: number; /** 0 = domingo */ dow: number }

/** Fecha y hora de ese instante en la zona `tz`. */
export function localParts(ms: number, tz: string): Local {
  const p: Record<string, number> = {};
  for (const x of dtf(tz).formatToParts(new Date(ms))) if (x.type !== 'literal') p[x.type] = +x.value;
  return { y: p.year, m: p.month, d: p.day, h: p.hour % 24, mi: p.minute, dow: new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay() };
}

/** Cuánto se adelanta la hora de `tz` respecto de UTC en ese instante (ms). */
function offsetMs(ms: number, tz: string): number {
  const l = localParts(ms, tz);
  return Date.UTC(l.y, l.m - 1, l.d, l.h, l.mi) - Math.floor(ms / MIN) * MIN;
}

/** El instante en que, en `tz`, son las `min` (minutos desde la medianoche; puede pasar de 1440) del día y/m/d. */
export function zonedInstant(y: number, m: number, d: number, min: number, tz: string): number {
  const wall = Date.UTC(y, m - 1, d, 0, min);
  const guess = wall - offsetMs(wall, tz);
  return wall - offsetMs(guess, tz); // segunda pasada: acierta aun si cruza un cambio de horario
}

// ---------- Días ----------

export interface Day { key: string; y: number; m: number; d: number; dow: number; /** 0 = hoy */ offset: number }

export const dayKey = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** Hoy y los próximos n-1 días, según el calendario del complejo. */
export function nextDays(nowMs: number, tz: string, n = HORIZON_DAYS): Day[] {
  const t = localParts(nowMs, tz);
  return Array.from({ length: n }, (_, i) => {
    const u = new Date(Date.UTC(t.y, t.m - 1, t.d + i));
    const y = u.getUTCFullYear(), m = u.getUTCMonth() + 1, d = u.getUTCDate();
    return { key: dayKey(y, m, d), y, m, d, dow: u.getUTCDay(), offset: i };
  });
}

/** "Hoy", "Mañana" ("Mañ" si es corto) o "Vie". */
export const dayName = (day: Day, short = false): string =>
  day.offset === 0 ? 'Hoy' : day.offset === 1 ? (short ? 'Mañ' : 'Mañana') : cap(DOW_SHORT[day.dow]);
/** "viernes 14 de noviembre". */
export const dayLong = (day: Pick<Day, 'dow' | 'd' | 'm'>): string => `${DOW_LONG[day.dow]} ${day.d} de ${MONTH_LONG[day.m - 1]}`;

/** Rango (ISO) que hay que pedirle a complex_busy para un día: de su medianoche a la de pasado mañana (cubre lo que cierra después de las 24 h). */
export function busyRange(day: Day, tz: string): { from: string; to: string } {
  return {
    from: new Date(zonedInstant(day.y, day.m, day.d, 0, tz)).toISOString(),
    to: new Date(zonedInstant(day.y, day.m, day.d, 2 * 1440, tz)).toISOString(),
  };
}

// ---------- Horarios de apertura ----------

export interface OpenWindow { startMin: number; endMin: number }

/** Franja en que abre el complejo el día de la semana `dow` (minutos desde la medianoche; `endMin` > 1440 si cierra de madrugada). null si ese día no abre. */
export function openWindow(hours: HoursRow[], dow: number): OpenWindow | null {
  const h = hours.find(x => x.weekday === dow);
  if (!h) return null;
  const o = parseClock(h.opens), c = parseClock(h.closes);
  if (Number.isNaN(o) || Number.isNaN(c)) return null;
  return { startMin: o, endMin: c <= o ? c + 1440 : c };
}

/** ¿Está abierto en este momento? (cuenta también lo que sigue abierto de madrugada del día anterior). */
export function isOpenNow(hours: HoursRow[], tz: string, nowMs: number): boolean {
  const t = localParts(nowMs, tz);
  const min = t.h * 60 + t.mi;
  const today = openWindow(hours, t.dow);
  if (today && min >= today.startMin && min < today.endMin) return true;
  const yesterday = openWindow(hours, (t.dow + 6) % 7);
  return !!yesterday && min + 1440 < yesterday.endMin;
}

const ORDER = [1, 2, 3, 4, 5, 6, 0]; // lunes primero

export interface HoursGroup { label: string; text: string; today: boolean; closed: boolean }

/** Horarios de la semana para mostrar: "Lunes a viernes · 09:00 a 00:00", "Sábado y domingo · Cerrado"… (junta los días seguidos iguales). */
export function weekHours(hours: HoursRow[], todayDow: number): HoursGroup[] {
  const text = (dow: number) => {
    const w = openWindow(hours, dow);
    return w ? `${fmtClock(w.startMin)} a ${fmtClock(w.endMin)}` : 'Cerrado';
  };
  const runs: { days: number[]; text: string }[] = [];
  for (const dow of ORDER) {
    const t = text(dow), last = runs[runs.length - 1];
    if (last && last.text === t) last.days.push(dow); else runs.push({ days: [dow], text: t });
  }
  return runs.map(r => {
    const names = r.days.map(d => cap(DOW_LONG[d]));
    const label = names.length === 1 ? names[0] : names.length === 2 ? `${names[0]} y ${names[1].toLowerCase()}` : `${names[0]} a ${names[names.length - 1].toLowerCase()}`;
    return { label, text: r.text, today: r.days.includes(todayDow), closed: r.text === 'Cerrado' };
  });
}

// ---------- Turnos ----------

/** free: nadie lo pidió. pending: hay un pedido esperando respuesta (se puede pedir igual; decide el dueño). busy: ya está confirmado. */
export type SlotState = 'free' | 'pending' | 'busy';
export interface Slot { startMs: number; endMs: number; label: string; /** Arranca pasada la medianoche (sigue siendo el "día" del complejo). */ nextDay: boolean; state: SlotState }

export interface SlotsInput {
  day: Day; hours: HoursRow[]; tz: string; fieldId: string; busy: Busy[];
  /** Duración que se quiere reservar. */
  minutes: number;
  /** Cada cuántos minutos arranca un turno (la `slot_minutes` del complejo). */
  step: number;
  nowMs: number;
}

/**
 * Duraciones que se pueden pedir en un complejo: request_booking exige múltiplos de su turno (slot_minutes), así que
 * con turnos de 60 son 60 y 120; de 90, solo 90; de 120, solo 120; de 30, las tres.
 */
export function durationOptions(slotMinutes: number | null | undefined): number[] {
  const slot = Math.max(30, Math.round(Number(slotMinutes) || 60));
  const ok = DURATIONS.filter(m => m % slot === 0);
  return ok.length ? [...ok] : [slot];
}

/** Cada cuánto arrancan los turnos: la grilla del complejo, nunca menos de 30 minutos. */
export const stepOf = (slotMinutes: number | null | undefined): number => Math.max(30, Math.round(Number(slotMinutes) || 60));

/**
 * Lo que sigue abierto pasada la medianoche del día anterior, cuando `day` es hoy y todavía no cerró
 * (lunes abre 18:00–02:00 y son las 00:30 del martes: queda el tramo de las 00:30 a las 02:00, que pertenece al lunes).
 */
function prevSpill(hours: HoursRow[], day: Day, nowMs: number, tz: string): OpenWindow | null {
  if (day.offset !== 0) return null;
  const w = openWindow(hours, (day.dow + 6) % 7);
  if (!w || w.endMin <= 1440) return null;
  const t = localParts(nowMs, tz);
  return t.h * 60 + t.mi + 1440 < w.endMin ? w : null;
}

/** ¿Hay horario para reservar ese día? Hoy cuenta también lo que el día anterior sigue abierto de madrugada. */
export const dayIsOpen = (hours: HoursRow[], day: Day, nowMs: number, tz: string): boolean =>
  !!openWindow(hours, day.dow) || !!prevSpill(hours, day, nowMs, tz);

/**
 * Turnos de una cancha en un día: desde que abre, cada `step` minutos, mientras entren `minutes` antes de que cierre.
 * Los que ya empezaron no aparecen. El estado sale de lo ocupado que informa complex_busy.
 * Hoy se suman, al principio, los turnos de madrugada que todavía quedan del horario del día anterior.
 */
export function buildSlots(o: SlotsInput): Slot[] {
  if (!(o.minutes > 0)) return [];
  const step = stepOf(o.step);
  const taken = o.busy.filter(b => b.field_id === o.fieldId)
    .map(b => ({ s: Date.parse(b.starts_at), e: Date.parse(b.ends_at), confirmed: b.status === 'confirmed' }));
  const out: Slot[] = [];
  // `dayOffset`: 0 = el día mismo; -1 = el día anterior (sus turnos pasada la medianoche caen hoy).
  const add = (w: OpenWindow, dayOffset: number) => {
    // El servidor solo acepta turnos que arrancan en punto o y media: si el complejo abre a las 18:15, el primero es a las 18:30.
    for (let m = Math.ceil(w.startMin / 30) * 30; m + o.minutes <= w.endMin; m += step) {
      const startMs = zonedInstant(o.day.y, o.day.m, o.day.d + dayOffset, m, o.tz);
      if (startMs <= o.nowMs + MIN) continue; // ya pasó (el servidor rechaza lo que ya empezó)
      const endMs = startMs + o.minutes * MIN;
      let state: SlotState = 'free';
      for (const b of taken) {
        if (b.s < endMs && b.e > startMs) { if (b.confirmed) { state = 'busy'; break; } state = 'pending'; }
      }
      out.push({ startMs, endMs, label: fmtClock(m), nextDay: dayOffset === 0 && m >= 1440, state });
    }
  };
  const spill = prevSpill(o.hours, o.day, o.nowMs, o.tz);
  if (spill) add(spill, -1);
  const w = openWindow(o.hours, o.day.dow);
  if (w) add(w, 0);
  return out;
}

/** Primer día (índice en `days`) en que todavía queda algún turno por horarios (sin mirar lo ocupado). -1 si ninguno. */
export function firstBookableDay(days: Day[], o: Omit<SlotsInput, 'day' | 'fieldId' | 'busy'>): number {
  return days.findIndex(day => buildSlots({ ...o, day, fieldId: '', busy: [] }).length > 0);
}

/** "21:00 a 22:30" en la hora del complejo. */
export function fmtRange(startMs: number, endMs: number, tz: string): string {
  const a = localParts(startMs, tz), b = localParts(endMs, tz);
  return `${pad(a.h)}:${pad(a.mi)} a ${pad(b.h)}:${pad(b.mi)}`;
}

/** "jue 12 nov, 21:00" en la zona dada (sin Intl de idioma: sale igual en todos los navegadores). */
export function fmtWhen(ms: number, tz: string): string {
  const l = localParts(ms, tz);
  return `${DOW_SHORT[l.dow]} ${l.d} ${MONTH_SHORT[l.m - 1]}, ${pad(l.h)}:${pad(l.mi)}`;
}

/** Minutos entre dos instantes ISO. */
export const minutesBetween = (startIso: string, endIso: string) => Math.round((Date.parse(endIso) - Date.parse(startIso)) / MIN);
/** 90 → "1 h 30", 120 → "2 h", 60 → "1 h". */
export const fmtDuration = (min: number) => {
  const h = Math.floor(min / 60), m = min % 60;
  return h ? (m ? `${h} h ${pad(m)}` : `${h} h`) : `${m} min`;
};

/** La fecha de hoy ("2026-11-12") en la zona del complejo: cambia a la medianoche de ahí. */
export const todayKey = (nowMs: number, tz: string): string => {
  const t = localParts(nowMs, tz);
  return dayKey(t.y, t.m, t.d);
};
