import { describe, expect, it } from 'vitest';
import { ovr } from '../../shared/model';
import {
  DEFAULT_RADIUS, LABEL_MAX, RADII, SHOW_MAX, UNNAMED_ZONE,
  buildZoneRanking, fmtDistance, geoErrorText, inviteText, labelFromReverse, miniStats, normalizeZone, ovrSource, parsePlaces, placeLabel,
  posCounts, roundCoord, rowStats, sameZone, shortAdmin, shortZone, splitPodium, validCoords, visibleRanking, widerRadius, zoneErrorText, zoneLine,
  type ZoneRow,
} from './model';

const row = (id: string, o: Partial<ZoneRow> = {}): ZoneRow => ({
  profile_id: id, name: id, photo_url: null, pos: 'MED', fav_team: null, shirt_number: null,
  zone_label: 'Palermo, CABA', distance_band: 5,
  rit: 60, tir: 60, pas: 60, reg: 60, def: 60, fis: 60, n_votes: 3,
  matches_played: 0, goals: 0, assists: 0, mvps: 0, communities: 1, ...o,
});
const flat = (n: number): Partial<ZoneRow> => ({ rit: n, tir: n, pas: n, reg: n, def: n, fis: n });

describe('coordenadas gruesas', () => {
  it('redondea a 2 decimales (~1 km) y no deja -0', () => {
    expect(roundCoord(-34.58856)).toBe(-34.59);
    expect(roundCoord(-58.43053)).toBe(-58.43);
    expect(roundCoord(-34.5849)).toBe(-34.58);
    expect(roundCoord(-0.004)).toBe(0);
    expect(Object.is(roundCoord(-0.004), -0)).toBe(false);
    expect(roundCoord(roundCoord(-34.58856))).toBe(-34.59); // idempotente
  });
  it('valida rangos y números finitos', () => {
    expect(validCoords(-34.6, -58.4)).toBe(true);
    expect(validCoords(91, 0)).toBe(false);
    expect(validCoords(0, -181)).toBe(false);
    expect(validCoords(NaN, 0)).toBe(false);
    expect(validCoords(0, Infinity)).toBe(false);
  });
  it('normalizeZone: etiqueta recortada, coordenadas redondeadas, opt-in explícito', () => {
    expect(normalizeZone({ label: '  Palermo, CABA ', lat: -34.58856, lng: -58.43053, public: true }))
      .toEqual({ label: 'Palermo, CABA', lat: -34.59, lng: -58.43, public: true });
    expect(normalizeZone({ label: 'x'.repeat(100), lat: 1, lng: 1, public: false })!.label).toHaveLength(LABEL_MAX);
    expect(normalizeZone({ label: '   ', lat: 1, lng: 1, public: true })).toBeNull();
    expect(normalizeZone({ label: 'x', lat: 120, lng: 1, public: true })).toBeNull();
    expect(normalizeZone({ label: 'x', lat: 1, lng: 1, public: undefined as any })!.public).toBe(false);
  });
  it('sameZone', () => {
    const a = { label: 'A', lat: 1, lng: 2, public: false };
    expect(sameZone(null, null)).toBe(true);
    expect(sameZone(a, { ...a })).toBe(true);
    expect(sameZone(a, { ...a, public: true })).toBe(false);
    expect(sameZone(a, null)).toBe(false);
  });
});

