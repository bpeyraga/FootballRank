// "De potrero a leyenda": tablas del juego (estilos, puestos, premios y puntos de Legado). Los clubes, ligas y copas viven en careerWorld.
// Todo con nombres reales de competencias y clubes; los únicos jugadores son los que crea el usuario.
import type { Pos, Stats } from '../../shared/model';
import type { LeagueId, StyleId } from './careerTypes';
import { CONTS, CONT_IDS, INTL, LEAGUES, LEAGUE_IDS } from './careerWorld';

/** Goles por partido disponible que hacen falta, según la categoría del club, para pelear el "goleador" de la liga. */
export const GOAL_RATE = [0.67, 0.53, 0.58, 0.52, 0.52, 0.56] as const;
/** Asistencias por partido disponible para pelear el "líder de asistencias". */
export const ASSIST_RATE = [0.44, 0.34, 0.35, 0.32, 0.30, 0.34] as const;
/** Cuánto pesan en el Legado la producción y los premios según la categoría del club en la que se lograron. */
export const TIER_WEIGHT = [0.25, 0.5, 0.8, 1, 1.1, 1.2] as const;

/** Premios individuales que no dependen de la liga. */
export const AWARD = {
  ballon: 'Balón de Oro',
  ballon2: '2.º en el Balón de Oro',
  ballon3: '3.º en el Balón de Oro',
  boot: 'Bota de Oro',
  golden: 'Golden Boy',
  puskas: 'Premio Puskás',
  olimpiaPlata: 'Olimpia de Plata',
  olimpiaOro: 'Olimpia de Oro',
  wcStar: 'Mejor jugador del Mundial',
  caStar: 'Mejor jugador de la Copa América',
} as const;

/** Premios de cada liga: "Premier League: goleador". */
export const lgAward = {
  scorer: (lg: LeagueId) => `${LEAGUES[lg].name}: goleador`,
  assist: (lg: LeagueId) => `${LEAGUES[lg].name}: líder de asistencias`,
  keeper: (lg: LeagueId) => `${LEAGUES[lg].name}: mejor arquero`,
  defender: (lg: LeagueId) => `${LEAGUES[lg].name}: mejor defensor`,
  best: (lg: LeagueId) => `${LEAGUES[lg].name}: mejor jugador`,
  rookie: (lg: LeagueId) => `${LEAGUES[lg].name}: revelación`,
};
/** Mejor jugador de una copa continental: "Mejor jugador de la Champions League". */
export const contMvp = (name: string) => `Mejor jugador de la ${name}`;

/** Puntos de Legado de cada título (se arma con los puntos que tiene cada liga, copa y torneo). */
export const TROPHY_PTS: Record<string, number> = {};
/** Puntos de Legado de cada premio individual. */
export const AWARD_PTS: Record<string, number> = {
  [AWARD.ballon]: 55, [AWARD.ballon2]: 20, [AWARD.ballon3]: 12, [AWARD.boot]: 14, [AWARD.golden]: 12, [AWARD.puskas]: 6,
  [AWARD.olimpiaPlata]: 8, [AWARD.olimpiaOro]: 18, [AWARD.wcStar]: 18, [AWARD.caStar]: 8,
};
for (const id of LEAGUE_IDS) {
  const L = LEAGUES[id];
  TROPHY_PTS[L.name] = L.titlePts;
  if (L.cup) TROPHY_PTS[L.cup] = Math.max(TROPHY_PTS[L.cup] ?? 0, L.cupPts);
  const top = Math.round(3 + L.titlePts * 0.55);
  AWARD_PTS[lgAward.scorer(id)] = top; AWARD_PTS[lgAward.assist(id)] = top - 1;
  AWARD_PTS[lgAward.keeper(id)] = top; AWARD_PTS[lgAward.defender(id)] = top;
  AWARD_PTS[lgAward.best(id)] = top + 1; AWARD_PTS[lgAward.rookie(id)] = Math.round(3 + L.titlePts * 0.3);
}
for (const id of CONT_IDS) {
  TROPHY_PTS[CONTS[id].name] = CONTS[id].pts;
  AWARD_PTS[contMvp(CONTS[id].name)] = Math.round(CONTS[id].pts * 0.4);
}
for (const t of [INTL.worldCup, INTL.copaAmerica, INTL.olympics, INTL.finalissima, INTL.clubWorldCup]) TROPHY_PTS[t.name] = t.pts;

/** Puntos por haber llegado a cada categoría (la más alta de la carrera). */
export const PEAK_TIER_PTS = [0, 4, 12, 30, 50, 80] as const;

