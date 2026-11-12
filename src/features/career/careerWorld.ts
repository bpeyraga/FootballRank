// "De potrero a leyenda": el mundo del juego. Clubes, ligas, copas y torneos REALES (solo nombres en texto: ni escudos de competencias ni
// nombres de jugadores). Los clubes argentinos salen de la lista de la app (shared/teams) con los mismos nombres, así se les puede mostrar el
// escudo con <Crest>. La fuerza de cada club (`pw`) es el OVR de un titular y es un número del juego, no una medición real.
import { TEAMS_ASCENSO, TEAMS_PRIMERA } from '../../shared/teams';
import type { Rng } from './careerRng';
import type { Club, Conf, ContId, LeagueId, Tier } from './careerTypes';

export type { Conf };

export interface League {
  id: LeagueId; name: string; country: string; conf: Conf;
  /** Equipos que juegan la liga (incluye a los que no están en la lista de clubes del juego). */
  n: number;
  /** Partidos de liga por temporada. */
  games: number;
  /** Copa nacional (null si el juego no la juega) y cuántas rondas tiene. */
  cup: string | null; cupRounds: number;
  /** Copa continental a la que clasifica el campeón de la copa nacional. */
  cupQual: ContId | null;
  /** A qué copa continental clasifica cada puesto: [copa, hasta qué puesto]. */
  slots: readonly (readonly [ContId, number])[];
  /** Cuánto se sacude la tabla de un año al otro (más alto = más parejo e impredecible). */
  sigma: number;
  /** Puntos de Legado del título de liga y de copa. */
  titlePts: number; cupPts: number;
  /** Vidriera: suma o resta a las chances de que te convoque la Selección. */
  vis: number;
  /** Frase para las ofertas de esa liga. */
  flavor: string;
  /** Un segundo torneo largo de la misma temporada con su propia tabla (la Copa de la Liga argentina): nombre, puntos de Legado y copa continental que da. */
  extra?: { name: string; pts: number; qual: ContId };
}

const lg = (l: League): League => l;