describe('textos', () => {
  it('distancia por banda: "a menos de X km"', () => {
    expect(fmtDistance(2)).toBe('a menos de 2 km');
    expect(fmtDistance(5)).toBe('a menos de 5 km');
    expect(fmtDistance(50)).toBe('a menos de 50 km');
    expect(fmtDistance(5, true)).toBe('< 5 km');
    expect(fmtDistance(0)).toBe('');
    expect(fmtDistance(null)).toBe('');
    expect(fmtDistance(NaN)).toBe('');
    expect(fmtDistance(-2)).toBe('');
  });
  it('zoneLine: barrio · distancia; sin nombre solo la distancia; vos = tu zona', () => {
    expect(zoneLine({ zoneLabel: 'Palermo, CABA', distanceBand: 5, isMe: false })).toBe('Palermo, CABA · a menos de 5 km');
    expect(zoneLine({ zoneLabel: UNNAMED_ZONE, distanceBand: 5, isMe: false })).toBe('a menos de 5 km');
    expect(zoneLine({ zoneLabel: 'Palermo, CABA', distanceBand: 1, isMe: true })).toBe('Palermo, CABA · tu zona');
    expect(zoneLine({ zoneLabel: UNNAMED_ZONE, distanceBand: 1, isMe: true })).toBe('tu zona');
    expect(zoneLine({ zoneLabel: 'Quilmes, Buenos Aires', distanceBand: 25, isMe: false }, true)).toBe('Quilmes · < 25 km');
    expect(zoneLine({ zoneLabel: UNNAMED_ZONE, distanceBand: 25, isMe: false }, true)).toBe('< 25 km');
    expect(shortZone('Palermo, CABA')).toBe('Palermo');
    expect(shortZone('Rosario')).toBe('Rosario');
    expect(shortZone(UNNAMED_ZONE)).toBe('');
  });
  it('miniStats con singular y plural', () => {
    expect(miniStats({ pj: 12, goals: 5, mvps: 2 })).toBe('12 PJ · 5 goles · 2 figuras');
    expect(miniStats({ pj: 1, goals: 1, mvps: 1 })).toBe('1 PJ · 1 gol · 1 figura');
    expect(miniStats({ pj: 0, goals: 0, mvps: 0 })).toBe('0 PJ · 0 goles · 0 figuras');
  });
  it('de dónde sale el OVR', () => {
    expect(ovrSource({ nVotes: 0 })).toMatch(/autoevaluación/);
    expect(ovrSource({ nVotes: 1 })).toBe('OVR según 1 voto de compañeros');
    expect(ovrSource({ nVotes: 7 })).toBe('OVR según 7 votos de compañeros');
  });
  it('invitación y errores en español', () => {
    expect(inviteText('Palermo, CABA', 'https://x.app')).toBe('⚽ Sumate al ranking de Palermo, CABA en Ranking Fútbol y mirá quién es el mejor del barrio: https://x.app/');
    expect(inviteText(UNNAMED_ZONE, 'https://x.app')).toContain('mi zona');
    expect(zoneErrorText(new Error('bad_coords'))).toMatch(/ubicación no es válida/);
    expect(zoneErrorText(new Error('bad_label'))).toMatch(/nombre/);
    expect(zoneErrorText(new Error('too_many_moves'))).toBe('Ya cambiaste tu zona varias veces hoy. Probá mañana.');
    expect(zoneErrorText(new Error('not_authenticated'))).toMatch(/sesión/);
    expect(zoneErrorText(new Error('Could not find the function public.set_my_zone'))).toMatch(/todavía no está disponible/);
    expect(zoneErrorText(new Error('boom'))).toBe('boom');
    expect(zoneErrorText(null)).toBe('Error de red');
    expect(geoErrorText(1)).toMatch(/permiso/);
    expect(geoErrorText(3)).toMatch(/demoró|Tardó/);
    expect(geoErrorText(undefined)).toMatch(/No pudimos detectar/);
  });
});

