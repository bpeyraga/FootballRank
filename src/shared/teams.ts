// Equipos para elegir "de qué cuadro sos hincha". Se guarda el nombre tal cual en profiles.fav_team.
// Los escuditos son propios (colores y diseño de la camiseta), no los escudos oficiales de los clubes.

/** plain: liso · stripes: bastones · hband: franja horizontal · sash: banda diagonal · halves: mitades · vee: V */
export type Pattern = 'plain' | 'stripes' | 'hband' | 'sash' | 'halves' | 'vee';
export interface Kit { s: string; p: Pattern; c: string[]; t: string } // sigla, diseño, colores, color de la sigla

const W = '#ffffff', R = '#d71920', B = '#0b3b8c', N = '#1d1d1d', Y = '#f6c400', G = '#0a7a3d', C = '#6cb4e4';

export const KITS: Record<string, Kit> = {
  // Primera División
  'Aldosivi': { s: 'ALD', p: 'stripes', c: [G, Y], t: N },
  'Argentinos Juniors': { s: 'ARG', p: 'plain', c: [R], t: W },
  'Atlético Tucumán': { s: 'ATU', p: 'stripes', c: [C, W], t: B },
  'Banfield': { s: 'BAN', p: 'stripes', c: [G, W], t: N },
  'Barracas Central': { s: 'BAR', p: 'stripes', c: [R, W], t: N },
  'Belgrano': { s: 'BEL', p: 'plain', c: [C], t: W },
  'Boca Juniors': { s: 'BOC', p: 'hband', c: [B, Y], t: W },
  'Central Córdoba (SdE)': { s: 'CCO', p: 'stripes', c: [N, W], t: R },
  'Defensa y Justicia': { s: 'DYJ', p: 'halves', c: [Y, G], t: N },
  'Deportivo Riestra': { s: 'RIE', p: 'plain', c: [N], t: W },
  'Estudiantes de La Plata': { s: 'EST', p: 'stripes', c: [R, W], t: N },
  'Estudiantes de Río Cuarto': { s: 'ERC', p: 'stripes', c: [C, W], t: N },
  'Gimnasia de La Plata': { s: 'GEL', p: 'hband', c: [W, B], t: B },
  'Gimnasia de Mendoza': { s: 'GEM', p: 'hband', c: [W, N], t: N },
  'Godoy Cruz': { s: 'GCR', p: 'stripes', c: [B, W], t: N },
  'Huracán': { s: 'HUR', p: 'plain', c: [W], t: R },
  'Independiente': { s: 'IND', p: 'plain', c: [R], t: W },
  'Independiente Rivadavia': { s: 'IRM', p: 'plain', c: [B], t: W },
  'Instituto': { s: 'INS', p: 'stripes', c: [R, W], t: N },
  'Lanús': { s: 'LAN', p: 'plain', c: ['#7a1f2b'], t: W },
  "Newell's Old Boys": { s: 'NOB', p: 'halves', c: [R, N], t: W },
  'Platense': { s: 'PLA', p: 'hband', c: [W, '#6b3e1f'], t: '#6b3e1f' },
  'Racing Club': { s: 'RAC', p: 'stripes', c: [C, W], t: B },
  'River Plate': { s: 'RIV', p: 'sash', c: [W, R], t: N },
  'Rosario Central': { s: 'RCE', p: 'stripes', c: [B, Y], t: W },
  'San Lorenzo': { s: 'SLO', p: 'stripes', c: [B, R], t: W },
  'San Martín de San Juan': { s: 'SMJ', p: 'stripes', c: [G, N], t: W },
  'Sarmiento': { s: 'SAR', p: 'plain', c: [G], t: W },
  'Talleres': { s: 'TAL', p: 'stripes', c: ['#16295c', W], t: R },
  'Tigre': { s: 'TIG', p: 'hband', c: [B, R], t: W },
  'Unión': { s: 'UNI', p: 'stripes', c: [R, W], t: N },
  'Vélez Sarsfield': { s: 'VEL', p: 'vee', c: [W, B], t: B },
  // Ascenso
  'All Boys': { s: 'ALL', p: 'plain', c: [W], t: N },
  'Almagro': { s: 'ALM', p: 'plain', c: ['#16295c'], t: W },
  'Arsenal de Sarandí': { s: 'ARS', p: 'sash', c: [C, R], t: N },
  'Atlanta': { s: 'ATL', p: 'stripes', c: [B, Y], t: W },
  'Chacarita': { s: 'CHA', p: 'stripes', c: [R, N, W], t: W },
  'Chicago': { s: 'NCH', p: 'stripes', c: [G, N], t: W },
  'Colón': { s: 'COL', p: 'halves', c: [R, N], t: W },
  'Ferro Carril Oeste': { s: 'FER', p: 'plain', c: [G], t: W },
  'Los Andes': { s: 'AND', p: 'hband', c: [R, W], t: W },
  'Morón': { s: 'MOR', p: 'plain', c: [W], t: R },
  'Quilmes': { s: 'QUI', p: 'plain', c: [W], t: B },
  'San Martín de Tucumán': { s: 'SMT', p: 'stripes', c: [R, W], t: N },
  'Temperley': { s: 'TEM', p: 'plain', c: [C], t: W },
};

export const TEAMS_PRIMERA = Object.keys(KITS).slice(0, 32);
export const TEAMS_ASCENSO = Object.keys(KITS).slice(32);

// ---------- Detalles del escudito (forma, borde e iniciales) ----------
// Siguen siendo dibujos propios: solo se acercan a la forma y los colores del escudo de cada club.
/** shield: escudo clásico · pointed: con punta arriba · french: base redondeada · oval · round: redondo */
export type Shape = 'shield' | 'pointed' | 'french' | 'oval' | 'round';
export interface CrestDetail { f?: Shape; b?: string; l?: string } // forma, color del borde, iniciales