export const LEAGUES: Record<LeagueId, League> = {
  inf: lg({ id: 'inf', name: 'Torneo de Reserva', country: 'Argentina', conf: 'none', n: 20, games: 18, cup: null, cupRounds: 0, cupQual: null, slots: [], sigma: 5, titlePts: 2, cupPts: 0, vis: -12, flavor: '' }),
  ar1: lg({ id: 'ar1', name: 'Liga Profesional', country: 'Argentina', conf: 'conmebol', n: 32, games: 28, cup: 'Copa Argentina', cupRounds: 6, cupQual: 'lib', slots: [['lib', 4], ['sud', 12]], sigma: 5.5, titlePts: 9, cupPts: 5, vis: -1, flavor: 'El fútbol de casa, con la hinchada encima.', extra: { name: 'Copa de la Liga', pts: 6, qual: 'lib' } }),
  ar2: lg({ id: 'ar2', name: 'Primera Nacional', country: 'Argentina', conf: 'conmebol', n: 36, games: 34, cup: 'Copa Argentina', cupRounds: 6, cupQual: 'lib', slots: [], sigma: 5, titlePts: 4, cupPts: 5, vis: -8, flavor: 'A pelear el ascenso, con todo el sacrificio del Ascenso.' }),
  br: lg({ id: 'br', name: 'Brasileirão', country: 'Brasil', conf: 'conmebol', n: 20, games: 38, cup: 'Copa do Brasil', cupRounds: 6, cupQual: 'lib', slots: [['lib', 6], ['sud', 12]], sigma: 5, titlePts: 11, cupPts: 7, vis: -1, flavor: 'Estadios llenos y exigencia total: el fútbol brasileño no perdona.' }),
  uy: lg({ id: 'uy', name: 'Campeonato Uruguayo', country: 'Uruguay', conf: 'conmebol', n: 16, games: 30, cup: null, cupRounds: 0, cupQual: null, slots: [['lib', 2], ['sud', 5]], sigma: 5, titlePts: 6, cupPts: 0, vis: -3, flavor: 'Un fútbol de garra y de cancha pesada, a un paso de casa.' }),
  cl: lg({ id: 'cl', name: 'Campeonato Chileno', country: 'Chile', conf: 'conmebol', n: 16, games: 30, cup: null, cupRounds: 0, cupQual: null, slots: [['lib', 2], ['sud', 5]], sigma: 5, titlePts: 5, cupPts: 0, vis: -4, flavor: 'Un fútbol ordenado, del otro lado de la cordillera.' }),
  co: lg({ id: 'co', name: 'Liga Colombiana', country: 'Colombia', conf: 'conmebol', n: 20, games: 38, cup: null, cupRounds: 0, cupQual: null, slots: [['lib', 3], ['sud', 6]], sigma: 5.5, titlePts: 5, cupPts: 0, vis: -4, flavor: 'Mucha pasión y mucha altura.' }),
  py: lg({ id: 'py', name: 'Primera División de Paraguay', country: 'Paraguay', conf: 'conmebol', n: 12, games: 22, cup: null, cupRounds: 0, cupQual: null, slots: [['lib', 3], ['sud', 5]], sigma: 5, titlePts: 5, cupPts: 0, vis: -4, flavor: 'Mucha garra y estadios que se caen.' }),
  ec: lg({ id: 'ec', name: 'LigaPro de Ecuador', country: 'Ecuador', conf: 'conmebol', n: 16, games: 30, cup: null, cupRounds: 0, cupQual: null, slots: [['lib', 3], ['sud', 5]], sigma: 5.5, titlePts: 5, cupPts: 0, vis: -4, flavor: 'Altura, calor y pelea en cada partido.' }),
  mx: lg({ id: 'mx', name: 'Liga MX', country: 'México', conf: 'concacaf', n: 18, games: 34, cup: null, cupRounds: 0, cupQual: null, slots: [['ccc', 4]], sigma: 6, titlePts: 8, cupPts: 0, vis: -2, flavor: 'Fútbol intenso, buena plata y mucha altura.' }),
  us: lg({ id: 'us', name: 'MLS', country: 'Estados Unidos', conf: 'concacaf', n: 30, games: 34, cup: null, cupRounds: 0, cupQual: null, slots: [['ccc', 6]], sigma: 6.5, titlePts: 6, cupPts: 0, vis: -4, flavor: 'Plata y vida tranquila, con menos exigencia y menos vidriera.' }),
  sa: lg({ id: 'sa', name: 'Saudi Pro League', country: 'Arabia Saudita', conf: 'afc', n: 18, games: 34, cup: null, cupRounds: 0, cupQual: null, slots: [['acl', 3]], sigma: 5.5, titlePts: 5, cupPts: 0, vis: -4, flavor: 'Te llenan de plata, pero la vidriera es menor.' }),
  en: lg({ id: 'en', name: 'Premier League', country: 'Inglaterra', conf: 'uefa', n: 20, games: 38, cup: 'FA Cup', cupRounds: 6, cupQual: 'el', slots: [['cl', 4], ['el', 6], ['ecl', 7]], sigma: 4.5, titlePts: 16, cupPts: 8, vis: 1, flavor: 'La liga más mirada del planeta.' }),
  es: lg({ id: 'es', name: 'LaLiga', country: 'España', conf: 'uefa', n: 20, games: 38, cup: 'Copa del Rey', cupRounds: 6, cupQual: 'el', slots: [['cl', 4], ['el', 6], ['ecl', 7]], sigma: 4.5, titlePts: 16, cupPts: 7, vis: 1, flavor: 'Técnica, vitrina y toda la mirada del mundo.' }),
  it: lg({ id: 'it', name: 'Serie A', country: 'Italia', conf: 'uefa', n: 20, games: 38, cup: 'Coppa Italia', cupRounds: 6, cupQual: 'el', slots: [['cl', 4], ['el', 6], ['ecl', 7]], sigma: 4.5, titlePts: 14, cupPts: 6, vis: 1, flavor: 'Defensas de hierro y mucha táctica.' }),
  de: lg({ id: 'de', name: 'Bundesliga', country: 'Alemania', conf: 'uefa', n: 18, games: 34, cup: 'DFB-Pokal', cupRounds: 6, cupQual: 'el', slots: [['cl', 4], ['el', 6], ['ecl', 7]], sigma: 4.5, titlePts: 14, cupPts: 6, vis: 0, flavor: 'Orden, intensidad y estadios llenos.' }),
  fr: lg({ id: 'fr', name: 'Ligue 1', country: 'Francia', conf: 'uefa', n: 18, games: 34, cup: 'Copa de Francia', cupRounds: 6, cupQual: 'el', slots: [['cl', 3], ['el', 5], ['ecl', 6]], sigma: 4.5, titlePts: 11, cupPts: 5, vis: 0, flavor: 'Un fútbol físico y veloz, ideal para crecer.' }),
  pt: lg({ id: 'pt', name: 'Liga Portugal', country: 'Portugal', conf: 'uefa', n: 18, games: 34, cup: 'Taça de Portugal', cupRounds: 5, cupQual: 'el', slots: [['cl', 2], ['el', 3], ['ecl', 4]], sigma: 4.5, titlePts: 9, cupPts: 5, vis: -1, flavor: 'Una vidriera clásica para saltar a las grandes ligas.' }),
  nl: lg({ id: 'nl', name: 'Eredivisie', country: 'Países Bajos', conf: 'uefa', n: 18, games: 34, cup: 'KNVB Beker', cupRounds: 5, cupQual: 'el', slots: [['cl', 2], ['el', 3], ['ecl', 4]], sigma: 4.5, titlePts: 8, cupPts: 4, vis: -1, flavor: 'Una escuela para pibes: jugás y te ven.' }),
  tr: lg({ id: 'tr', name: 'Süper Lig', country: 'Turquía', conf: 'uefa', n: 20, games: 38, cup: 'Copa de Turquía', cupRounds: 5, cupQual: 'el', slots: [['cl', 1], ['el', 3], ['ecl', 4]], sigma: 5, titlePts: 8, cupPts: 4, vis: -2, flavor: 'Pasión pura: las tribunas no se callan nunca.' }),
};

