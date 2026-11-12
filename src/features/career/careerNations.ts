// "De potrero a leyenda": los países del juego (con su bandera, la fuerza de su Selección y los colores de su camiseta) y los torneos de selecciones
// de cada confederación. Puro y sin entorno. Los números son del juego, no mediciones reales.
import type { Rng } from './careerRng';
import type { Conf, LeagueId, NatId } from './careerTypes';
import { CLUBS, LEAGUES, homePool, type ClubDef } from './careerWorld';

export interface Nation {
  id: NatId; name: string; flag: string; conf: Conf;
  /** Fuerza de la Selección: el OVR de un titular. Decide qué tan difícil es que te convoquen y cuánto llega en los torneos. */
  pw: number;
  /** Liga de su país en el juego (null si no tiene: ahí te vas de chico a otra de `migr`). */
  lg: LeagueId | null;
  migr: readonly LeagueId[];
  /** "la Selección de Uruguay". */
  team: string;
  /** Camiseta: color principal, color de detalle y color de la letra. */
  kit: readonly [string, string, string];
  stripes?: boolean;
}

const N = (id: string, name: string, flag: string, conf: Conf, pw: number, lg: LeagueId | null, migr: readonly LeagueId[], kit: readonly [string, string, string], o: { stripes?: boolean; team?: string } = {}): Nation =>
  ({ id, name, flag, conf, pw, lg, migr, team: o.team ?? `la Selección de ${name}`, kit, stripes: o.stripes });

