import { describe, expect, it } from 'vitest';
import {
  addDays, blockDurations, bookingsOfDay, cancelledByLabel, cancelledLine, fmtAgo, fmtSlotWhen, recentCancellations, competingPending, complexError, copyDay, dayCounts, dayHours, dayRevenue, dayWindow, draftToRows,
  emptyComplex, emptyField, fieldError, fieldLine, fmtDayChip, fmtDuration, fmtHHMM, fmtPrice, fmtRange, freeRanges, groupByDay,
  hoursError, hoursSummary, hoursToDraft, isDate, isPublished, layoutLanes, localParts, normalizeWhatsapp, openRequests, ownerErrorText,
  minuteToLocal, parseHHMM, parsePrice, pendingConflict, placeBooking, setupChecklist, snapMinute, startOfWeek, weekdayOf, whatsappLink, zonedToUtc,
  type Booking, type Complex, type Field, type HoursRow,
} from './model';

const TZ = 'America/Argentina/Buenos_Aires';
/** Instante ISO de "las hh:mm hora argentina del día date". */
const at = (date: string, hhmm: string) => new Date(zonedToUtc(date, parseHHMM(hhmm)!, TZ)).toISOString();

let n = 0;
const bk = (o: Partial<Booking> & { date?: string; from: string; to: string }): Booking => {
  const date = o.date ?? '2026-11-12';
  return {
    id: o.id ?? `b${++n}`, field_id: o.field_id ?? 'f1', starts_at: at(date, o.from), ends_at: at(o.to < o.from ? addDays(date, 1) : date, o.to),
    status: o.status ?? 'confirmed', kind: o.kind ?? 'request', note: null, owner_note: null, price: o.price ?? null,
    requester_id: null, requester_name: o.requester_name ?? 'Beto', requester_photo: null, community_name: null, created_at: o.created_at ?? '2026-11-10T12:00:00Z',
  };
};
const HOURS_ALL: HoursRow[] = [0, 1, 2, 3, 4, 5, 6].map(weekday => ({ weekday, opens: '09:00:00', closes: '00:00:00' }));
const HOURS_NIGHT: HoursRow[] = [0, 1, 2, 3, 4, 5, 6].map(weekday => ({ weekday, opens: '18:00', closes: '02:00' }));

describe('fechas en la zona del complejo', () => {
  it('2026-11-12 es jueves y los días se suman bien (mes y año)', () => {
    expect(weekdayOf('2026-11-12')).toBe(4);
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });
  it('lunes de la semana (domingo cuenta como último día)', () => {
    expect(startOfWeek('2026-11-12')).toBe('2026-11-09');
    expect(startOfWeek('2026-11-09')).toBe('2026-11-09');
    expect(startOfWeek('2026-11-15')).toBe('2026-11-09'); // domingo
  });
  it('Argentina es UTC-3: las 21:00 locales son las 00:00 UTC del día siguiente', () => {
    expect(new Date(zonedToUtc('2026-11-12', 21 * 60, TZ)).toISOString()).toBe('2026-11-13T00:00:00.000Z');
    expect(new Date(zonedToUtc('2026-11-12', 25 * 60, TZ)).toISOString()).toBe('2026-11-13T04:00:00.000Z'); // 01:00 del 13
  });
  it('localParts es la inversa y respeta el cambio de día', () => {
    const p = localParts(Date.parse('2026-11-13T02:30:00Z'), TZ);
    expect(p).toEqual({ date: '2026-11-12', minutes: 23 * 60 + 30, weekday: 4 });
    expect(localParts(Date.parse('2026-11-13T03:00:00Z'), TZ).date).toBe('2026-11-13');
  });
  it('funciona con una zona con horario de verano (ida y vuelta)', () => {
    const ms = zonedToUtc('2026-07-01', 20 * 60, 'Europe/Madrid'); // CEST = UTC+2
    expect(new Date(ms).toISOString()).toBe('2026-07-01T18:00:00.000Z');
    expect(localParts(ms, 'Europe/Madrid')).toMatchObject({ date: '2026-07-01', minutes: 1200 });
  });
  it('validaciones y formatos', () => {
    expect(isDate('2026-11-12')).toBe(true);
    expect(isDate('2026-13-45')).toBe(false);
    expect(parseHHMM('18:30:00')).toBe(1110);
    expect(parseHHMM('24:00')).toBeNull();
    expect(parseHHMM('9:5')).toBeNull();
    expect(fmtHHMM(1500)).toBe('01:00');
    expect(fmtDuration(90)).toBe('1 h 30');
    expect(fmtDuration(120)).toBe('2 h');
    expect(fmtDuration(30)).toBe('30 min');
    expect(fmtDayChip('2026-11-12')).toBe('Jue 12');
    expect(fmtRange(Date.parse(at('2026-11-12', '21:00')), Date.parse(at('2026-11-12', '22:30')), TZ)).toBe('21:00 – 22:30');
    expect(fmtPrice(20000)).toMatch(/^\$\s20\.000$/);
    expect(fmtPrice(null)).toBe('');
  });
});