export const LEAGUE_IDS = Object.keys(LEAGUES) as LeagueId[];
export const leagueName = (id: LeagueId): string => LEAGUES[id]?.name ?? '';
export const isLeague = (x: unknown): x is LeagueId => typeof x === 'string' && Object.prototype.hasOwnProperty.call(LEAGUES, x);

// ---------- Copas continentales ----------

export interface Cont {
  id: ContId; name: string; conf: Conf;
  /** Rondas que hay que ganar, en orden (la primera es la fase de grupos o de liga, donde alcanza con pasar). */
  rounds: readonly string[];
  /** Nivel de los rivales en la primera y en la última ronda. */
  lo: number; hi: number;
  /** Partidos de la primera fase (0 si arranca directo en eliminación). */
  base: number;
  /** Puntos de Legado del título y prestigio para ordenar clasificaciones. */
  pts: number; rank: number;
}
const GRUPOS = 'Fase de grupos', LIGA = 'Fase de liga', OCT = 'Octavos de final', CUA = 'Cuartos de final', SEM = 'Semifinales', FIN = 'Final';

export const CONTS: Record<ContId, Cont> = {
  lib: { id: 'lib', name: 'Copa Libertadores', conf: 'conmebol', rounds: [GRUPOS, OCT, CUA, SEM, FIN], lo: 65, hi: 79, base: 6, pts: 32, rank: 5 },
  sud: { id: 'sud', name: 'Copa Sudamericana', conf: 'conmebol', rounds: [GRUPOS, OCT, CUA, SEM, FIN], lo: 59, hi: 71, base: 6, pts: 12, rank: 3 },
  cl: { id: 'cl', name: 'Champions League', conf: 'uefa', rounds: [LIGA, OCT, CUA, SEM, FIN], lo: 75, hi: 87, base: 8, pts: 42, rank: 7 },
  el: { id: 'el', name: 'Europa League', conf: 'uefa', rounds: [LIGA, OCT, CUA, SEM, FIN], lo: 70, hi: 80, base: 8, pts: 16, rank: 4 },
  ecl: { id: 'ecl', name: 'Conference League', conf: 'uefa', rounds: [LIGA, OCT, CUA, SEM, FIN], lo: 65, hi: 76, base: 6, pts: 9, rank: 2 },
  ccc: { id: 'ccc', name: 'Concachampions', conf: 'concacaf', rounds: [OCT, CUA, SEM, FIN], lo: 62, hi: 77, base: 0, pts: 12, rank: 3 },
  acl: { id: 'acl', name: 'Champions League de Asia', conf: 'afc', rounds: [LIGA, OCT, CUA, SEM, FIN], lo: 63, hi: 77, base: 6, pts: 10, rank: 3 },
};
export const CONT_IDS = Object.keys(CONTS) as ContId[];
export const isCont = (x: unknown): x is ContId => typeof x === 'string' && Object.prototype.hasOwnProperty.call(CONTS, x);

