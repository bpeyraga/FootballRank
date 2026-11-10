import { describe, expect, it } from 'vitest';
import {
  ALL, awardValueText, championsBySeason, closedSeasons, defaultKey, defaultStart, nextDay, openSeason, rangeFor, resolveKey,
  seasonError, seasonOptions, seasonSpan, startError, trophiesOf,
  type Season, type SeasonAward,
} from './model';

const S = (id: string, name: string, starts_on: string, ends_on: string | null = null): Season =>
  ({ id, community_id: 'c', name, starts_on, ends_on, closed_at: ends_on ? `${ends_on}T12:00:00Z` : null });
const A = (season_id: string, kind: SeasonAward['kind'], profile_id: string, value = 1): SeasonAward => ({ season_id, kind, profile_id, value });

const apertura = S('s1', 'Apertura 2025', '2025-03-01', '2025-06-30');
const clausura = S('s2', 'Clausura 2025', '2025-08-01', '2025-11-30');
const actual = S('s3', 'Apertura 2026', '2026-03-01');

describe('temporadas: selector y rangos', () => {
  it('openSeason / closedSeasons: la abierta aparte y las cerradas de la más nueva a la más vieja', () => {
    const all = [apertura, actual, clausura];
    expect(openSeason(all)?.id).toBe('s3');
    expect(openSeason([apertura, clausura])).toBeNull();
    expect(closedSeasons(all).map(s => s.id)).toEqual(['s2', 's1']);
  });

  it('defaultKey / resolveKey: la actual si hay una abierta; si no, el histórico; una clave vieja cae al default', () => {
    expect(defaultKey([apertura, actual])).toBe('s3');
    expect(defaultKey([apertura])).toBe(ALL);
    expect(defaultKey([])).toBe(ALL);
    expect(resolveKey(null, [apertura, actual])).toBe('s3');
    expect(resolveKey(ALL, [apertura, actual])).toBe(ALL);        // eligió el histórico a propósito
    expect(resolveKey('s1', [apertura, actual])).toBe('s1');
    expect(resolveKey('s9', [apertura, actual])).toBe('s3');      // esa temporada ya no existe
    expect(resolveKey('s3', [apertura])).toBe(ALL);               // la borraron
  });

  it('seasonOptions: "Temporada actual" (si hay), "Histórico" y las cerradas por nombre', () => {
    expect(seasonOptions([apertura, actual, clausura]).map(o => [o.key, o.label])).toEqual([
      ['s3', 'Temporada actual'], [ALL, 'Histórico'], ['s2', 'Clausura 2025'], ['s1', 'Apertura 2025'],
    ]);
    expect(seasonOptions([apertura]).map(o => o.key)).toEqual([ALL, 's1']);
    expect(seasonOptions([]).map(o => o.key)).toEqual([ALL]);
  });

  it('rangeFor: el rango de la temporada (abierta sin tope al final); histórico o desconocida = sin filtro', () => {
    const all = [apertura, actual];
    expect(rangeFor('s1', all)).toEqual({ from: '2025-03-01', to: '2025-06-30' });
    expect(rangeFor('s3', all)).toEqual({ from: '2026-03-01', to: null });
    expect(rangeFor(ALL, all)).toBeNull();
    expect(rangeFor('zzz', all)).toBeNull();
  });

  it('seasonSpan: fechas cortas, con año si no es el de hoy, y "en curso" o "empieza" para la abierta', () => {
    expect(seasonSpan(apertura, '2025-12-01')).toBe('1 mar → 30 jun');
    expect(seasonSpan(apertura, '2026-02-01')).toBe('1 mar 2025 → 30 jun 2025');
    expect(seasonSpan(actual, '2026-04-10')).toBe('Desde el 1 mar · en curso');
    expect(seasonSpan(actual, '2026-02-20')).toBe('Empieza el 1 mar');
  });
});