describe('horarios de apertura', () => {
  it('cierra a la medianoche o pasada la medianoche', () => {
    expect(dayHours(HOURS_ALL, 3)).toEqual({ open: 540, close: 1440 });
    expect(dayHours(HOURS_NIGHT, 3)).toEqual({ open: 1080, close: 1560 });
    expect(dayHours([{ weekday: 1, opens: '00:00', closes: '00:00' }], 1)).toEqual({ open: 0, close: 1440 });
    expect(dayHours(HOURS_ALL.filter(h => h.weekday !== 2), 2)).toBeNull();
  });
  it('borrador: ida y vuelta, días cerrados y copiar a otros días', () => {
    const rows: HoursRow[] = [{ weekday: 1, opens: '18:00:00', closes: '01:00:00' }, { weekday: 5, opens: '09:00', closes: '23:00' }];
    const d = hoursToDraft(rows);
    expect(d[1]).toEqual({ open: true, opens: '18:00', closes: '01:00' });
    expect(d[2].open).toBe(false);
    expect(draftToRows(d).map(r => r.weekday)).toEqual([1, 5]);
    const all = copyDay(d, 1);
    expect(draftToRows(all)).toHaveLength(7);
    expect(draftToRows(all)[0].weekday).toBe(1); // lunes primero
    const some = copyDay(d, 1, [2, 3]);
    expect(draftToRows(some).map(r => r.weekday)).toEqual([1, 2, 3, 5]);
  });
  it('error si no abre ningún día o la hora es inválida', () => {
    expect(hoursError(hoursToDraft([]))).toMatch(/al menos un día/);
    const d = hoursToDraft([{ weekday: 1, opens: '18:00', closes: '01:00' }]);
    expect(hoursError(d)).toBeNull();
    d[1].closes = '25:99';
    expect(hoursError(d)).toMatch(/lunes/);
  });
  it('resumen legible', () => {
    expect(hoursSummary([])).toBe('Sin horarios cargados');
    expect(hoursSummary(HOURS_ALL)).toBe('Todos los días 09:00 a 00:00');
    const mixed: HoursRow[] = [1, 2, 3, 4, 5].map(weekday => ({ weekday, opens: '18:00', closes: '01:00' }))
      .concat([{ weekday: 6, opens: '10:00', closes: '01:00' }, { weekday: 0, opens: '10:00', closes: '01:00' }]);
    expect(hoursSummary(mixed)).toBe('Lun a Vie 18:00 a 01:00 · Sáb a Dom 10:00 a 01:00');
  });
});

