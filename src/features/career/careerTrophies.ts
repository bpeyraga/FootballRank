// "De potrero a leyenda": qué ilustración propia le toca a cada título y premio de la vitrina (forma y color). Puro, sin JSX.
// Las ilustraciones son dibujos propios (no fotos ni réplicas de ningún trofeo real): solo cambian la forma y el color según la importancia.
import { AWARD } from './careerData';
import { NAT_CUP_LIST, natStar } from './careerNations';
import { CONTS, CONT_IDS, INTL, LEAGUES, LEAGUE_IDS } from './careerWorld';

export type TrophyShape = 'cup' | 'plate' | 'small' | 'medal' | 'ball' | 'boot' | 'star';
export type Tone = 'gold' | 'silver' | 'bronze';
export interface TrophyArt { shape: TrophyShape; tone: Tone }

const A = (shape: TrophyShape, tone: Tone): TrophyArt => ({ shape, tone });

const BIG_CONTS = new Set<string>([CONTS.lib.name, CONTS.cl.name]);
const LEAGUE_ART = new Map<string, TrophyArt>(LEAGUE_IDS.map(id => [LEAGUES[id].name, A('plate', LEAGUES[id].titlePts >= 9 ? 'gold' : 'silver')]));
const CUP_ART = new Map<string, TrophyArt>();
for (const id of LEAGUE_IDS) { const L = LEAGUES[id]; if (L.cup) CUP_ART.set(L.cup, A('small', L.cupPts >= 6 ? 'gold' : 'silver')); if (L.extra) CUP_ART.set(L.extra.name, A('plate', 'silver')); }
const CONT_ART = new Map<string, TrophyArt>(CONT_IDS.map(id => [CONTS[id].name, A('cup', BIG_CONTS.has(CONTS[id].name) ? 'gold' : 'silver')]));
const NATCUP_ART = new Map<string, TrophyArt>(NAT_CUP_LIST.map(t => [t.name, A('cup', t.pts >= 20 ? 'gold' : 'silver')]));

/** La ilustración de un título (liga, copa, torneo de selecciones). */
export function trophyArt(name: string): TrophyArt {
  if (name === INTL.worldCup.name || name === INTL.clubWorldCup.name) return A('cup', 'gold');
  if (name === INTL.olympics.name) return A('medal', 'gold');
  if (name === INTL.u20.name) return A('cup', 'silver');
  if (name === INTL.finalissima.name || name === INTL.trofeo.name) return A('small', 'silver');
  if (name === INTL.recopa.name) return A('small', 'gold');
  return CONT_ART.get(name) ?? NATCUP_ART.get(name) ?? LEAGUE_ART.get(name) ?? CUP_ART.get(name) ?? A('small', 'silver');
}

/** La ilustración de un premio individual. */
export function awardArt(name: string): TrophyArt {
  switch (name) {
    case AWARD.ballon: return A('ball', 'gold');
    case AWARD.ballon2: return A('ball', 'silver');
    case AWARD.ballon3: return A('ball', 'bronze');
    case AWARD.boot: return A('boot', 'gold');
    case AWARD.golden: return A('medal', 'gold');
    case AWARD.puskas: return A('star', 'gold');
    case AWARD.olimpiaOro: return A('small', 'gold');
    case AWARD.olimpiaPlata: return A('small', 'silver');
    case AWARD.wcStar: return A('ball', 'silver');
    default: return NAT_CUP_LIST.some(t => name === natStar(t.name)) ? A('medal', 'gold') : A('medal', 'silver');
  }
}

/** ¿Es un título (y no un premio)? Para dibujar cada cosa con su función. */
export const isTrophyName = (name: string): boolean =>
  CONT_ART.has(name) || NATCUP_ART.has(name) || LEAGUE_ART.has(name) || CUP_ART.has(name) || [INTL.worldCup, INTL.clubWorldCup, INTL.olympics, INTL.u20, INTL.finalissima, INTL.trofeo, INTL.recopa].some(t => t.name === name);

/** Los colores de cada tono (claro, medio y oscuro): sirven para el degradé de cada dibujo. */
export const TONES: Record<Tone, readonly [string, string, string]> = {
  gold: ['#fff1a8', '#f4bd2c', '#b87a0a'],
  silver: ['#ffffff', '#c9d3dc', '#7d8b98'],
  bronze: ['#f6c79a', '#cd7f32', '#8a4f1e'],
};