describe('temporadas: empezar una nueva', () => {
  it('nextDay pasa de mes y de año', () => {
    expect(nextDay('2025-11-30')).toBe('2025-12-01');
    expect(nextDay('2025-12-31')).toBe('2026-01-01');
    expect(nextDay('2028-02-28')).toBe('2028-02-29');
  });

  it('defaultStart: hoy, o el día después del cierre de la última si todavía no llegó', () => {
    expect(defaultStart([], '2026-03-10')).toBe('2026-03-10');
    expect(defaultStart([apertura, clausura], '2026-03-10')).toBe('2026-03-10');
    expect(defaultStart([apertura, clausura], '2025-11-30')).toBe('2025-12-01');   // cerró hoy: la nueva arranca mañana
  });

  it('startError: nombre, fecha, una sola abierta y sin pisar la anterior', () => {
    expect(startError('  ', '2026-03-01', [])).toMatch(/nombre/);
    expect(startError('x'.repeat(41), '2026-03-01', [])).toMatch(/40/);
    expect(startError('Apertura', '', [])).toMatch(/día/);
    expect(startError('Apertura', '2026-03-01', [actual])).toMatch(/abierta/);
    expect(startError('Apertura', '2025-11-30', [apertura, clausura])).toMatch(/después del 30 nov/);
    expect(startError('Apertura', '2025-12-01', [apertura, clausura])).toBeNull();
    expect(startError(' Apertura 2026 ', '2026-03-01', [])).toBeNull();
  });

  it('seasonError traduce los códigos del servidor', () => {
    expect(seasonError('season_open')).toMatch(/abierta/);
    expect(seasonError('overlap')).toMatch(/después/);
    expect(seasonError('forbidden')).toMatch(/admins/);
    expect(seasonError('future_end')).toMatch(/futura/);
    expect(seasonError('algo raro')).toBe('algo raro');
  });
});

describe('campeones y trofeos', () => {
  const awards = [
    A('s1', 'fair_play', 'cris', 0.5), A('s1', 'goleador', 'ana', 12), A('s1', 'figura', 'ana', 3), A('s1', 'figura', 'beto', 3),
    A('s2', 'goleador', 'beto', 9), A('s2', 'presente', 'ana', 14),
  ];

  it('championsBySeason: cerradas de la más nueva a la más vieja, premios en orden fijo y empates con todos', () => {
    const list = championsBySeason([apertura, actual, clausura], awards);
    expect(list.map(x => x.season.id)).toEqual(['s2', 's1']);                       // la abierta no tiene campeones
    expect(list[0].champions.map(c => c.kind)).toEqual(['goleador', 'presente']);
    expect(list[1].champions.map(c => c.kind)).toEqual(['goleador', 'figura', 'fair_play']);
    expect(list[1].champions[1]).toEqual({ kind: 'figura', value: 3, winners: ['ana', 'beto'] });
  });

  it('championsBySeason: una cerrada sin premios queda con la lista vacía', () => {
    const list = championsBySeason([apertura], []);
    expect(list).toHaveLength(1);
    expect(list[0].champions).toEqual([]);
  });

  it('trophiesOf: los de un jugador, la temporada más nueva primero y en orden de premio', () => {
    const t = trophiesOf('ana', [apertura, clausura, actual], awards);
    expect(t.map(x => [x.season.name, x.kind, x.value])).toEqual([
      ['Clausura 2025', 'presente', 14], ['Apertura 2025', 'goleador', 12], ['Apertura 2025', 'figura', 3],
    ]);
    expect(trophiesOf('nadie', [apertura, clausura], awards)).toEqual([]);
    expect(trophiesOf('ana', [], awards)).toEqual([]);   // sin la temporada no hay con qué mostrarlo
  });

  it('awardValueText: singular, plural y fair play', () => {
    expect(awardValueText('goleador', 1)).toBe('1 gol');
    expect(awardValueText('goleador', 12)).toBe('12 goles');
    expect(awardValueText('asistidor', 7)).toBe('7 asistencias');
    expect(awardValueText('figura', 1)).toBe('1 vez figura');
    expect(awardValueText('figura', 3)).toBe('3 veces figura');
    expect(awardValueText('presente', 14)).toBe('14 partidos');
    expect(awardValueText('fair_play', 0)).toBe('Sin tarjetas ni faltas');
    expect(awardValueText('fair_play', 1.25)).toBe('1,25 pts de sanción');
  });
});