describe('turnos en la agenda', () => {
  it('un turno de madrugada es del día comercial anterior', () => {
    const b = bk({ date: '2026-11-13', from: '00:30', to: '01:30' }); // 00:30 del viernes, el local abre sábado-jueves hasta las 02:00
    const p = placeBooking(b, HOURS_NIGHT, TZ);
    expect(p).toEqual({ date: '2026-11-12', start: 1470, end: 1530 });
    // el mismo turno en un local que cierra a las 00:00 es del propio día
    expect(placeBooking(b, HOURS_ALL, TZ).date).toBe('2026-11-13');
    // a las 20:00 siempre es de su día
    expect(placeBooking(bk({ from: '20:00', to: '21:00' }), HOURS_NIGHT, TZ)).toEqual({ date: '2026-11-12', start: 1200, end: 1260 });
  });
  it('tocar la madrugada de un local que cierra a las 02:00 bloquea el día calendario siguiente, no el mismo día', () => {
    expect(minuteToLocal('2026-11-12', 1500)).toEqual({ date: '2026-11-13', time: '01:00' });
    expect(minuteToLocal('2026-11-12', 1200)).toEqual({ date: '2026-11-12', time: '20:00' });
    expect(minuteToLocal('2026-11-12', 1440)).toEqual({ date: '2026-11-13', time: '00:00' });
    expect(minuteToLocal('2026-11-30', 1500)).toEqual({ date: '2026-12-01', time: '01:00' });
    // el toque en la grilla (ventana 18:00 → 02:00) y la conversión a instante dan lo mismo que "las 25:00 del día de agenda"
    const tap = snapMinute(420, 1, 1080, 60);
    expect(tap).toBe(1500);
    const l = minuteToLocal('2026-11-12', tap);
    expect(zonedToUtc(l.date, parseHHMM(l.time)!, TZ)).toBe(zonedToUtc('2026-11-12', 1500, TZ));
    expect(new Date(zonedToUtc(l.date, parseHHMM(l.time)!, TZ)).toISOString()).toBe('2026-11-13T04:00:00.000Z');
    // y ese turno es del día de agenda del jueves, no del viernes
    const b = bk({ date: '2026-11-13', from: '01:00', to: '02:00' });
    expect(placeBooking(b, HOURS_NIGHT, TZ).date).toBe('2026-11-12');
  });
  it('bookingsOfDay y groupByDay ordenan por hora', () => {
    const list = [bk({ from: '21:00', to: '22:00' }), bk({ from: '19:00', to: '20:00' }), bk({ date: '2026-11-13', from: '19:00', to: '20:00' })];
    expect(bookingsOfDay('2026-11-12', list, HOURS_ALL, TZ).map(x => x.pos.start)).toEqual([1140, 1260]);
    const g = groupByDay(list, HOURS_ALL, TZ);
    expect([...g.keys()]).toEqual(['2026-11-12', '2026-11-13']);
    expect(g.get('2026-11-12')).toHaveLength(2);
  });
  it('ventana del día: horario del local, ampliada si hay turnos afuera; día cerrado', () => {
    expect(dayWindow('2026-11-12', HOURS_ALL, [])).toEqual({ date: '2026-11-12', start: 540, end: 1440, closed: false });
    expect(dayWindow('2026-11-12', HOURS_ALL, [{ start: 450, end: 510 }])).toMatchObject({ start: 420, end: 1440 });   // 07:30 → 07:00
    const noThu = HOURS_ALL.filter(h => h.weekday !== 4);
    expect(dayWindow('2026-11-12', noThu, [])).toMatchObject({ closed: true });
    expect(dayWindow('2026-11-12', noThu, [{ start: 600, end: 660 }])).toMatchObject({ closed: false, start: 600, end: 660 });
    expect(dayWindow('2026-11-12', HOURS_NIGHT, [])).toMatchObject({ start: 1080, end: 1560 });
  });
  it('un pedido que se pisa con un confirmado no se puede aceptar', () => {
    const ok = bk({ from: '20:00', to: '21:00', status: 'confirmed' });
    const pend = bk({ from: '20:30', to: '21:30', status: 'pending' });
    const otherField = bk({ from: '20:30', to: '21:30', status: 'pending', field_id: 'f2' });
    const after = bk({ from: '21:00', to: '22:00', status: 'pending' });
    expect(pendingConflict(pend, [ok, pend])?.id).toBe(ok.id);
    expect(pendingConflict(otherField, [ok, otherField])).toBeNull();
    expect(pendingConflict(after, [ok, after])).toBeNull(); // empieza cuando el otro termina
    expect(pendingConflict(ok, [ok, pend])).toBeNull();
  });
  it('pedidos que compiten por el mismo horario', () => {
    const a = bk({ from: '20:00', to: '21:00', status: 'pending' });
    const b = bk({ from: '20:30', to: '21:30', status: 'pending' });
    const c = bk({ from: '23:00', to: '23:30', status: 'pending' });
    expect(competingPending(a, [a, b, c]).map(x => x.id)).toEqual([b.id]);
  });
  it('carriles: lo que se pisa va lado a lado y lo demás ocupa todo el ancho', () => {
    const items: [number, number][] = [[600, 660], [630, 690], [650, 700], [800, 860]];
    const out = layoutLanes(items, t => t);
    expect(out.map(p => [p.lane, p.lanes])).toEqual([[0, 3], [1, 3], [2, 3], [0, 1]]);
    expect(layoutLanes<[number, number]>([[0, 60], [60, 120]], t => t).map(p => p.lanes)).toEqual([1, 1]); // consecutivos no se pisan
  });
  it('snap al paso del complejo y tramos libres', () => {
    expect(snapMinute(100, 1, 540, 60)).toBe(600);
    expect(snapMinute(-5, 1, 540, 60)).toBe(540);
    expect(snapMinute(95, 1, 540, 30)).toBe(630);
    expect(freeRanges(540, 1440, [[600, 660], [630, 720], [1380, 1440]])).toEqual([[540, 600], [720, 1380]]);
    expect(freeRanges(540, 600, [])).toEqual([[540, 600]]);
    expect(freeRanges(540, 600, [[500, 700]])).toEqual([]);
  });
  it('duraciones para bloquear', () => {
    expect(blockDurations(60)).toEqual([60, 120, 180, 240, 360, 480, 720, 1440]);
    expect(blockDurations(90)).toEqual([90, 180, 270, 360, 480, 720, 1440]);
  });
  it('contadores y recaudación solo de reservas confirmadas de jugadores', () => {
    const list = [bk({ from: '19:00', to: '20:00', price: 20000 }), bk({ from: '20:00', to: '21:00', price: 20000, status: 'pending' }),
      bk({ from: '21:00', to: '22:00', kind: 'block', price: 5 }), bk({ from: '22:00', to: '23:00', status: 'cancelled', price: 20000 })];
    expect(dayCounts(list)).toEqual({ pending: 1, confirmed: 1, blocks: 1 });
    expect(dayRevenue(list)).toBe(20000);
  });
  it('pedidos abiertos: pendientes que no terminaron, el más próximo primero', () => {
    const now = Date.parse(at('2026-11-12', '12:00'));
    const list = [bk({ from: '21:00', to: '22:00', status: 'pending' }), bk({ from: '10:00', to: '11:00', status: 'pending' }),
      bk({ from: '19:00', to: '20:00', status: 'pending' }), bk({ from: '19:00', to: '20:00', status: 'confirmed' })];
    expect(openRequests(list, now).map(b => b.starts_at)).toEqual([list[2].starts_at, list[0].starts_at]);
  });
});

