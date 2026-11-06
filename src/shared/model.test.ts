import { describe, expect, it } from 'vitest';
import { infoLine, teamTally } from './model';

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
