import { describe, expect, it } from 'vitest';
import { POS, POS_WEIGHTS, infoLine, ovr, posOvrs, teamTally } from './model';

describe('ovr por posición', () => {
  const s = { rit: 80, tir: 85, pas: 70, reg: 80, def: 30, fis: 65 }; // delantero con poca defensa
  it('los pesos de cada posición suman 100', () => {
    for (const p of POS) expect(Object.values(POS_WEIGHTS[p]).reduce((t, x) => t + (x ?? 0), 0)).toBe(100);
  });
  it('pondera cada atributo según la posición', () => {
    expect(ovr(s)).toBe(68);          // sin posición: promedio simple
    expect(ovr(s, 'DEL')).toBe(76);
    expect(ovr(s, 'MED')).toBe(71);   // 71.25
    expect(ovr(s, 'DEF')).toBe(58);   // 57.5 redondea para arriba (igual que round() en la base)
  });
  it('el arquero usa el 🧤; sin calificar, el promedio simple', () => {
    expect(ovr(s, 'ARQ')).toBe(68);
    expect(ovr({ ...s, arq: 90 }, 'ARQ')).toBe(78); // (5*80 + 10*70 + 10*30 + 15*65 + 60*90) / 100 = 77.75
  });
  it('posOvrs da las cuatro (ARQ null sin 🧤)', () => {
    expect(posOvrs(s)).toEqual({ ARQ: null, DEF: 58, MED: 71, DEL: 76 });
  });
});

describe('infoLine', () => {
  it('junta posición, número y equipo, salteando lo vacío', () => {
    expect(infoLine({ pos: 'DEL', shirt_number: 10, fav_team: 'River Plate' })).toBe('DEL · #10 · River Plate');
    expect(infoLine({ pos: 'ARQ', shirt_number: null, fav_team: 'Boca Juniors' })).toBe('ARQ · Boca Juniors');
    expect(infoLine({ pos: 'MED', shirt_number: null, fav_team: null })).toBe('MED');
  });
});

describe('teamTally', () => {
  it('cuenta hinchas por equipo, de más a menos, y los sin equipo', () => {
    const r = teamTally([{ fav_team: 'Boca Juniors' }, { fav_team: 'River Plate' }, { fav_team: 'River Plate' }, { fav_team: null }, { fav_team: ' ' }]);
    expect(r.teams).toEqual([{ team: 'River Plate', n: 2 }, { team: 'Boca Juniors', n: 1 }]);
    expect(r.none).toBe(2);
  });
});