describe('quién canceló', () => {
  const NOW = Date.parse(at('2026-11-12', '12:00'));
  /** Reserva cancelada hace `agoMin` minutos por `role`; el turno es el de las 21:00 de `date`. */
  const cancelled = (role: 'requester' | 'staff' | null, o: Partial<Booking> & { agoMin?: number; date?: string } = {}): Booking => ({
    ...bk({ date: o.date ?? '2026-11-12', from: '21:00', to: '22:00', status: 'cancelled', kind: o.kind }),
    cancelled_by: 'u1', cancelled_by_name: 'Beto', cancel_role: role,
    decided_at: new Date(NOW - (o.agoMin ?? 120) * 60_000).toISOString(), ...o,
  });

  it('hace cuánto: minutos, horas, días y después la fecha', () => {
    expect(fmtAgo(NOW - 20_000, NOW)).toBe('recién');
    expect(fmtAgo(NOW + 5_000, NOW)).toBe('recién');
    expect(fmtAgo(NOW - 5 * 60_000, NOW)).toBe('hace 5 min');
    expect(fmtAgo(NOW - 3 * 3_600_000, NOW)).toBe('hace 3 h');
    expect(fmtAgo(NOW - 25 * 3_600_000, NOW)).toBe('hace 1 día');
    expect(fmtAgo(NOW - 3 * 86_400_000, NOW)).toBe('hace 3 días');
    expect(fmtAgo(Date.parse(at('2026-11-02', '15:00')), NOW)).toMatch(/^2 nov/);
  });
  it('día y hora del turno en la zona del complejo', () => {
    const s = Date.parse(at('2026-11-12', '21:00')), e = Date.parse(at('2026-11-12', '22:30'));
    expect(fmtSlotWhen(s, e, TZ)).toMatch(/^Jue 12 nov · 21:00 – 22:30$/);
  });
  it('la frase dice quién y con qué rol, o "vos"', () => {
    expect(cancelledByLabel(cancelled('requester'), 'otro')).toBe('Cancelada por Beto (quien la pidió)');
    expect(cancelledByLabel(cancelled('staff', { cancelled_by_name: 'Ana' }), 'otro')).toBe('Cancelada por Ana (del complejo)');
    expect(cancelledByLabel(cancelled('staff', { cancelled_by: 'yo' }), 'yo')).toBe('Cancelada por vos');
    expect(cancelledByLabel(cancelled('staff', { cancelled_by: 'yo', kind: 'block' }), 'yo')).toBe('Liberado por vos');
  });
  it('sin nombre queda el rol; sin ningún dato no se inventa nada; solo las canceladas', () => {
    expect(cancelledByLabel(cancelled('requester', { cancelled_by: null, cancelled_by_name: null }), 'yo')).toBe('Cancelada por quien la pidió');
    expect(cancelledByLabel(cancelled('staff', { cancelled_by: null, cancelled_by_name: null }), 'yo')).toBe('Cancelada por el complejo');
    expect(cancelledByLabel(cancelled(null, { cancelled_by: null, cancelled_by_name: null }), 'yo')).toBeNull();
    expect(cancelledByLabel(bk({ from: '21:00', to: '22:00' }), 'yo')).toBeNull(); // la base todavía no manda los campos
    expect(cancelledByLabel({ ...cancelled('requester'), status: 'confirmed' }, 'yo')).toBeNull();
  });
  it('con cuándo, si se sabe', () => {
    expect(cancelledLine(cancelled('requester', { agoMin: 120 }), 'yo', NOW)).toBe('Cancelada por Beto (quien la pidió) · hace 2 h');
    expect(cancelledLine(cancelled('requester', { decided_at: null }), 'yo', NOW)).toBe('Cancelada por Beto (quien la pidió)');
    expect(cancelledLine(cancelled(null, { cancelled_by: null, cancelled_by_name: null }), 'yo', NOW)).toBeNull();
  });
  it('cancelaciones recientes: solo las de quien pidió, de la última semana y de turnos que no pasaron; las nuevas primero', () => {
    const a = cancelled('requester', { agoMin: 600, date: '2026-11-14' });
    const b = cancelled('requester', { agoMin: 30, date: '2026-11-20' });
    const mismoDia = cancelled('requester', { agoMin: 200, date: '2026-11-12' });
    const turnoDeAyerNoche = cancelled('requester', { agoMin: 100, date: '2026-11-11' }); // 21:00 de ayer: empezó hace 15 h
    const turnoViejo = cancelled('requester', { agoMin: 100, date: '2026-11-10' });
    const hechaPorElComplejo = cancelled('staff', { agoMin: 10, date: '2026-11-15' });
    const haceUnMes = cancelled('requester', { agoMin: 60 * 24 * 8, date: '2026-11-15' });
    const sinDato = cancelled(null, { agoMin: 10, date: '2026-11-15', decided_at: null });
    const bloqueo = cancelled('staff', { agoMin: 10, date: '2026-11-15', kind: 'block' });
    const confirmada = bk({ date: '2026-11-15', from: '21:00', to: '22:00' });
    const list = [a, hechaPorElComplejo, turnoViejo, b, haceUnMes, sinDato, bloqueo, confirmada, mismoDia, turnoDeAyerNoche];
    expect(recentCancellations(list, NOW).map(x => x.id)).toEqual([b.id, turnoDeAyerNoche.id, mismoDia.id, a.id]);
    expect(recentCancellations([], NOW)).toEqual([]);
  });
});