describe('ranking de la zona', () => {
  it('el OVR sale del ovr() compartido, ponderado por la posición, de los seis atributos que manda la base', () => {
    const r = row('a', { rit: 80, tir: 70, pas: 60, reg: 50, def: 40, fis: 30 });
    expect(rowStats(r)).toEqual({ rit: 80, tir: 70, pas: 60, reg: 50, def: 40, fis: 30 });
    const [p] = buildZoneRanking([r], null);
    expect(p.ovr).toBe(ovr({ rit: 80, tir: 70, pas: 60, reg: 50, def: 40, fis: 30 }, 'MED'));
    expect(p.ovr).toBe(58); // MED: (15*80 + 15*70 + 30*60 + 20*50 + 10*40 + 10*30) / 100 = 57.5
    expect(p.tier).toBe('bronze');
  });
  it('color de carta por OVR (igual que el resto de la app)', () => {
    const tiers = buildZoneRanking([row('o', flat(75)), row('p', flat(74)), row('q', flat(65)), row('r', flat(64))], null).map(p => [p.id, p.tier]);
    expect(tiers).toEqual([['o', 'gold'], ['p', 'silver'], ['q', 'silver'], ['r', 'bronze']]);
  });
  it('ordena por OVR de mayor a menor y numera los puestos', () => {
    const l = buildZoneRanking([row('b', flat(60)), row('a', flat(80)), row('c', flat(70))], null);
    expect(l.map(p => [p.id, p.rank, p.ovr])).toEqual([['a', 1, 80], ['c', 2, 70], ['b', 3, 60]]);
  });
  it('desempata por partidos jugados y después por nombre (orden estable)', () => {
    const l = buildZoneRanking([
      row('z', { ...flat(70), name: 'Zeta', matches_played: 5 }),
      row('a', { ...flat(70), name: 'Ana', matches_played: 5 }),
      row('m', { ...flat(70), name: 'Mati', matches_played: 9 }),
    ], null);
    expect(l.map(p => p.name)).toEqual(['Mati', 'Ana', 'Zeta']);
  });
  it('filtra por radio según la banda de distancia que devuelve la base', () => {
    const rows = [row('cerca', { distance_band: 2 }), row('borde', { distance_band: 5 }), row('lejos', { distance_band: 10 }), row('muylejos', { distance_band: 50 })];
    expect(buildZoneRanking(rows, null, { km: 5 }).map(p => p.id).sort()).toEqual(['borde', 'cerca']);
    expect(buildZoneRanking(rows, null, { km: 10 })).toHaveLength(3);
    expect(buildZoneRanking(rows, null, { km: 50 })).toHaveLength(4);
    expect(buildZoneRanking(rows, null)).toHaveLength(4);
  });
  it('los votados van primero; los autoevaluados después aunque tengan más OVR', () => {
    const l = buildZoneRanking([
      row('auto99', { ...flat(99), n_votes: 0 }), row('v60', { ...flat(60), n_votes: 2 }), row('v80', { ...flat(80), n_votes: 5 }), row('auto70', { ...flat(70), n_votes: 0 }),
    ], null);
    expect(l.map(p => [p.id, p.rank, p.voted])).toEqual([['v80', 1, true], ['v60', 2, true], ['auto99', 3, false], ['auto70', 4, false]]);
    expect(l.map(p => p.nVotes)).toEqual([5, 2, 0, 0]);
  });
  it('podio: solo votados, hasta 3; con menos de 3 votados hay menos lugares', () => {
    const mk = (voted: number, self: number) => buildZoneRanking([
      ...Array.from({ length: voted }, (_, i) => row(`v${i}`, { ...flat(70 - i), n_votes: 2 })),
      ...Array.from({ length: self }, (_, i) => row(`s${i}`, { ...flat(99 - i), n_votes: 0 })),
    ], null);
    const a = splitPodium(mk(5, 2).slice(0, 50));
    expect(a.podium.map(p => p.id)).toEqual(['v0', 'v1', 'v2']);
    expect(a.rest.map(p => p.id)).toEqual(['v3', 'v4', 's0', 's1']);
    const b = splitPodium(mk(2, 3));
    expect(b.podium.map(p => p.id)).toEqual(['v0', 'v1']);
    expect(b.rest.map(p => p.id)).toEqual(['s0', 's1', 's2']);
    const c = splitPodium(mk(0, 4));
    expect(c.podium).toEqual([]);
    expect(c.rest).toHaveLength(4);
    expect(splitPodium([])).toEqual({ podium: [], rest: [] });
    expect(splitPodium(mk(3, 0)).podium).toHaveLength(3);
  });
  it('filtra por posición y numera dentro de lo filtrado', () => {
    const rows = [row('a', { ...flat(90), pos: 'DEL' }), row('b', { ...flat(80), pos: 'DEF' }), row('c', { ...flat(70), pos: 'DEF' })];
    expect(buildZoneRanking(rows, null, { pos: 'DEF' }).map(p => [p.id, p.rank])).toEqual([['b', 1], ['c', 2]]);
    expect(buildZoneRanking(rows, null, { pos: 'ARQ' })).toEqual([]);
    expect(buildZoneRanking(rows, null, { pos: null })).toHaveLength(3);
  });
  it('marca "vos" y deja afuera a quien no tiene OVR', () => {
    const rows = [row('yo', flat(70)), row('x', flat(60)), row('vacio', { rit: null }), row('nan', { fis: NaN })];
    const l = buildZoneRanking(rows, 'yo');
    expect(l.map(p => p.id)).toEqual(['yo', 'x']);
    expect(l.find(p => p.isMe)!.id).toBe('yo');
    expect(buildZoneRanking(rows, null).every(p => !p.isMe)).toBe(true);
  });
  it('conserva los datos de cada jugador', () => {
    const [p] = buildZoneRanking([row('a', { name: 'El Chino', pos: 'DEL', shirt_number: 10, fav_team: 'River Plate', zone_label: 'Quilmes', distance_band: 10,
      n_votes: 4, matches_played: 20, goals: 11, assists: 6, mvps: 3, communities: 2, photo_url: 'u.jpg' })], null);
    expect(p).toMatchObject({ id: 'a', name: 'El Chino', pos: 'DEL', shirt_number: 10, fav_team: 'River Plate', zoneLabel: 'Quilmes', distanceBand: 10, voted: true,
      nVotes: 4, pj: 20, goals: 11, assists: 6, mvps: 3, communities: 2, photo_url: 'u.jpg' });
  });
  it('cuenta jugadores por posición dentro del radio', () => {
    const rows = [row('a', { pos: 'DEL', distance_band: 2 }), row('b', { pos: 'DEL', distance_band: 25 }), row('c', { pos: 'ARQ', distance_band: 5 }), row('d', { rit: null })];
    expect(posCounts(rows, 10)).toEqual({ all: 2, ARQ: 1, DEF: 0, MED: 0, DEL: 1 });
    expect(posCounts(rows, 25)).toEqual({ all: 3, ARQ: 1, DEF: 0, MED: 0, DEL: 2 });
  });
  it('visibleRanking: tope de filas y "vos" siempre visible', () => {
    const rows = Array.from({ length: 60 }, (_, i) => row(`p${String(i).padStart(2, '0')}`, flat(99 - i)));
    const l = buildZoneRanking(rows, 'p55');
    const v = visibleRanking(l);
    expect(v.shown).toHaveLength(SHOW_MAX);
    expect(v.mine?.id).toBe('p55');
    expect(v.mine?.rank).toBe(56);
    expect(v.hidden).toBe(60 - SHOW_MAX - 1);
    const v2 = visibleRanking(buildZoneRanking(rows, 'p03'));
    expect(v2.mine).toBeNull();
    expect(v2.hidden).toBe(10);
    const v3 = visibleRanking(buildZoneRanking(rows.slice(0, 5), null));
    expect(v3).toMatchObject({ mine: null, hidden: 0 });
    expect(v3.shown).toHaveLength(5);
  });
  it('widerRadius: el primer radio mayor donde aparece alguien más', () => {
    const rows = [row('yo', { distance_band: 2 }), row('a', { distance_band: 25 }), row('b', { distance_band: 50 })];
    expect(widerRadius(rows, 5, 'yo')).toBe(25);
    expect(widerRadius(rows, 10, 'yo')).toBe(25);
    expect(widerRadius(rows, 25, 'yo')).toBe(50);
    expect(widerRadius(rows, 50, 'yo')).toBeNull();
    expect(widerRadius([row('yo')], 5, 'yo')).toBeNull();
  });
  it('los radios del selector', () => {
    expect([...RADII]).toEqual([5, 10, 25, 50]);
    expect(RADII).toContain(DEFAULT_RADIUS);
  });
});

