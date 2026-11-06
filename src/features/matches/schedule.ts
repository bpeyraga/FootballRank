// Partido fijo semanal: textos, vista previa de la próxima fecha y validación del formulario. Puro (sin Supabase).
import { feeNum, money } from './fees';

/** Una fila de match_schedules (weekday: 0 = domingo … 6 = sábado, como extract(dow)). */
export interface Schedule {
  id: string; community_id: string; weekday: number; at_time: string; tz: string; title: string;
  venue_id: string | null; location: string | null; slots: number; fee_total: number | string | null;
  open_days_before: number; active: boolean; created_by: string | null;
  venue?: { name: string } | null; // viene de select('*, venue:venues(name)')
}

export const SCHEDULE_COLS = '*, venue:venues(name)';

/** Los chips del formulario, de lunes a domingo; `d` es el weekday de la base. */
export const WEEKDAY_CHIPS = [
  { d: 1, label: 'Lun' }, { d: 2, label: 'Mar' }, { d: 3, label: 'Mié' }, { d: 4, label: 'Jue' },
  { d: 5, label: 'Vie' }, { d: 6, label: 'Sáb' }, { d: 0, label: 'Dom' },
] as const;
const DAY_PLURAL = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];
const DAY_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MONTH_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** "21:00:00" → "21:00" */
export const hhmm = (t: string) => t.slice(0, 5);

/** "jue 12 de nov" */
export const shortDate = (d: Date) => `${DAY_SHORT[d.getDay()]} ${d.getDate()} de ${MONTH_SHORT[d.getMonth()]}`;

/** "Todos los jueves 21:00" */
export const whenText = (s: Pick<Schedule, 'weekday' | 'at_time'>) => `Todos los ${DAY_PLURAL[s.weekday] ?? '?'} ${hhmm(s.at_time)}`;

/** La cancha del horario: la guardada o, si no, el lugar escrito. */
export const placeOf = (s: Pick<Schedule, 'venue' | 'location'>) => s.venue?.name?.trim() || s.location?.trim() || null;

/** "Todos los jueves 21:00 · Doble 5 · 10 cupos · cancha $30.000" */
export function scheduleLine(s: Schedule): string {
  const fee = feeNum(s.fee_total), place = placeOf(s);
  return [whenText(s), place, `${s.slots} cupos`, fee != null ? `cancha ${money(fee)}` : null].filter(Boolean).join(' · ');
}

/** Línea de solo lectura para los miembros: "Partido fijo: todos los jueves 21:00 en Doble 5" */
export function memberLine(s: Schedule): string {
  const place = placeOf(s), w = whenText(s);
  return `Partido fijo: ${w.charAt(0).toLowerCase()}${w.slice(1)}${place ? ` en ${place}` : ''}`;
}

/** "Se crea sola 6 días antes" */
export const opensText = (n: number) =>
  n <= 0 ? 'Se crea sola el mismo día' : `Se crea sola ${n} ${n === 1 ? 'día' : 'días'} antes`;

/** Próxima fecha (hora local del aparato) de ese día de la semana y hora, siempre posterior a `now`. */
export function nextOccurrence(weekday: number, time: string, now = new Date()): Date {
  const [h, m] = hhmm(time).split(':').map(Number);
  const d = new Date(now);
  d.setHours(h || 0, m || 0, 0, 0);
  d.setDate(d.getDate() + ((weekday - d.getDay() + 7) % 7));
  if (+d <= +now) d.setDate(d.getDate() + 7);
  return d;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Vista previa del formulario: "Próxima fecha: jue 12 de nov, 21:00. La convocatoria se crea el lun 9 de nov." */
export function previewText(weekday: number, time: string, openDaysBefore: number, now = new Date()): string {
  const next = nextOccurrence(weekday, time, now);
  const opens = startOfDay(next);
  opens.setDate(opens.getDate() - Math.max(0, openDaysBefore));
  const when = `Próxima fecha: ${shortDate(next)}, ${hhmm(time)}.`;
  return +opens <= +startOfDay(now)
    ? `${when} La convocatoria se crea apenas la guardes.`
    : `${when} La convocatoria se crea el ${shortDate(opens)}.`;
}

/** Lo que se completa en el formulario (todo texto, como los inputs). */
export interface ScheduleForm { title: string; weekday: number; time: string; slots: string; fee: string; open: string }

export const emptyScheduleForm = (): ScheduleForm => ({ title: 'Partido', weekday: 4, time: '21:00', slots: '10', fee: '', open: '6' });

export const formOf = (s: Schedule): ScheduleForm => ({
  title: s.title, weekday: s.weekday, time: hhmm(s.at_time), slots: String(s.slots),
  fee: feeNum(s.fee_total) != null ? String(Math.round(feeNum(s.fee_total)!)) : '', open: String(s.open_days_before),
});

/** Error en español (o '' si está todo bien). */
export function formError(f: ScheduleForm): string {
  if (!f.title.trim() || f.title.trim().length > 80) return 'El título tiene que tener entre 1 y 80 caracteres.';
  if (!Number.isInteger(f.weekday) || f.weekday < 0 || f.weekday > 6) return 'Elegí el día de la semana.';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(f.time)) return 'Elegí una hora válida.';
  const slots = +f.slots;
  if (!Number.isInteger(slots) || slots < 2 || slots > 40) return 'Los cupos tienen que ser entre 2 y 40.';
  const open = +f.open;
  if (f.open.trim() === '' || !Number.isInteger(open) || open < 0 || open > 13) return 'La convocatoria se crea entre 0 y 13 días antes.';
  if (f.fee.trim() !== '') {
    const fee = +f.fee;
    if (!Number.isFinite(fee) || fee < 0 || fee > 10_000_000) return 'El costo de la cancha tiene que estar entre $0 y $10.000.000.';
  }
  return '';
}

/** Columnas a guardar (sin community_id ni created_by). `venue` es el id elegido y `place` su nombre (va también a `location`). */
export function schedulePayload(f: ScheduleForm, venue: { id: string | null; name: string | null }) {
  const fee = f.fee.trim() === '' ? null : Math.round(+f.fee);
  return {
    title: f.title.trim(), weekday: f.weekday, at_time: f.time, slots: Math.round(+f.slots),
    fee_total: fee && fee > 0 ? fee : null, open_days_before: Math.round(+f.open),
    venue_id: venue.id, location: venue.name,
  };
}

/** Mensaje en español para los errores de guardar / pausar / borrar un horario. */
export function scheduleError(m: string): string {
  if (m.includes('row-level security') || m.includes('forbidden')) return 'Solo los admins pueden cambiar el partido fijo.';
  if (m.includes('violates check constraint') || m.includes('invalid input syntax')) return 'Revisá los datos: hay un valor inválido.';
  if (m.includes('Failed to fetch') || m.includes('NetworkError')) return 'Sin conexión. Probá de nuevo.';
  return m;
}