/** Escalones del Legado: puntaje mínimo y nombre. */
export const LEGACY_STEPS: readonly { min: number; label: string; blurb: string }[] = [
  { min: 0, label: 'Promesa perdida', blurb: 'Se te quedó todo en el potrero. Siempre queda la revancha.' },
  { min: 55, label: 'Jugador de club', blurb: 'Una carrera digna, con alegrías y pocas luces. El vestuario te quería.' },
  { min: 135, label: 'Ídolo', blurb: 'La gente cantaba tu nombre. Dejaste huella en cada club.' },
  { min: 280, label: 'Leyenda', blurb: 'Títulos, goles y noches inolvidables: tu carrera se cuenta a los nietos.' },
  { min: 560, label: 'Mejor de la historia', blurb: 'Nadie jugó como vos. Se discute si hubo alguien mejor, y no.' },
];

export interface StyleDef {
  id: StyleId; name: string; emoji: string; tag: string; desc: string;
  /** Cuánto crece cada stat (relativo). */
  grow: Stats;
  /** Forma de las stats al arrancar (relativo al promedio). */
  start: Stats;
  /** Multiplicador de la caída por edad. */
  decline: number;
  /** Multiplicador de la chance de lesión. */
  injury: number;
}
export const STYLES: readonly StyleDef[] = [
  {
    id: 'potrero', name: 'Potrero', emoji: '🎩', tag: 'Regate y ritmo',
    desc: 'Gambeta, desparpajo y velocidad. Crecés rápido en regate y ritmo, pero el físico y la marca te cuestan.',
    grow: { rit: 1.3, tir: 1, pas: 0.9, reg: 1.5, def: 0.6, fis: 0.7 },
    start: { rit: 5, tir: 0, pas: -1, reg: 7, def: -6, fis: -5 },
    decline: 1, injury: 1,
  },
  {
    id: 'tactico', name: 'Táctico', emoji: '🧠', tag: 'Pase y defensa',
    desc: 'Cabeza levantada, lectura y orden. Te cuesta más explotar, pero envejecés mejor y te lesionás menos.',
    grow: { rit: 0.7, tir: 0.9, pas: 1.5, reg: 0.9, def: 1.4, fis: 0.9 },
    start: { rit: -4, tir: -2, pas: 7, reg: 0, def: 5, fis: -2 },
    decline: 0.8, injury: 0.9,
  },
  {
    id: 'fisico', name: 'Físico', emoji: '💪', tag: 'Físico y tiro',
    desc: 'Potencia, remate y garra. Arrancás fuerte y rematás de todos lados, pero el cuerpo te pasa factura antes.',
    grow: { rit: 1.2, tir: 1.3, pas: 0.7, reg: 0.6, def: 1, fis: 1.6 },
    start: { rit: 2, tir: 3, pas: -5, reg: -5, def: 2, fis: 8 },
    decline: 1.2, injury: 1,
  },
];

export const POS_LABEL: Record<Pos, string> = { ARQ: 'Arquero', DEF: 'Defensor', MED: 'Mediocampista', DEL: 'Delantero' };
/** Peso de cada stat en el OVR de cada puesto (suman 1). */
export const POS_W: Record<Pos, Stats> = {
  ARQ: { rit: 0.08, tir: 0.04, pas: 0.14, reg: 0.10, def: 0.38, fis: 0.26 },
  DEF: { rit: 0.12, tir: 0.04, pas: 0.14, reg: 0.08, def: 0.38, fis: 0.24 },
  MED: { rit: 0.14, tir: 0.12, pas: 0.30, reg: 0.22, def: 0.10, fis: 0.12 },
  DEL: { rit: 0.20, tir: 0.34, pas: 0.10, reg: 0.22, def: 0.04, fis: 0.10 },
};
/** Forma de las stats de cada puesto al arrancar (relativo al promedio). */
export const POS_START: Record<Pos, Stats> = {
  ARQ: { rit: -6, tir: -20, pas: -2, reg: -8, def: 20, fis: 10 },
  DEF: { rit: 0, tir: -12, pas: 0, reg: -6, def: 14, fis: 8 },
  MED: { rit: 0, tir: -2, pas: 10, reg: 6, def: -2, fis: -2 },
  DEL: { rit: 4, tir: 12, pas: -2, reg: 6, def: -16, fis: -2 },
};
/** Goles y asistencias por partido de un jugador "justo" de su categoría. */
export const POS_RATE: Record<Pos, { g: number; a: number; capG: number }> = {
  DEL: { g: 0.42, a: 0.16, capG: 0.28 },
  MED: { g: 0.12, a: 0.19, capG: 0.07 },
  DEF: { g: 0.045, a: 0.06, capG: 0.03 },
  ARQ: { g: 0.002, a: 0.005, capG: 0 },
};
/** Reconversión de puesto que te propone un DT. */
export const SWITCH_TO: Record<Pos, Pos[]> = { ARQ: [], DEF: ['MED'], MED: ['DEF', 'DEL'], DEL: ['MED'] };

/** Cómo decae cada stat con la edad (el ritmo y el físico primero, el pase y la lectura aguantan). */
export const DECLINE_W: Stats = { rit: 2, tir: 0.7, pas: 0.45, reg: 1, def: 0.7, fis: 1.6 };