describe('lugares (Open-Meteo)', () => {
  const PALERMO = {
    results: [
      { id: 3430234, name: 'Palermo', latitude: -34.58856, longitude: -58.43053, country_code: 'AR', admin1: 'Ciudad Autónoma de Buenos Aires', admin2: 'Comuna 14' },
      { id: 1, name: 'Palermo', latitude: -28.95188, longitude: -58.90525, country_code: 'AR', admin1: 'Provincia de Corrientes', admin2: 'Departamento de Lavalle' },
      { id: 2, name: 'Quilmes', latitude: -34.72065, longitude: -58.25454, admin1: 'Buenos Aires', admin2: 'Partido de Quilmes' },
    ],
  };
  it('abrevia provincias y partidos', () => {
    expect(shortAdmin('Ciudad Autónoma de Buenos Aires')).toBe('CABA');
    expect(shortAdmin('Provincia de Tucumán')).toBe('Tucumán');
    expect(shortAdmin('Provincia del Neuquén')).toBe('Neuquén');
    expect(shortAdmin('Provincia de La Rioja')).toBe('La Rioja');
    expect(shortAdmin('Partido de Tres de Febrero')).toBe('Tres de Febrero');
    expect(shortAdmin('Departamento de Lavalle')).toBe('Lavalle');
    expect(shortAdmin(undefined)).toBe('');
  });
  it('arma la etiqueta "Barrio, Provincia"', () => {
    expect(placeLabel('Palermo', 'Ciudad Autónoma de Buenos Aires')).toBe('Palermo, CABA');
    expect(placeLabel('Rosario', 'Provincia de Santa Fe')).toBe('Rosario, Santa Fe');
    expect(placeLabel('Mendoza', 'Provincia de Mendoza')).toBe('Mendoza');
    expect(placeLabel('Córdoba', 'Provincia de Córdoba')).toBe('Córdoba');
    expect(placeLabel('Quilmes', undefined)).toBe('Quilmes');
    expect(placeLabel('x'.repeat(80), 'Provincia de Salta')).toHaveLength(LABEL_MAX);
  });
  it('parsePlaces: etiqueta, detalle y coordenadas ya redondeadas', () => {
    const l = parsePlaces(PALERMO);
    expect(l[0]).toEqual({ label: 'Palermo, CABA', detail: 'Comuna 14', lat: -34.59, lng: -58.43 });
    expect(l[1]).toMatchObject({ label: 'Palermo, Corrientes', detail: 'Lavalle' });
    expect(l[2]).toMatchObject({ label: 'Quilmes, Buenos Aires', detail: '' }); // el partido se llama igual: no se repite
  });
  it('parsePlaces ignora lo raro y los repetidos', () => {
    expect(parsePlaces(null)).toEqual([]);
    expect(parsePlaces({})).toEqual([]);
    expect(parsePlaces({ results: 'x' })).toEqual([]);
    expect(parsePlaces({ results: [{ name: 'A', latitude: 'x', longitude: 1 }, { latitude: 1, longitude: 1 }, null, { name: 'B', latitude: 95, longitude: 0 }] })).toEqual([]);
    const dup = { name: 'Palermo', latitude: -34.5, longitude: -58.4, admin1: 'Ciudad Autónoma de Buenos Aires', admin2: 'Comuna 14' };
    expect(parsePlaces({ results: [dup, { ...dup, latitude: -34.51 }] })).toHaveLength(1);
  });
});

describe('nombre del barrio (reverse)', () => {
  it('barrio y ciudad', () => {
    expect(labelFromReverse({ address: { suburb: 'Palermo', city: 'Buenos Aires', state: 'Ciudad Autónoma de Buenos Aires', country: 'Argentina' } })).toBe('Palermo, Buenos Aires');
    expect(labelFromReverse({ address: { neighbourhood: 'Centro', town: 'Quilmes', county: 'Partido de Quilmes' } })).toBe('Centro, Quilmes');
  });
  it('sin repetir y con alternativas', () => {
    expect(labelFromReverse({ address: { suburb: 'Quilmes', city: 'Quilmes' } })).toBe('Quilmes');
    expect(labelFromReverse({ address: { village: 'San Javier' } })).toBe('San Javier');
    expect(labelFromReverse({ address: { state: 'Provincia de Santa Fe' } })).toBe('Santa Fe');
  });
  it('null si no hay con qué', () => {
    expect(labelFromReverse(null)).toBeNull();
    expect(labelFromReverse({})).toBeNull();
    expect(labelFromReverse({ address: {} })).toBeNull();
    expect(labelFromReverse({ address: { suburb: 12 } })).toBeNull();
  });
});
