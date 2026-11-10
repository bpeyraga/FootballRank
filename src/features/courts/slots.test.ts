import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TZ, buildSlots, busyRange, dayLong, dayName, durationOptions, firstBookableDay, fmtClock, fmtDuration, fmtRange, fmtWhen, isOpenNow, localParts, minutesBetween,
  dayIsOpen, nextDays, openWindow, parseClock, safeTz, stepOf, todayKey, weekHours, zonedInstant, type Busy, type HoursRow,
} from './slots';

const AR = 'America/Argentina/Buenos_Aires';
/** Hora de Argentina (UTC-3, sin horario de verano) → instante. */
const ar = (y: number, m: number, d: number, h = 0, mi = 0) => Date.UTC(y, m - 1, d, h + 3, mi);
const iso = (ms: number) => new Date(ms).toISOString();
/** Abre todos los días de 09:00 a 00:00. */
const DAILY: HoursRow[] = [0, 1, 2, 3, 4, 5, 6].map(weekday => ({ weekday, opens: '09:00:00', closes: '00:00:00' }));
// Martes 10/11/2026 12:00 (hora de Argentina)
const NOW = ar(2026, 11, 10, 12, 0);

describe('horas del día', () => {
  it('parseClock acepta HH:MM y HH:MM:SS, y rechaza lo raro', () => {
    expect(parseClock('18:30')).toBe(1110);
    expect(parseClock('09:00:00')).toBe(540);
    expect(parseClock('00:00')).toBe(0);
    expect(parseClock('24:00')).toBe(1440);
    expect(Number.isNaN(parseClock('x'))).toBe(true);
    expect(Number.isNaN(parseClock('25:00'))).toBe(true);
    expect(Number.isNaN(parseClock('10:75'))).toBe(true);
  });
  it('fmtClock vuelve a empezar pasadas las 24 h', () => {
    expect(fmtClock(1110)).toBe('18:30');
    expect(fmtClock(1440)).toBe('00:00');
    expect(fmtClock(1470)).toBe('00:30');
  });
  it('fmtDuration y minutesBetween', () => {
    expect(fmtDuration(60)).toBe('1 h');
    expect(fmtDuration(90)).toBe('1 h 30');
    expect(fmtDuration(120)).toBe('2 h');
    expect(fmtDuration(45)).toBe('45 min');
    expect(minutesBetween('2026-11-12T00:00:00Z', '2026-11-12T01:30:00Z')).toBe(90);
  });
});

describe('zona horaria', () => {
  it('Argentina: 21:00 locales son las 00:00 UTC del día siguiente', () => {
    expect(zonedInstant(2026, 11, 12, 21 * 60, AR)).toBe(Date.UTC(2026, 10, 13, 0, 0));
    expect(localParts(Date.UTC(2026, 10, 13, 0, 0), AR)).toEqual({ y: 2026, m: 11, d: 12, h: 21, mi: 0, dow: 4 });
  });
  it('minutos pasados de 1440 caen al día siguiente', () => {
    expect(zonedInstant(2026, 11, 12, 1470, AR)).toBe(ar(2026, 11, 13, 0, 30));
  });
  it('respeta el horario de verano de otras zonas', () => {
    const NY = 'America/New_York';
    expect(zonedInstant(2026, 3, 7, 12 * 60, NY)).toBe(Date.UTC(2026, 2, 7, 17, 0)); // EST (UTC-5)
    expect(zonedInstant(2026, 3, 8, 12 * 60, NY)).toBe(Date.UTC(2026, 2, 8, 16, 0)); // EDT (UTC-4): el 8/3 cambió la hora
  });
  it('una zona inválida cae en la de Argentina', () => {
    expect(safeTz('Mars/Olympus')).toBe(DEFAULT_TZ);
    expect(safeTz(null)).toBe(DEFAULT_TZ);
    expect(safeTz(AR)).toBe(AR);
    expect(localParts(NOW, 'Mars/Olympus').h).toBe(12);
  });
  it('fmtWhen y fmtRange salen en la hora del complejo', () => {
    expect(fmtWhen(ar(2026, 11, 12, 21, 0), AR)).toBe('jue 12 nov, 21:00');
    expect(fmtRange(ar(2026, 11, 12, 23, 0), ar(2026, 11, 13, 0, 30), AR)).toBe('23:00 a 00:30');
  });
});