describe('canchas', () => {
  it('precio: vacío = sin precio; formatos argentinos; inválido = undefined', () => {
    expect(parsePrice('')).toBeNull();
    expect(parsePrice('20000')).toBe(20000);
    expect(parsePrice('$ 20.000')).toBe(20000);
    expect(parsePrice('18500,50')).toBe(18500.5);
    expect(parsePrice('abc')).toBeUndefined();
    expect(parsePrice('-5')).toBeUndefined();
  });
  it('validación del formulario', () => {
    expect(fieldError(emptyField(1))).toBeNull();
    expect(fieldError({ ...emptyField(1), name: '  ' })).toMatch(/nombre/);
    expect(fieldError({ ...emptyField(1), price: 'xx' })).toMatch(/precio/);
    expect(fieldError({ ...emptyField(1), size: 10 })).toMatch(/tamaño/);
  });
  it('línea resumen', () => {
    expect(fieldLine({ size: 7, surface: 'cesped', roofed: false, price: 30000 })).toMatch(/^F7 · Césped natural · Descubierta · \$\s30\.000\/h$/);
    expect(fieldLine({ size: 5, surface: 'sintetico', roofed: true, price: null })).toBe('F5 · Sintético · Techada · Sin precio');
  });
});

describe('datos del complejo', () => {
  it('WhatsApp argentino', () => {
    expect(normalizeWhatsapp('11 5555-1234')).toBe('5491155551234');
    expect(normalizeWhatsapp('+54 9 11 5555 1234')).toBe('5491155551234');
    expect(normalizeWhatsapp('+54 11 5555 1234')).toBe('5491155551234');
    expect(normalizeWhatsapp('011 15 5555 1234')).toBe('5491155551234');
    expect(normalizeWhatsapp('0351 155 123456')).toBe('5493515123456');
    expect(normalizeWhatsapp('351 555-1234')).toBe('5493515551234');
    expect(normalizeWhatsapp('+598 99 123 456')).toBe('59899123456');   // Uruguay: se deja
    expect(normalizeWhatsapp('123')).toBeNull();
    expect(normalizeWhatsapp('abc')).toBeNull();
    expect(whatsappLink('5491155551234', 'Hola, ¿tenés turno?')).toBe('https://wa.me/5491155551234?text=Hola%2C%20%C2%BFten%C3%A9s%20turno%3F');
  });
  it('validación del alta', () => {
    const ok = { ...emptyComplex(), name: 'Los Amigos', lat: -34.6, lng: -58.4 };
    expect(complexError(ok)).toBeNull();
    expect(complexError({ ...ok, name: 'a' })).toMatch(/nombre/);
    expect(complexError({ ...ok, lat: null, lng: null })).toMatch(/barrio o ciudad/);
    expect(complexError({ ...ok, phone: 'hola' })).toMatch(/teléfono/);
    expect(complexError({ ...ok, phone: '11 5555-1234', whatsapp: '11 5555-1234' })).toBeNull();
    expect(complexError({ ...ok, whatsapp: '12' })).toMatch(/WhatsApp/);
  });
  it('qué falta para aparecer en el buscador', () => {
    const c = { id: 'c', lat: -34.6, lng: -58.4, phone: null, whatsapp: null, photo_url: null, active: true } as unknown as Complex;
    const f = { active: true } as Field;
    const items = setupChecklist(c, [f], HOURS_ALL);
    expect(items.filter(i => !i.ok).map(i => i.key)).toEqual(['contact', 'photo']);
    expect(isPublished(items, true)).toBe(true);
    expect(isPublished(items, false)).toBe(false);
    expect(isPublished(setupChecklist(c, [], HOURS_ALL), true)).toBe(false);
    expect(isPublished(setupChecklist({ ...c, lat: null, lng: null }, [f], HOURS_ALL), true)).toBe(false);
    expect(isPublished(setupChecklist(c, [{ active: false } as Field], HOURS_ALL), true)).toBe(false);
    expect(isPublished(setupChecklist(c, [f], []), true)).toBe(false);
  });
});

describe('mensajes de error', () => {
  it('traduce los errores del servidor', () => {
    expect(ownerErrorText(new Error('slot_taken'))).toMatch(/ocupado/);
    expect(ownerErrorText(new Error('new row violates row-level security policy for table "fields"'))).toMatch(/permiso/);
    expect(ownerErrorText(new Error('Could not find the function public.owner_overview in the schema cache'))).toMatch(/todavía no está disponible/);
    expect(ownerErrorText(new TypeError('Failed to fetch'))).toMatch(/conexión/);
    expect(ownerErrorText(new Error('algo raro'))).toMatch(/algo raro/);
    expect(ownerErrorText(undefined)).toMatch(/Probá de nuevo/);
  });
});
