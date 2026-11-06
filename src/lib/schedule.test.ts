import { describe, expect, it } from 'vitest';
import {
  WEEKDAY_CHIPS, emptyScheduleForm, formError, formOf, hhmm, memberLine, nextOccurrence, opensText, placeOf, previewText,
  scheduleError, scheduleLine, schedulePayload, shortDate, whenText, type Schedule,
} from './schedule';

const S: Schedule = {
  id: 's1', community_id: 'c1', weekday: 4, at_time: '21:00:00', tz: 'America/Argentina/Buenos_Aires', title: 'Partido',
  venue_id: 'v1', location: 'Doble 5', slots: 10, fee_total: 30000, open_days_before: 6, active: true, created_by: 'p1',
  venue: { name: 'Doble 5 Fútbol Urbano' },
};
// 6/11/2026 es viernes (hora local)
const FRI = new Date(2026, 10, 6, 12, 0);

describe('chips de días', () => {
  it('de lunes a domingo, con 0 = domingo', () => {
    expect(WEEKDAY_CHIPS.map(c => c.label)).toEqual(['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']);
    expect(WEEKDAY_CHIPS.map(c => c.d)).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });
});

describe('textos', () => {
  it('hhmm / whenText / shortDate', () => {
    expect(hhmm('21:00:00')).toBe('21:00');
    expect(hhmm('08:30')).toBe('08:30');
    expect(whenText(S)).toBe('Todos los jueves 21:00');
    expect(whenText({ weekday: 0, at_time: '10:00:00' })).toBe('Todos los domingos 10:00');
    expect(whenText({ weekday: 6, at_time: '10:00:00' })).toBe('Todos los sábados 10:00');
    expect(shortDate(new Date(2026, 10, 12))).toBe('jue 12 de nov');
  });
  it('placeOf: la cancha guardada o el lugar escrito', () => {
    expect(placeOf(S)).toBe('Doble 5 Fútbol Urbano');
    expect(placeOf({ ...S, venue: null })).toBe('Doble 5');
    expect(placeOf({ venue: null, location: null })).toBeNull();
  });
  it('scheduleLine: día, hora, cancha, cupos y cuota', () => {
    expect(scheduleLine(S)).toBe('Todos los jueves 21:00 · Doble 5 Fútbol Urbano · 10 cupos · cancha $30.000');
    expect(scheduleLine({ ...S, venue: null, location: null, fee_total: null })).toBe('Todos los jueves 21:00 · 10 cupos');
  });
  it('memberLine: la línea de solo lectura', () => {
    expect(memberLine(S)).toBe('Partido fijo: todos los jueves 21:00 en Doble 5 Fútbol Urbano');
    expect(memberLine({ ...S, venue: null, location: null })).toBe('Partido fijo: todos los jueves 21:00');
  });
  it('opensText', () => {
    expect(opensText(6)).toBe('Se crea sola 6 días antes');
    expect(opensText(1)).toBe('Se crea sola 1 día antes');
    expect(opensText(0)).toBe('Se crea sola el mismo día');
  });
});

describe('nextOccurrence', () => {
  it('el próximo jueves 21:00 desde un viernes', () => {
    const d = nextOccurrence(4, '21:00', FRI);
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 10, 12, 21, 0]);
    expect(d.getDay()).toBe(4);
  });
  it('el mismo día si todavía no llegó la hora, y la semana siguiente si ya pasó', () => {
    const a = nextOccurrence(5, '21:00', FRI); // viernes 12:00 → hoy 21:00
    expect([a.getDate(), a.getHours()]).toEqual([6, 21]);
    const b = nextOccurrence(5, '11:00', FRI); // hoy 11:00 ya pasó → viernes que viene
    expect([b.getDate(), b.getHours()]).toEqual([13, 11]);
    const c = nextOccurrence(5, '12:00', FRI); // justo ahora: no cuenta, siempre posterior
    expect(c.getDate()).toBe(13);
  });
  it('domingo = 0 y cruce de mes', () => {
    const d = nextOccurrence(0, '10:00', new Date(2026, 10, 28, 9, 0)); // sábado 28/11 → domingo 29/11
    expect([d.getMonth(), d.getDate(), d.getDay()]).toEqual([10, 29, 0]);
    const e = nextOccurrence(1, '09:00', new Date(2026, 10, 30, 10, 0)); // lunes 30/11 10:00 → lunes 7/12
    expect([e.getMonth(), e.getDate()]).toEqual([11, 7]);
  });
  it('acepta la hora con segundos (como viene de la base)', () => {
    expect(nextOccurrence(4, '21:00:00', FRI).getHours()).toBe(21);
  });
});