/** Los países, con los que tienen liga en el juego primero. */
export const NATIONS: readonly Nation[] = [
  N('ar', 'Argentina', '🇦🇷', 'conmebol', 84.5, 'ar1', [], ['#75aadb', '#ffffff', '#16295c'], { stripes: true, team: 'la Selección Argentina' }),
  N('uy', 'Uruguay', '🇺🇾', 'conmebol', 81, 'uy', [], ['#6cb4e4', '#111111', '#111111']),
  N('br', 'Brasil', '🇧🇷', 'conmebol', 85, 'br', [], ['#f6c400', '#0a7a3d', '#0a3d8c'], { team: 'la Selección de Brasil' }),
  N('cl', 'Chile', '🇨🇱', 'conmebol', 73, 'cl', [], ['#d52b1e', '#0033a0', '#ffffff']),
  N('co', 'Colombia', '🇨🇴', 'conmebol', 80, 'co', [], ['#fcd116', '#003893', '#ce1126']),
  N('py', 'Paraguay', '🇵🇾', 'conmebol', 72, 'py', [], ['#d52b1e', '#ffffff', '#0038a8'], { stripes: true }),
  N('ec', 'Ecuador', '🇪🇨', 'conmebol', 75, 'ec', [], ['#f6c400', '#0b3b8c', '#0b3b8c']),
  N('bo', 'Bolivia', '🇧🇴', 'conmebol', 66, null, ['ar1', 'ar2', 'py', 'uy', 'cl'], ['#007934', '#f4e400', '#ffffff']),
  N('pe', 'Perú', '🇵🇪', 'conmebol', 71, null, ['ar1', 'ar2', 'cl', 'co', 'uy'], ['#ffffff', '#d91023', '#d91023'], { stripes: true }),
  N('ve', 'Venezuela', '🇻🇪', 'conmebol', 69, null, ['ar1', 'co', 'br', 'uy', 'cl'], ['#7a1f2b', '#f6c400', '#ffffff']),
  N('mx', 'México', '🇲🇽', 'concacaf', 77, 'mx', [], ['#006847', '#ffffff', '#ce1126']),
  N('us', 'Estados Unidos', '🇺🇸', 'concacaf', 76, 'us', [], ['#ffffff', '#0a3161', '#b31942']),
  N('sa', 'Arabia Saudita', '🇸🇦', 'afc', 70, 'sa', [], ['#006c35', '#ffffff', '#ffffff']),
  N('es', 'España', '🇪🇸', 'uefa', 86, 'es', [], ['#c60b1e', '#ffc400', '#ffc400']),
  N('en', 'Inglaterra', '🇬🇧', 'uefa', 85, 'en', [], ['#ffffff', '#1c2c5b', '#1c2c5b']),
  N('it', 'Italia', '🇮🇹', 'uefa', 82.5, 'it', [], ['#0066b3', '#ffffff', '#ffffff']),
  N('de', 'Alemania', '🇩🇪', 'uefa', 83, 'de', [], ['#ffffff', '#111111', '#111111']),
  N('fr', 'Francia', '🇫🇷', 'uefa', 85.5, 'fr', [], ['#1b3a8c', '#ffffff', '#ffffff']),
  N('pt', 'Portugal', '🇵🇹', 'uefa', 83.5, 'pt', [], ['#a50021', '#006600', '#ffd100']),
  N('nl', 'Países Bajos', '🇳🇱', 'uefa', 82, 'nl', [], ['#f36c21', '#ffffff', '#111111']),
  N('tr', 'Turquía', '🇹🇷', 'uefa', 77, 'tr', [], ['#e30a17', '#ffffff', '#ffffff']),
  // Sin liga en el juego: te vas de chico a una liga de su región
  N('be', 'Bélgica', '🇧🇪', 'uefa', 80, null, ['nl', 'en', 'fr', 'de'], ['#c8102e', '#fdda24', '#fdda24']),
  N('hr', 'Croacia', '🇭🇷', 'uefa', 79, null, ['it', 'de', 'es'], ['#ffffff', '#d52b1e', '#d52b1e'], { stripes: true }),
  N('ch', 'Suiza', '🇨🇭', 'uefa', 77, null, ['de', 'fr', 'it'], ['#d52b1e', '#ffffff', '#ffffff']),
  N('dk', 'Dinamarca', '🇩🇰', 'uefa', 76, null, ['nl', 'en', 'de'], ['#c8102e', '#ffffff', '#ffffff']),
  N('pl', 'Polonia', '🇵🇱', 'uefa', 74, null, ['de', 'it'], ['#ffffff', '#dc143c', '#dc143c']),
  N('ca', 'Canadá', '🇨🇦', 'concacaf', 72, null, ['us', 'mx'], ['#d52b1e', '#ffffff', '#ffffff']),
  N('cr', 'Costa Rica', '🇨🇷', 'concacaf', 68, null, ['mx', 'us'], ['#d52b1e', '#0b3b8c', '#ffffff']),
  N('jp', 'Japón', '🇯🇵', 'afc', 77.5, null, ['sa'], ['#0b3b8c', '#ffffff', '#ffffff']),
  N('kr', 'Corea del Sur', '🇰🇷', 'afc', 76, null, ['sa'], ['#d52b1e', '#0b3b8c', '#ffffff']),
  N('au', 'Australia', '🇦🇺', 'afc', 71, null, ['us', 'en', 'nl'], ['#f6c400', '#0a7a3d', '#0a7a3d']),
  N('ma', 'Marruecos', '🇲🇦', 'caf', 79, null, ['fr', 'es', 'pt'], ['#c1272d', '#006233', '#006233']),
  N('sn', 'Senegal', '🇸🇳', 'caf', 77, null, ['fr', 'es', 'pt'], ['#ffffff', '#00853f', '#00853f']),
  N('ng', 'Nigeria', '🇳🇬', 'caf', 74, null, ['pt', 'fr', 'es', 'tr'], ['#008751', '#ffffff', '#ffffff']),
  N('eg', 'Egipto', '🇪🇬', 'caf', 73, null, ['sa', 'pt', 'tr'], ['#ce1126', '#ffffff', '#ffffff']),
  N('gh', 'Ghana', '🇬🇭', 'caf', 72, null, ['pt', 'nl', 'tr'], ['#ffffff', '#ce1126', '#006b3f']),
];

/** Código de cada país en el CDN de ESPN (la bandera como imagen: los emoji de banderas no se ven en Windows). */
export const FLAG_CODE: Readonly<Record<string, string>> = {"ar":"arg","uy":"uru","br":"bra","cl":"chi","co":"col","py":"par","ec":"ecu","bo":"bol","pe":"per","ve":"ven","mx":"mex","us":"usa","sa":"ksa","es":"esp","en":"eng","it":"ita","de":"ger","fr":"fra","pt":"por","nl":"ned","tr":"tur","be":"bel","hr":"cro","ch":"sui","dk":"den","pl":"pol","ca":"can","cr":"crc","jp":"jpn","kr":"kor","au":"aus","ma":"mar","sn":"sen","ng":"nga","eg":"egy","gh":"gha"};
export const flagUrl = (id: NatId): string | null => (FLAG_CODE[id] ? `https://a.espncdn.com/combiner/i?img=/i/teamlogos/countries/500/${FLAG_CODE[id]}.png&w=72&h=72` : null);