/** Torneos de selecciones y de clubes del mundo (no dependen de la liga). */
export const INTL = {
  worldCup: { name: 'Mundial', pts: 55, rounds: [GRUPOS, OCT, CUA, SEM, FIN], lo: 72, hi: 86, base: 3 },
  olympics: { name: 'Juegos Olímpicos', pts: 14, rounds: [GRUPOS, CUA, SEM, FIN], lo: 62, hi: 76, base: 3 },
  finalissima: { name: 'Finalissima', pts: 4, rounds: [FIN], lo: 86, hi: 86, base: 0 },
  /** Un solo partido: el campeón de liga contra el de copa de la Argentina (Trofeo de Campeones) y el de la Libertadores contra el de la Sudamericana (Recopa). */
  trofeo: { name: 'Trofeo de Campeones', pts: 4, rounds: [FIN], lo: 74, hi: 74, base: 0 },
  recopa: { name: 'Recopa Sudamericana', pts: 6, rounds: [FIN], lo: 73, hi: 73, base: 0 },
  u20: { name: 'Mundial Sub-20', pts: 8, rounds: [GRUPOS, OCT, CUA, SEM, FIN], lo: 60, hi: 74, base: 3 },
  clubWorldCup: { name: 'Mundial de Clubes', pts: 24, rounds: [SEM, FIN], lo: 80, hi: 84, base: 0 },
} as const;

/** Nivel de la Selección Argentina y de su Sub-23 (OVR de un titular). */
export const ARG_PW = 84.5;
export const ARG_U23_PW = 72;

/** Calendario: el Mundial se juega los años que dan 2 al dividir por 4 (2026, 2030…); la Copa América y los Juegos, los que dan 0 (2028, 2032…). */
export const isWorldCupYear = (y: number) => y % 4 === 2;
export const isCopaYear = (y: number) => y % 4 === 0;
export const isOlympicYear = (y: number) => y % 4 === 0;
/** El Mundial Sub-20 se juega los años impares. */
export const isU20Year = (y: number) => y % 2 === 1;
/** Año de la Finalissima (el campeón de América contra el de Europa): muy de vez en cuando, cada 8 años. */
export const isFinalissimaYear = (y: number) => y % 8 === 1;
/** Año del Mundial de Clubes. */
export const isClubWorldCupYear = (y: number) => y % 4 === 1;

// ---------- Clubes ----------

export interface ClubDef { name: string; lg: LeagueId; pw: number }

/** Categoría de un club según su fuerza. */
export const tierOf = (pw: number): Tier => (pw >= 82 ? 5 : pw >= 76.5 ? 4 : pw >= 71.5 ? 3 : pw >= 64.5 ? 2 : 1);