const GOLD = '#d4a017', DB = '#16295c';

export const CREST: Record<string, CrestDetail> = {
  'Aldosivi': { f: 'french', b: G, l: 'CAA' },
  'Argentinos Juniors': { f: 'round', b: W, l: 'AAAJ' },
  'Atlético Tucumán': { f: 'shield', b: B, l: 'CAT' },
  'Banfield': { f: 'shield', b: G, l: 'CAB' },
  'Barracas Central': { f: 'french', b: R, l: 'CABC' },
  'Belgrano': { f: 'round', b: B, l: 'CAB' },
  'Boca Juniors': { f: 'oval', b: GOLD, l: 'CABJ' },
  'Central Córdoba (SdE)': { f: 'shield', b: R, l: 'CACC' },
  'Defensa y Justicia': { f: 'french', b: G, l: 'DYJ' },
  'Deportivo Riestra': { f: 'shield', b: W, l: 'CDR' },
  'Estudiantes de La Plata': { f: 'pointed', b: R, l: 'EDLP' },
  'Estudiantes de Río Cuarto': { f: 'shield', b: B, l: 'ERC' },
  'Gimnasia de La Plata': { f: 'french', b: B, l: 'GELP' },
  'Gimnasia de Mendoza': { f: 'french', b: N, l: 'GEM' },
  'Godoy Cruz': { f: 'shield', b: B, l: 'GCAT' },
  'Huracán': { f: 'round', b: R, l: 'CAH' },
  'Independiente': { f: 'oval', b: W, l: 'CAI' },
  'Independiente Rivadavia': { f: 'shield', b: W, l: 'CSIR' },
  'Instituto': { f: 'shield', b: R, l: 'IACC' },
  'Lanús': { f: 'pointed', b: W, l: 'CAL' },
  "Newell's Old Boys": { f: 'pointed', b: N, l: 'CANOB' },
  'Platense': { f: 'french', b: '#6b3e1f', l: 'CAP' },
  'Racing Club': { f: 'french', b: B, l: 'RC' },
  'River Plate': { f: 'shield', b: N, l: 'CARP' },
  'Rosario Central': { f: 'pointed', b: B, l: 'CARC' },
  'San Lorenzo': { f: 'pointed', b: B, l: 'CASLA' },
  'San Martín de San Juan': { f: 'shield', b: G, l: 'CASM' },
  'Sarmiento': { f: 'round', b: W, l: 'CAS' },
  'Talleres': { f: 'french', b: DB, l: 'CAT' },
  'Tigre': { f: 'round', b: R, l: 'CAT' },
  'Unión': { f: 'shield', b: R, l: 'CAU' },
  'Vélez Sarsfield': { f: 'pointed', b: B, l: 'CAVS' },
  'All Boys': { f: 'shield', b: N, l: 'CAAB' },
  'Almagro': { f: 'shield', b: W, l: 'CA' },
  'Arsenal de Sarandí': { f: 'french', b: R, l: 'ADS' },
  'Atlanta': { f: 'round', b: B, l: 'CAA' },
  'Chacarita': { f: 'shield', b: N, l: 'CAChJ' },
  'Chicago': { f: 'shield', b: N, l: 'NCH' },
  'Colón': { f: 'pointed', b: N, l: 'CAC' },
  'Ferro Carril Oeste': { f: 'round', b: W, l: 'FCO' },
  'Los Andes': { f: 'french', b: R, l: 'CSLA' },
  'Morón': { f: 'shield', b: R, l: 'CDM' },
  'Quilmes': { f: 'shield', b: B, l: 'QAC' },
  'San Martín de Tucumán': { f: 'shield', b: R, l: 'CASM' },
  'Temperley': { f: 'round', b: W, l: 'CAT' },
};

// ---------- Escudo oficial (ESPN) ----------
/**
 * Id de cada club en ESPN (sale de la tabla y los partidos de "Fútbol argentino"). Con id se muestra el escudo oficial;
 * sin id (Ascenso, o si la imagen no carga) queda el escudito propio de <Crest>.
 */
export const ESPN_ID: Record<string, string> = {
  'Aldosivi': '9739', 'Argentinos Juniors': '3', 'Atlético Tucumán': '9785', 'Banfield': '235', 'Barracas Central': '10060',
  'Belgrano': '4', 'Boca Juniors': '5', 'Central Córdoba (SdE)': '11989', 'Defensa y Justicia': '8950', 'Deportivo Riestra': '17702',
  'Estudiantes de La Plata': '8', 'Estudiantes de Río Cuarto': '19685', 'Gimnasia de La Plata': '9', 'Gimnasia de Mendoza': '11972',
  'Huracán': '10', 'Independiente': '11', 'Independiente Rivadavia': '9744', 'Instituto': '2975', 'Lanús': '12',
  "Newell's Old Boys": '14', 'Platense': '7764', 'Racing Club': '15', 'River Plate': '16', 'Rosario Central': '17',
  'San Lorenzo': '18', 'Sarmiento': '10158', 'Talleres': '19', 'Tigre': '7767', 'Unión': '20', 'Vélez Sarsfield': '21',
};

/** URL del escudo oficial en ESPN, ya achicado (unos 5 KB), por id numérico. `dark`: versión para fondo oscuro. */
export function espnCrestUrl(id: string, dark = false): string | null {
  return /^\d{1,8}$/.test(id)
    ? `https://a.espncdn.com/combiner/i?img=/i/teamlogos/soccer/${dark ? '500-dark' : '500'}/${id}.png&w=72&h=72`
    : null;
}