describe('días', () => {
  it('nextDays: hoy y los siguientes con su día de la semana', () => {
    const days = nextDays(NOW, AR, 14);
    expect(days).toHaveLength(14);
    expect(days[0]).toEqual({ key: '2026-11-10', y: 2026, m: 11, d: 10, dow: 2, offset: 0 });
    expect(days[2].key).toBe('2026-11-12');
    expect(days[2].dow).toBe(4);
    expect(days[13].key).toBe('2026-11-23');
  });
  it('de noche sigue siendo hoy en el complejo aunque en UTC ya sea mañana', () => {
    expect(nextDays(Date.UTC(2026, 10, 11, 2, 30), AR, 1)[0].key).toBe('2026-11-10');
  });
  it('pasa de mes y de año', () => {
    const d = nextDays(ar(2026, 12, 30, 10), AR, 4).map(x => x.key);
    expect(d).toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
  });
  it('nombres', () => {
    const days = nextDays(NOW, AR, 4);
    expect(dayName(days[0])).toBe('Hoy');
    expect(dayName(days[1])).toBe('Mañana');
    expect(dayName(days[1], true)).toBe('Mañ');
    expect(dayName(days[2])).toBe('Jue');
    expect(dayLong(days[2])).toBe('jueves 12 de noviembre');
  });
  it('busyRange: de la medianoche del día a la de pasado mañana (48 h, entra en el tope de 14 días)', () => {
    const r = busyRange(nextDays(NOW, AR, 3)[2], AR);
    expect(r).toEqual({ from: '2026-11-12T03:00:00.000Z', to: '2026-11-14T03:00:00.000Z' });
  });
});

describe('horarios de apertura', () => {
  const FRI_LATE: HoursRow[] = [{ weekday: 5, opens: '18:00', closes: '01:00' }, { weekday: 6, opens: '10:00', closes: '23:00' }];
  it('openWindow: si cierra <= abre, cierra al día siguiente', () => {
    expect(openWindow(FRI_LATE, 5)).toEqual({ startMin: 1080, endMin: 1500 });
    expect(openWindow(FRI_LATE, 6)).toEqual({ startMin: 600, endMin: 1380 });
    expect(openWindow(DAILY, 0)).toEqual({ startMin: 540, endMin: 1440 });
    expect(openWindow(FRI_LATE, 1)).toBeNull();
    expect(openWindow([{ weekday: 1, opens: 'x', closes: '10:00' }], 1)).toBeNull();
  });
  it('isOpenNow: dentro, fuera y de madrugada del día anterior', () => {
    // viernes 14/11/2026
    expect(isOpenNow(FRI_LATE, AR, ar(2026, 11, 13, 17, 0))).toBe(false);
    expect(isOpenNow(FRI_LATE, AR, ar(2026, 11, 13, 18, 0))).toBe(true);
    expect(isOpenNow(FRI_LATE, AR, ar(2026, 11, 13, 23, 59))).toBe(true);
    expect(isOpenNow(FRI_LATE, AR, ar(2026, 11, 14, 0, 30))).toBe(true); // sábado de madrugada: sigue el viernes
    expect(isOpenNow(FRI_LATE, AR, ar(2026, 11, 14, 1, 0))).toBe(false);
    expect(isOpenNow(FRI_LATE, AR, ar(2026, 11, 14, 9, 59))).toBe(false);
    expect(isOpenNow(FRI_LATE, AR, ar(2026, 11, 14, 10, 0))).toBe(true);
    expect(isOpenNow([], AR, NOW)).toBe(false);
  });
  it('weekHours junta los días seguidos iguales (lunes primero)', () => {
    const hours: HoursRow[] = [1, 2, 3, 4, 5].map(weekday => ({ weekday, opens: '09:00:00', closes: '00:00:00' }))
      .concat([{ weekday: 6, opens: '10:00:00', closes: '02:00:00' }]);
    const g = weekHours(hours, 3);
    expect(g.map(x => [x.label, x.text])).toEqual([
      ['Lunes a viernes', '09:00 a 00:00'], ['Sábado', '10:00 a 02:00'], ['Domingo', 'Cerrado'],
    ]);
    expect(g.map(x => x.today)).toEqual([true, false, false]);
    expect(g[2].closed).toBe(true);
  });
  it('weekHours: dos días seguidos y todos iguales', () => {
    expect(weekHours(DAILY, 0)).toEqual([{ label: 'Lunes a domingo', text: '09:00 a 00:00', today: true, closed: false }]);
    const two = weekHours([{ weekday: 6, opens: '10:00', closes: '20:00' }, { weekday: 0, opens: '10:00', closes: '20:00' }], 1);
    expect(two.find(x => x.text === '10:00 a 20:00')!.label).toBe('Sábado y domingo');
  });
});