const AR1: Record<string, number> = {
  'River Plate': 76, 'Boca Juniors': 75.5, 'Racing Club': 73, 'Independiente': 72, 'San Lorenzo': 72,
  'Estudiantes de La Plata': 71, 'Vélez Sarsfield': 71, 'Talleres': 70, 'Rosario Central': 70, 'Lanús': 69, 'Belgrano': 69,
  'Argentinos Juniors': 68, 'Huracán': 68, "Newell's Old Boys": 68, 'Defensa y Justicia': 67, 'Godoy Cruz': 67, 'Independiente Rivadavia': 67,
  'Unión': 67, 'Gimnasia de La Plata': 66, 'Platense': 66, 'Banfield': 66, 'Tigre': 66, 'Atlético Tucumán': 66, 'Instituto': 66,
  'Central Córdoba (SdE)': 65.5, 'Barracas Central': 65.5, 'Sarmiento': 65, 'Deportivo Riestra': 65, 'San Martín de San Juan': 65,
  'Aldosivi': 65, 'Estudiantes de Río Cuarto': 65, 'Gimnasia de Mendoza': 65,
};
const AR2: Record<string, number> = {
  'Colón': 63, 'Quilmes': 62, 'Chacarita': 61, 'Atlanta': 60, 'All Boys': 60, 'Ferro Carril Oeste': 61, 'Chicago': 60, 'Almagro': 60,
  'Arsenal de Sarandí': 61, 'Temperley': 58, 'Los Andes': 57, 'Morón': 58, 'San Martín de Tucumán': 61,
};
/** Otros clubes reales de la Primera Nacional que no están en la lista de la app (para que haya más variedad; no tienen escudo). */
const AR2_EXTRA: [string, number][] = [
  ['Patronato', 61], ['Atlético Rafaela', 60], ['Gimnasia y Esgrima de Jujuy', 59], ['Deportivo Maipú', 58], ['Mitre', 57],
  ['Estudiantes de Buenos Aires', 57], ['Defensores de Belgrano', 57], ['Deportivo Madryn', 58], ['Guillermo Brown', 57],
  ['Tristán Suárez', 57], ['Agropecuario', 58], ['San Telmo', 56], ['Brown de Adrogué', 58], ['Racing de Córdoba', 58], ['Güemes', 57],
  ['Gimnasia y Tiro', 57], ['Villa Dálmine', 56], ['Ciudad de Bolívar', 55], ['Alvarado', 57], ['Central Norte', 57],
];