export const NATION_BY_ID: ReadonlyMap<NatId, Nation> = new Map(NATIONS.map(n => [n.id, n]));
export const DEFAULT_NAT: NatId = 'ar';
export const nationOf = (id: NatId): Nation => NATION_BY_ID.get(id) ?? NATION_BY_ID.get(DEFAULT_NAT)!;
export const isNat = (x: unknown): x is NatId => typeof x === 'string' && NATION_BY_ID.has(x);
/** Bandera del país de una liga ("Brasil" → 🇧🇷), o '' si no hay. */
export const flagOfCountry = (country: string): string => NATIONS.find(n => n.name === country)?.flag ?? '';
/** El país de un club (el de su liga). */
export const countryOfLeague = (lg: LeagueId): string => LEAGUES[lg].country;

// ---------- Torneos de selecciones por confederación ----------

const GRUPOS = 'Fase de grupos', OCT = 'Octavos de final', CUA = 'Cuartos de final', SEM = 'Semifinales', FIN = 'Final';

export interface NatCup {
  conf: Exclude<Conf, 'none'>; name: string;
  /** "la Copa América": con artículo, para las frases. */
  the: string;
  rounds: readonly string[]; lo: number; hi: number; base: number;
  pts: number;
  /** ¿Se juega ese año? */
  year: (y: number) => boolean;
}
/** Copa América (CONMEBOL), Eurocopa (UEFA, el mismo ciclo), Copa Oro (CONCACAF, años impares), Copa Asiática (AFC) y Copa Africana (CAF, años impares). */
export const NAT_CUPS: Record<Exclude<Conf, 'none'>, NatCup> = {
  conmebol: { conf: 'conmebol', name: 'Copa América', the: 'la Copa América', rounds: [GRUPOS, CUA, SEM, FIN], lo: 66, hi: 82, base: 3, pts: 22, year: y => y % 4 === 0 },
  uefa: { conf: 'uefa', name: 'Eurocopa', the: 'la Eurocopa', rounds: [GRUPOS, OCT, CUA, SEM, FIN], lo: 68, hi: 83, base: 3, pts: 22, year: y => y % 4 === 0 },
  concacaf: { conf: 'concacaf', name: 'Copa Oro', the: 'la Copa Oro', rounds: [GRUPOS, CUA, SEM, FIN], lo: 58, hi: 74, base: 3, pts: 8, year: y => y % 2 === 1 },
  afc: { conf: 'afc', name: 'Copa Asiática', the: 'la Copa Asiática', rounds: [GRUPOS, OCT, CUA, SEM, FIN], lo: 60, hi: 76, base: 3, pts: 10, year: y => y % 4 === 3 },
  caf: { conf: 'caf', name: 'Copa Africana de Naciones', the: 'la Copa Africana de Naciones', rounds: [GRUPOS, OCT, CUA, SEM, FIN], lo: 60, hi: 77, base: 3, pts: 12, year: y => y % 2 === 1 },
};
export const NAT_CUP_LIST: readonly NatCup[] = Object.values(NAT_CUPS);
/** Premio al mejor jugador de un torneo de selecciones. */
export const natStar = (cupName: string) => `Mejor jugador de la ${cupName}`;
/** El torneo continental de selecciones de esa confederación en ese año (null si no se juega). */
export const natCupIn = (conf: Conf, year: number): NatCup | null => (conf !== 'none' && NAT_CUPS[conf].year(year) ? NAT_CUPS[conf] : null);

// ---------- Dónde arrancás ----------

/**
 * El club de tus inferiores: de tu país (con más peso Primera y Ascenso que los cinco grandes, en la Argentina; más los chicos que los de élite, en Europa)
 * o, si tu país no tiene liga en el juego, de una liga de tu región ("Te viniste de chico a…").
 */
export function pickHome(n: Nation, r: Rng): { club: ClubDef; moved: boolean } {
  if (n.lg === 'ar1') return { club: r.weighted(homePool()) ?? homePool()[0][0], moved: false };
  const lg: LeagueId = n.lg ?? r.pick(n.migr);
  const list = lg === 'ar1' || lg === 'ar2' ? homePool() : CLUBS.filter(c => c.lg === lg).map(c => [c, c.pw >= 82 ? 0.35 : 1] as const);
  return { club: r.weighted(list) ?? list[0][0], moved: n.lg === null };
}