describe('previewText', () => {
  it('con 6 días de anticipación y partido en 6 días, se crea apenas se guarda', () => {
    expect(previewText(4, '21:00', 6, FRI)).toBe('Próxima fecha: jue 12 de nov, 21:00. La convocatoria se crea apenas la guardes.');
  });
  it('con menos anticipación avisa cuándo se crea', () => {
    expect(previewText(4, '21:00', 2, FRI)).toBe('Próxima fecha: jue 12 de nov, 21:00. La convocatoria se crea el mar 10 de nov.');
    expect(previewText(4, '21:00', 0, FRI)).toBe('Próxima fecha: jue 12 de nov, 21:00. La convocatoria se crea el jue 12 de nov.');
  });
  it('cruza de mes', () => {
    expect(previewText(2, '20:00', 5, new Date(2026, 10, 25, 9, 0))).toContain('La convocatoria se crea el jue 26 de nov.');
  });
});

describe('formulario', () => {
  it('valores por defecto: jueves 21:00, 10 cupos, 6 días antes, sin cuota', () => {
    expect(emptyScheduleForm()).toEqual({ title: 'Partido', weekday: 4, time: '21:00', slots: '10', fee: '', open: '6' });
    expect(formError(emptyScheduleForm())).toBe('');
  });
  it('formOf es el camino de vuelta de un horario guardado', () => {
    expect(formOf(S)).toEqual({ title: 'Partido', weekday: 4, time: '21:00', slots: '10', fee: '30000', open: '6' });
    expect(formOf({ ...S, fee_total: null }).fee).toBe('');
    expect(formOf({ ...S, fee_total: '24000.00' }).fee).toBe('24000');
  });
  it('valida cada campo', () => {
    const f = emptyScheduleForm();
    expect(formError({ ...f, title: '  ' })).toContain('título');
    expect(formError({ ...f, title: 'x'.repeat(81) })).toContain('título');
    expect(formError({ ...f, weekday: 7 })).toContain('día');
    expect(formError({ ...f, time: '' })).toContain('hora');
    expect(formError({ ...f, time: '25:00' })).toContain('hora');
    expect(formError({ ...f, slots: '1' })).toContain('cupos');
    expect(formError({ ...f, slots: '41' })).toContain('cupos');
    expect(formError({ ...f, slots: '10.5' })).toContain('cupos');
    expect(formError({ ...f, open: '14' })).toContain('0 y 13');
    expect(formError({ ...f, open: '-1' })).toContain('0 y 13');
    expect(formError({ ...f, open: '' })).toContain('0 y 13');
    expect(formError({ ...f, fee: '-5' })).toContain('cancha');
    expect(formError({ ...f, fee: '99999999' })).toContain('cancha');
    expect(formError({ ...f, fee: 'abc' })).toContain('cancha');
    expect(formError({ ...f, weekday: 0, open: '0', fee: '0', slots: '40' })).toBe('');
  });
  it('payload: números, cuota vacía o 0 = null, cancha y lugar', () => {
    expect(schedulePayload({ title: ' Jueves ', weekday: 4, time: '21:00', slots: '10', fee: '30000', open: '6' }, { id: 'v1', name: 'Doble 5' })).toEqual({
      title: 'Jueves', weekday: 4, at_time: '21:00', slots: 10, fee_total: 30000, open_days_before: 6, venue_id: 'v1', location: 'Doble 5',
    });
    const p = schedulePayload(emptyScheduleForm(), { id: null, name: null });
    expect(p.fee_total).toBeNull();
    expect([p.venue_id, p.location]).toEqual([null, null]);
    expect(schedulePayload({ ...emptyScheduleForm(), fee: '0' }, { id: null, name: null }).fee_total).toBeNull();
  });
  it('scheduleError', () => {
    expect(scheduleError('new row violates row-level security policy')).toContain('admins');
    expect(scheduleError('otra')).toBe('otra');
  });
});