const WORLD: Record<Exclude<LeagueId, 'inf' | 'ar1' | 'ar2'>, [string, number][]> = {
  br: [
    ['Flamengo', 80], ['Palmeiras', 80], ['Botafogo', 78], ['Atlético Mineiro', 78], ['Fluminense', 77], ['São Paulo', 76], ['Corinthians', 75],
    ['Grêmio', 75], ['Internacional', 75], ['Cruzeiro', 74], ['Santos', 73], ['Vasco da Gama', 73], ['Bahia', 73], ['Fortaleza', 72],
    ['Athletico Paranaense', 72], ['Red Bull Bragantino', 72], ['Vitória', 70], ['Juventude', 69], ['Sport Recife', 69], ['Ceará', 69],
  ],
  uy: [['Peñarol', 71], ['Nacional de Montevideo', 71], ['Defensor Sporting', 66], ['Danubio', 64], ['Liverpool de Montevideo', 64], ['Montevideo Wanderers', 63], ['Boston River', 61], ['Cerro', 60]],
  cl: [['Colo-Colo', 70], ['Universidad de Chile', 69], ['Universidad Católica', 68], ['Cobreloa', 63], ['Huachipato', 63], ['Palestino', 63], ['Unión Española', 62], ['Audax Italiano', 62], ['Cobresal', 61]],
  co: [['Atlético Nacional', 71], ['Millonarios', 69], ['Junior', 68], ['América de Cali', 67], ['Deportivo Cali', 65], ['Independiente Santa Fe', 65], ['Deportes Tolima', 65], ['Once Caldas', 62], ['Atlético Bucaramanga', 60]],
  py: [['Cerro Porteño', 68], ['Olimpia', 67], ['Libertad', 66], ['Guaraní', 63], ['Sol de América', 58]],
  ec: [['Independiente del Valle', 70], ['LDU Quito', 69], ['Barcelona SC', 68], ['Emelec', 65], ['Aucas', 60], ['El Nacional', 58]],
  mx: [
    ['Club América', 75], ['Tigres', 74], ['Monterrey', 74], ['Cruz Azul', 72], ['Toluca', 72], ['Chivas', 71], ['León', 70], ['Pachuca', 70],
    ['Pumas', 69], ['Santos Laguna', 67], ['Atlas', 65], ['Necaxa', 63], ['Puebla', 62], ['Querétaro', 60],
  ],
  us: [
    ['Inter Miami', 70], ['LAFC', 70], ['LA Galaxy', 68], ['Seattle Sounders', 68], ['Atlanta United', 67], ['Columbus Crew', 67], ['NYCFC', 66],
    ['FC Cincinnati', 66], ['Philadelphia Union', 66], ['Portland Timbers', 64], ['Orlando City', 64], ['New York Red Bulls', 64], ['Austin FC', 63],
  ],
  sa: [['Al-Hilal', 76], ['Al-Nassr', 75], ['Al-Ittihad', 74], ['Al-Ahli', 73], ['Al-Shabab', 66], ['Al-Ettifaq', 66], ['Al-Fateh', 63], ['Al-Taawoun', 63], ['Al-Fayha', 61], ['Damac', 60]],
  en: [
    ['Manchester City', 89], ['Liverpool', 87], ['Arsenal', 87], ['Chelsea', 84], ['Manchester United', 83], ['Tottenham', 83], ['Aston Villa', 80],
    ['Newcastle', 80], ['West Ham', 77], ['Brighton', 77], ['Crystal Palace', 77], ['Nottingham Forest', 76], ['Fulham', 75], ['Brentford', 75],
    ['Everton', 75], ['Bournemouth', 75], ['Wolverhampton', 74],
  ],
  es: [
    ['Real Madrid', 89], ['Barcelona', 87], ['Atlético de Madrid', 84], ['Athletic Club', 80], ['Real Sociedad', 79], ['Villarreal', 79], ['Real Betis', 78],
    ['Sevilla', 78], ['Valencia', 77], ['Girona', 77], ['Celta de Vigo', 74], ['Osasuna', 73], ['Getafe', 73], ['Mallorca', 73], ['Rayo Vallecano', 72],
  ],
  it: [
    ['Inter', 86], ['Milan', 84], ['Juventus', 84], ['Napoli', 83], ['Atalanta', 81], ['Roma', 80], ['Lazio', 79], ['Fiorentina', 77], ['Bologna', 77],
    ['Torino', 74], ['Udinese', 72], ['Genoa', 72],
  ],
  de: [
    ['Bayern Múnich', 89], ['Bayer Leverkusen', 85], ['Borussia Dortmund', 84], ['RB Leipzig', 81], ['Stuttgart', 79], ['Eintracht Fráncfort', 78],
    ['Friburgo', 75], ['Wolfsburgo', 75], ['Borussia Mönchengladbach', 74], ['Hoffenheim', 74], ['Werder Bremen', 73], ['Mainz', 72],
  ],
  fr: [['PSG', 86], ['Marsella', 79], ['Mónaco', 79], ['Lyon', 78], ['Lille', 78], ['Niza', 76], ['Rennes', 75], ['Lens', 75], ['Estrasburgo', 71]],
  pt: [['Sporting Lisboa', 80], ['Benfica', 79], ['Porto', 79], ['Braga', 75], ['Vitória de Guimarães', 70], ['Famalicão', 69], ['Gil Vicente', 68], ['Estoril', 68], ['Rio Ave', 67], ['Moreirense', 66], ['Casa Pia', 66]],
  nl: [['PSV', 79], ['Ajax', 77], ['Feyenoord', 77], ['AZ Alkmaar', 74], ['Twente', 72]],
  tr: [['Galatasaray', 77], ['Fenerbahçe', 77], ['Beşiktaş', 76.5], ['Trabzonspor', 72], ['Başakşehir', 69]],
};

