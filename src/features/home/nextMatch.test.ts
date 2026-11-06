import { describe, expect, it } from 'vitest';
import { countdown, slotsLine } from './nextMatch';

// Fechas locales (sin Z) para no depender de la zona horaria de quien corre el test.
const at = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi);

describe('countdown', () => {
  const now = at(2026, 11, 10, 12, 0);

  it('hoy, a más de 3 horas', () => {
    const c = countdown(at(2026, 11, 10, 21, 0).toISOString(), now);
    expect(c.big).toBe('Hoy');
    expect(c.time).toBe('21:00');
    expect(c.short).toBe('hoy 21:00');
    expect(c.soon).toBe(false);
  });

  it('mañana', () => {
    const c = countdown(at(2026, 11, 11, 9, 5).toISOString(), now);
    expect(c.big).toBe('Mañana');
    expect(c.short).toBe('mañana 09:05');
  });

  it('en varios días', () => {
    const c = countdown(at(2026, 11, 12, 21, 30).toISOString(), now);
    expect(c.big).toBe('En 2 días');
    expect(c.short).toBe('en 2 días');
    expect(c.time).toBe('21:30');
  });

  it('cuenta por día calendario, no por 24 horas', () => {
    // 23:00 de hoy → 01:00 de mañana: son 2 horas pero ya es "mañana"
    const late = at(2026, 11, 10, 23, 0);
    expect(countdown(at(2026, 11, 11, 1, 0).toISOString(), late).big).toBe('En 2 h');
    expect(countdown(at(2026, 11, 11, 20, 0).toISOString(), late).big).toBe('Mañana');
  });

  it('menos de una hora y menos de tres', () => {
    expect(countdown(at(2026, 11, 10, 12, 45).toISOString(), now)).toMatchObject({ big: 'En 45 min', soon: true });
    expect(countdown(at(2026, 11, 10, 14, 15).toISOString(), now)).toMatchObject({ big: 'En 2 h 15 min', soon: true });
    expect(countdown(at(2026, 11, 10, 14, 0).toISOString(), now).big).toBe('En 2 h');
  });

  it('ya empezó', () => {
    expect(countdown(at(2026, 11, 10, 11, 0).toISOString(), now).big).toBe('Ahora');
  });
});

describe('slotsLine', () => {
  it('con y sin lista de espera', () => {
    expect(slotsLine(7, 10)).toBe('7/10 anotados');
    expect(slotsLine(10, 10, 2)).toBe('10/10 anotados · 2 en espera');
  });
});