describe('turnos', () => {
  const day = nextDays(NOW, AR, 14)[2]; // jueves 12
  const base = { day, hours: DAILY, tz: AR, fieldId: 'f1', busy: [] as Busy[], minutes: 60, step: 60, nowMs: NOW };

  it('de las 09:00 a las 00:00 entran 15 turnos de 1 h, o 14 de 1 h 30', () => {
    const s = buildSlots(base);
    expect(s).toHaveLength(15);
    expect(s[0].label).toBe('09:00');
    expect(s[14].label).toBe('23:00');
    expect(s[14].nextDay).toBe(false);
    expect(s.every(x => x.state === 'free')).toBe(true);
    expect(s[0].startMs).toBe(ar(2026, 11, 12, 9, 0));
    expect(s[0].endMs).toBe(ar(2026, 11, 12, 10, 0));
    const long = buildSlots({ ...base, minutes: 90 });
    expect(long).toHaveLength(14);
    expect(long[13].label).toBe('22:00');
    expect(long[13].endMs).toBe(ar(2026, 11, 12, 23, 30));
  });
  it('la grilla manda: turnos de 90 minutos arrancan 09:00, 10:30, 12:00…', () => {
    const s = buildSlots({ ...base, minutes: 90, step: 90 });
    expect(s.slice(0, 3).map(x => x.label)).toEqual(['09:00', '10:30', '12:00']);
  });
  it('lo confirmado ocupa solo lo que pisa (el que termina justo cuando empieza otro no lo pisa)', () => {
    const busy: Busy[] = [{ field_id: 'f1', starts_at: iso(ar(2026, 11, 12, 21, 0)), ends_at: iso(ar(2026, 11, 12, 22, 0)), status: 'confirmed' }];
    const st = (label: string, minutes = 60) => buildSlots({ ...base, busy, minutes }).find(x => x.label === label)!.state;
    expect(st('20:00')).toBe('free');
    expect(st('21:00')).toBe('busy');
    expect(st('22:00')).toBe('free');
    expect(st('20:00', 90)).toBe('busy'); // 20:00 a 21:30 pisa el de las 21
    expect(st('19:00', 90)).toBe('free');
  });
  it('un pedido pendiente se marca aparte y lo confirmado le gana', () => {
    const at = (h: number) => ({ starts_at: iso(ar(2026, 11, 12, h, 0)), ends_at: iso(ar(2026, 11, 12, h + 1, 0)) });
    const busy: Busy[] = [{ field_id: 'f1', ...at(18), status: 'pending' }, { field_id: 'f1', ...at(19), status: 'pending' }, { field_id: 'f1', ...at(19), status: 'confirmed' }];
    const s = buildSlots({ ...base, busy });
    expect(s.find(x => x.label === '18:00')!.state).toBe('pending');
    expect(s.find(x => x.label === '19:00')!.state).toBe('busy');
  });
  it('ignora lo ocupado de otras canchas', () => {
    const busy: Busy[] = [{ field_id: 'f2', starts_at: iso(ar(2026, 11, 12, 21, 0)), ends_at: iso(ar(2026, 11, 12, 22, 0)), status: 'confirmed' }];
    expect(buildSlots({ ...base, busy }).every(x => x.state === 'free')).toBe(true);
  });
  it('hoy no aparece lo que ya empezó', () => {
    const today = nextDays(NOW, AR, 1)[0];
    const s = buildSlots({ ...base, day: today, nowMs: ar(2026, 11, 10, 19, 0) });
    expect(s[0].label).toBe('20:00'); // las 19:00 ya empezaron
    expect(buildSlots({ ...base, day: today, nowMs: ar(2026, 11, 10, 18, 58) })[0].label).toBe('19:00');
  });
  it('cierra de madrugada: los turnos pasados de las 24 h llevan nextDay', () => {
    const fri = nextDays(NOW, AR, 14)[3]; // viernes 13
    const hours: HoursRow[] = [{ weekday: 5, opens: '18:00', closes: '01:00' }];
    const s = buildSlots({ ...base, day: fri, hours });
    expect(s.map(x => x.label)).toEqual(['18:00', '19:00', '20:00', '21:00', '22:00', '23:00', '00:00']);
    expect(s[6].nextDay).toBe(true);
    expect(s[6].startMs).toBe(ar(2026, 11, 14, 0, 0));
    expect(s[5].nextDay).toBe(false);
  });
  it('después de medianoche hoy se ofrece lo que queda del horario de ayer (lunes 18:00–02:00, martes 00:30 → 01:00)', () => {
    const MON_LATE: HoursRow[] = [{ weekday: 1, opens: '18:00', closes: '02:00' }]; // martes cerrado
    const at = (h: number, mi: number) => ar(2026, 11, 10, h, mi); // martes 10/11/2026
    const today = (nowMs: number) => nextDays(nowMs, AR, 14)[0];
    const s = buildSlots({ ...base, hours: MON_LATE, day: today(at(0, 30)), nowMs: at(0, 30) });
    expect(s.map(x => x.label)).toEqual(['01:00']);
    expect(s[0].startMs).toBe(at(1, 0));
    expect(s[0].endMs).toBe(at(2, 0));
    expect(s[0].nextDay).toBe(false); // ya es del calendario de hoy
    expect(dayIsOpen(MON_LATE, today(at(0, 30)), at(0, 30), AR)).toBe(true);
    // ya cerró: ni turnos ni horario hoy
    expect(buildSlots({ ...base, hours: MON_LATE, day: today(at(2, 0)), nowMs: at(2, 0) })).toEqual([]);
    expect(dayIsOpen(MON_LATE, today(at(2, 0)), at(2, 0), AR)).toBe(false);
    // otro día de la semana sin horario: cerrado
    expect(dayIsOpen(MON_LATE, nextDays(at(0, 30), AR, 14)[1], at(0, 30), AR)).toBe(false);
  });
  it('el tramo de madrugada de ayer va antes de los turnos de hoy, y lo ocupado cuenta', () => {
    const hours: HoursRow[] = [{ weekday: 1, opens: '18:00', closes: '03:00' }, { weekday: 2, opens: '09:00', closes: '12:00' }, { weekday: 3, opens: '09:00', closes: '12:00' }];
    const nowMs = ar(2026, 11, 10, 0, 30);
    const busy: Busy[] = [{ field_id: 'f1', starts_at: iso(ar(2026, 11, 10, 1, 0)), ends_at: iso(ar(2026, 11, 10, 2, 0)), status: 'confirmed' }];
    const s = buildSlots({ ...base, hours, day: nextDays(nowMs, AR, 14)[0], nowMs, busy });
    expect(s.map(x => x.label)).toEqual(['01:00', '02:00', '09:00', '10:00', '11:00']);
    expect(s.map(x => x.state)).toEqual(['busy', 'free', 'free', 'free', 'free']);
    // los otros días no repiten el tramo: ya aparece como "+1 día" en el día anterior
    const tomorrow = buildSlots({ ...base, hours, day: nextDays(nowMs, AR, 14)[1], nowMs });
    expect(tomorrow.map(x => x.label)).toEqual(['09:00', '10:00', '11:00']);
  });
  it('firstBookableDay: pasada la medianoche hoy todavía tiene turnos', () => {
    const MON_LATE: HoursRow[] = [{ weekday: 1, opens: '18:00', closes: '02:00' }];
    const nowMs = ar(2026, 11, 10, 0, 30);
    expect(firstBookableDay(nextDays(nowMs, AR, 14), { hours: MON_LATE, tz: AR, minutes: 60, step: 60, nowMs })).toBe(0);
  });
  it('todayKey cambia a la medianoche del complejo (no de UTC)', () => {
    expect(todayKey(ar(2026, 11, 10, 23, 59), AR)).toBe('2026-11-10');
    expect(todayKey(ar(2026, 11, 11, 0, 0), AR)).toBe('2026-11-11');
  });
  it('día cerrado o duración inválida: sin turnos', () => {
    expect(buildSlots({ ...base, hours: [] })).toEqual([]);
    expect(buildSlots({ ...base, minutes: 0 })).toEqual([]);
  });
  it('firstBookableDay: a la noche ya no queda nada hoy', () => {
    const days = nextDays(ar(2026, 11, 10, 23, 30), AR, 14);
    expect(firstBookableDay(days, { hours: DAILY, tz: AR, minutes: 60, step: 60, nowMs: ar(2026, 11, 10, 23, 30) })).toBe(1);
    expect(firstBookableDay(days, { hours: DAILY, tz: AR, minutes: 60, step: 60, nowMs: NOW })).toBe(0);
    expect(firstBookableDay(days, { hours: [], tz: AR, minutes: 60, step: 60, nowMs: NOW })).toBe(-1);
  });
  it('si el complejo abre a y cuarto, el primer turno es a la y media (el servidor solo acepta en punto o y media)', () => {
    const s = buildSlots({ ...base, hours: DAILY.map(h => ({ ...h, opens: '09:15' })) });
    expect(s[0].label).toBe('09:30');
    expect(s.every(x => x.startMs % 1_800_000 === 0)).toBe(true);
  });
  it('durationOptions: solo múltiplos del turno del complejo (request_booking los exige)', () => {
    expect(durationOptions(30)).toEqual([60, 90, 120]);
    expect(durationOptions(60)).toEqual([60, 120]);
    expect(durationOptions(90)).toEqual([90]);
    expect(durationOptions(120)).toEqual([120]);
    expect(durationOptions(undefined)).toEqual([60, 120]);
  });
  it('stepOf: nunca menos de 30 minutos', () => {
    expect(stepOf(60)).toBe(60);
    expect(stepOf(30)).toBe(30);
    expect(stepOf(90)).toBe(90);
    expect(stepOf(0)).toBe(60);
    expect(stepOf(undefined)).toBe(60);
    expect(stepOf(10)).toBe(30);
  });
});