function buildClubs(): ClubDef[] {
  const out: ClubDef[] = [];
  const seen = new Set<string>();
  const add = (name: string, l: LeagueId, pw: number) => { if (!seen.has(name)) { seen.add(name); out.push({ name, lg: l, pw }); } };
  for (const n of TEAMS_PRIMERA) add(n, 'ar1', AR1[n] ?? 65);
  for (const n of TEAMS_ASCENSO) add(n, 'ar2', AR2[n] ?? 58);
  for (const [n, pw] of AR2_EXTRA) add(n, 'ar2', pw);
  for (const id of Object.keys(WORLD) as (keyof typeof WORLD)[]) for (const [n, pw] of WORLD[id]) add(n, id, pw);
  return out;
}

/** Todos los clubes del juego (cada nombre aparece una sola vez). */
export const CLUBS: readonly ClubDef[] = buildClubs();
export const CLUB_BY_NAME: ReadonlyMap<string, ClubDef> = new Map(CLUBS.map(c => [c.name, c]));
const BY_LEAGUE = new Map<LeagueId, ClubDef[]>();
for (const c of CLUBS) BY_LEAGUE.set(c.lg, [...(BY_LEAGUE.get(c.lg) ?? []), c]);
export const clubsOf = (id: LeagueId): readonly ClubDef[] => BY_LEAGUE.get(id) ?? [];

/** Un club del juego tal cual juega hoy (o null si no existe). */
export const clubNamed = (name: string): Club | null => {
  const d = CLUB_BY_NAME.get(name);
  return d ? { name: d.name, tier: tierOf(d.pw), pw: d.pw, lg: d.lg } : null;
};
export const asClub = (d: ClubDef): Club => ({ name: d.name, tier: tierOf(d.pw), pw: d.pw, lg: d.lg });

/** Los equipos de las inferiores no se miden con los de primera: el nivel sube un poco con el club de origen. */
export const youthPw = (homePw: number) => Math.round((50 + (homePw - 66) * 0.3) * 10) / 10;
export const youthClub = (d: ClubDef): Club => ({ name: d.name, tier: 0, pw: youthPw(d.pw), lg: 'inf' });

/** Clubes argentinos donde se puede arrancar en las inferiores, con su peso: más Primera y Ascenso que grandes. */
export function homePool(): (readonly [ClubDef, number])[] {
  const grandes = new Set(['Boca Juniors', 'River Plate', 'Racing Club', 'Independiente', 'San Lorenzo', 'Vélez Sarsfield', 'Estudiantes de La Plata', "Newell's Old Boys", 'Rosario Central', 'Lanús', 'Argentinos Juniors']);
  const a1 = clubsOf('ar1').filter(c => !grandes.has(c.name)), g = clubsOf('ar1').filter(c => grandes.has(c.name)), a2 = clubsOf('ar2');
  const w = (list: readonly ClubDef[], total: number) => list.map(c => [c, total / list.length] as const);
  // menos probable salir de un grande (todos los chicos de la lista juntos suman más que los once grandes), y buena chance de arrancar en el Ascenso
  return [...w(a1, 0.44), ...w(a2, 0.38), ...w(g, 0.18)];
}

// ---------- Tabla de la liga ----------

/** Los equipos de cada liga: los de la lista y, hasta completar los que juegan de verdad, rivales genéricos un poco más flojos. */
const SIZE = {} as Record<LeagueId, number>;
const FIELD: Record<LeagueId, number[]> = (() => {
  const out = {} as Record<LeagueId, number[]>;
  for (const id of LEAGUE_IDS) {
    const L = LEAGUES[id], listed = clubsOf(id).map(c => c.pw);
    const floor = listed.length ? Math.min(...listed) - 1.5 : 50;
    out[id] = [...listed, ...Array.from({ length: Math.max(0, L.n - listed.length) }, () => floor)].sort((a, b) => b - a);
    SIZE[id] = out[id].length;
  }
  return out;
})();

export const fieldOf = (id: LeagueId): readonly number[] => FIELD[id];
/** Cuántos equipos tiene la tabla de la liga. */
export const sizeOf = (id: LeagueId): number => SIZE[id];
const avg = (xs: readonly number[]) => xs.reduce((t, x) => t + x, 0) / Math.max(1, xs.length);
export const leagueAvg = (id: LeagueId) => avg(FIELD[id]);
export const leagueTop = (id: LeagueId) => FIELD[id][0] ?? 50;

/** Puesto en la tabla de una temporada: tu fuerza (con `boost` por lo que aportás) contra la de los demás, con la suerte del año. */
export function finishRank(club: Club, boost: number, r: Rng): number {
  const L = LEAGUES[club.lg], f = FIELD[club.lg];
  const mine = club.pw + boost + r.normal(0, L.sigma);
  // La tabla siempre tiene el tamaño de la liga: tu club ocupa el lugar del equipo de fuerza más parecida (también si recién ascendió o descendió).
  let self = 0, near = Infinity;
  f.forEach((p, i) => { const d = Math.abs(p - club.pw); if (d < near) { near = d; self = i; } });
  let rank = 1;
  f.forEach((p, i) => { if (i !== self && p + r.normal(0, L.sigma) > mine) rank++; });
  return rank;
}

/** Puesto "de papel" de un club en su liga, por fuerza: 1 = el más fuerte. */
export function strRank(club: Club): number {
  return Math.min(SIZE[club.lg], 1 + FIELD[club.lg].filter(p => p > club.pw + 0.25).length);
}

/** "Candidato al título", "Mitad de tabla"…: cómo viene el club en su liga. */
export function strLabel(club: Club): string {
  if (club.tier === 0) return 'Cantera';
  const k = strRank(club), n = SIZE[club.lg];
  return k <= Math.max(2, Math.round(n * 0.1)) ? 'Candidato al título' : k <= n * 0.6 ? 'Mitad de tabla' : 'Equipo modesto';
}

// ---------- Clasificación a las copas continentales ----------

/** A qué copa continental clasifica terminar en ese puesto (o null). */
export function qualFor(id: LeagueId, rank: number): ContId | null {
  for (const [c, upto] of LEAGUES[id].slots) if (rank <= upto) return c;
  return null;
}
/** La más prestigiosa de dos copas continentales. */
export function betterCont(a: ContId | null, b: ContId | null): ContId | null {
  if (!a || !b) return a ?? b;
  return CONTS[a].rank >= CONTS[b].rank ? a : b;
}
/** Cuando llegás a un club nuevo todavía no hay tabla: la copa que juega sale de su fuerza (un grande, Libertadores; uno del medio, Sudamericana). */
export const qualByStrength = (club: Club): ContId | null => (club.tier === 0 ? null : qualFor(club.lg, strRank(club)));

/** Tope de partidos que se pueden jugar en una temporada en esa liga (liga + copa + la copa continental más larga + Mundial de Clubes). */
export function gamesCap(id: LeagueId): number {
  const L = LEAGUES[id];
  // con fase de grupos: sus partidos + ida y vuelta en cada ronda + la final; sin grupos (Concachampions): ida y vuelta en todas menos la final
  const cont = Math.max(0, ...CONT_IDS.filter(c => CONTS[c].conf === L.conf).map(c => {
    const n = CONTS[c].rounds.length;
    return CONTS[c].base > 0 ? CONTS[c].base + 2 * (n - 2) + 1 : 2 * (n - 1) + 1;
  }));
  return L.games + L.cupRounds + cont + 2 + 2; // + Mundial de Clubes + Trofeo de Campeones y Recopa
}
