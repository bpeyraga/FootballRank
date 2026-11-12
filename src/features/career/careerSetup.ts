// "De potrero a leyenda": lo que elegís al arrancar: posición en la cancha, dificultad y pie hábil. Puro y sin entorno.
import type { Pos, Stats } from '../../shared/model';
import { POS_W } from './careerData';
import type { DPos, Difficulty, Foot } from './careerTypes';

// ---------- Posición en la cancha ----------

export const DPOS_LIST: readonly DPos[] = ['POR', 'DFC', 'LI', 'LD', 'MCD', 'MC', 'MI', 'MD', 'MCO', 'EI', 'ED', 'DC'];
/** Con qué puesto del simulador (ARQ/DEF/MED/DEL) se juega cada posición. */
export const DPOS_POS: Record<DPos, Pos> = { POR: 'ARQ', DFC: 'DEF', LI: 'DEF', LD: 'DEF', MCD: 'MED', MC: 'MED', MI: 'MED', MD: 'MED', MCO: 'MED', EI: 'DEL', ED: 'DEL', DC: 'DEL' };
export const DPOS_LABEL: Record<DPos, string> = {
  POR: 'Arquero', DFC: 'Defensor central', LI: 'Lateral izquierdo', LD: 'Lateral derecho', MCD: 'Mediocampista defensivo', MC: 'Mediocampista central',
  MI: 'Mediocampista izquierdo', MD: 'Mediocampista derecho', MCO: 'Mediocampista ofensivo', EI: 'Extremo izquierdo', ED: 'Extremo derecho', DC: 'Delantero centro',
};
/** Lugar de cada posición en la mini cancha (x e y en %, con el arco propio abajo). */
export const DPOS_XY: Record<DPos, readonly [number, number]> = {
  POR: [50, 89], LI: [13, 67], DFC: [50, 71], LD: [87, 67], MCD: [50, 54], MI: [14, 42], MC: [50, 42], MD: [86, 42], MCO: [50, 30], EI: [14, 15], DC: [50, 12], ED: [86, 15],
};
/** La posición típica de cada puesto (lo que usa "Usar mi perfil": ARQ→POR, DEF→DFC, MED→MC, DEL→DC). */
export const DPOS_DEFAULT: Record<Pos, DPos> = { ARQ: 'POR', DEF: 'DFC', MED: 'MC', DEL: 'DC' };
/** Cuánto corre el peso de cada stat en el OVR según la posición (se suma al del puesto y se vuelve a repartir para que sume 1). */
export const DPOS_TWEAK: Record<DPos, Partial<Stats>> = {
  POR: {},
  DFC: { def: 0.03, fis: 0.02, rit: -0.05 },
  LI: { rit: 0.06, reg: 0.02, def: -0.06, fis: -0.02 },
  LD: { rit: 0.06, reg: 0.02, def: -0.06, fis: -0.02 },
  MCD: { def: 0.08, pas: -0.03, tir: -0.03, reg: -0.02 },
  MC: {},
  MI: { rit: 0.05, reg: 0.03, pas: -0.04, def: -0.04 },
  MD: { rit: 0.05, reg: 0.03, pas: -0.04, def: -0.04 },
  MCO: { pas: 0.04, reg: 0.04, def: -0.05, fis: -0.03 },
  EI: { rit: 0.06, reg: 0.04, tir: -0.04, fis: -0.06 },
  ED: { rit: 0.06, reg: 0.04, tir: -0.04, fis: -0.06 },
  DC: { tir: 0.05, fis: 0.03, reg: -0.04, rit: -0.04 },
};
const KEYS: readonly (keyof Stats)[] = ['rit', 'tir', 'pas', 'reg', 'def', 'fis'];
const WCACHE = new Map<DPos, Stats>();
/** Pesos de cada stat en el OVR de esa posición (suman 1). Sin posición, los del puesto. */
export function weightsOf(pos: Pos, dpos?: DPos): Stats {
  const base = POS_W[pos];
  if (!dpos || DPOS_POS[dpos] !== pos) return base;
  const hit = WCACHE.get(dpos);
  if (hit) return hit;
  const tw = DPOS_TWEAK[dpos], w = {} as Record<string, number>;
  let sum = 0;
  for (const k of KEYS) { w[k] = Math.max(0.01, (base[k] as number) + ((tw[k] as number | undefined) ?? 0)); sum += w[k]; }
  for (const k of KEYS) w[k] /= sum;
  const out = w as unknown as Stats;
  WCACHE.set(dpos, out);
  return out;
}
/** La posición que te queda al pasar a otro puesto (un lateral izquierdo que va al medio queda de mediocampista izquierdo, y así). */
const SWITCH_D: Partial<Record<DPos, Partial<Record<Pos, DPos>>>> = {
  LI: { MED: 'MI', DEL: 'EI' }, LD: { MED: 'MD', DEL: 'ED' }, DFC: { MED: 'MCD' }, MCD: { DEF: 'DFC' }, MC: { DEF: 'DFC', DEL: 'DC' },
  MI: { DEF: 'LI', DEL: 'EI' }, MD: { DEF: 'LD', DEL: 'ED' }, MCO: { DEF: 'DFC', DEL: 'DC' }, EI: { MED: 'MI' }, ED: { MED: 'MD' }, DC: { MED: 'MCO' },
};
export const dposFor = (from: DPos, to: Pos): DPos => SWITCH_D[from]?.[to] ?? DPOS_DEFAULT[to];
export const isDPos = (x: unknown): x is DPos => typeof x === 'string' && (DPOS_LIST as readonly string[]).includes(x);

// ---------- Dificultad ----------

export interface DiffDef {
  id: Difficulty; name: string; desc: string;
  /** Se suma al potencial al arrancar. */
  pot: number;
  /** Puntos de OVR que se restan a tu lugar en el plantel (menos minutos). */
  minutes: number;
  /** Puntos de fuerza que se restan al equipo (menos títulos). */
  boost: number;
  /** Multiplica la chance de lesión. */
  injury: number;
  /** Multiplica la chance de premios individuales. */
  awards: number;
  /** Se suma al nivel de los clubes que te quieren (peores ofertas). */
  offers: number;
  /** Multiplica qué tan seguido llegan ofertas de traspaso (menos ofertas). */
  deals: number;
  /** Se suma al puntaje que hace falta para que te convoque la Selección. */
  call: number;
  /** Multiplica el puntaje de Legado. */
  mult: number;
}
export const DIFFS: Record<Difficulty, DiffDef> = {
  normal: { id: 'normal', name: 'Normal', desc: 'El juego tal cual: parejo, para disfrutar la carrera.', pot: 0, minutes: 0, boost: 0, injury: 1, awards: 1, offers: -1, deals: 0.85, call: 0, mult: 1 },
  intenso: { id: 'intenso', name: 'Intenso', desc: 'Menos potencial, menos minutos y más lesiones: cada título cuesta más. Legado ×1,15.', pot: -2, minutes: -1, boost: -0.6, injury: 1.2, awards: 0.88, offers: -7, deals: 0.34, call: -2, mult: 1.15 },
  experto: { id: 'experto', name: 'Experto', desc: 'Pocas ofertas, pocos minutos y un cuerpo frágil: llegar a leyenda es una hazaña. Legado ×1,3.', pot: -5, minutes: -2, boost: -1.2, injury: 1.4, awards: 0.78, offers: -13, deals: 0.12, call: -3, mult: 1.3 },
};
export const DIFF_LIST: readonly DiffDef[] = [DIFFS.normal, DIFFS.intenso, DIFFS.experto];
export const DEFAULT_DIFF: Difficulty = 'normal';
export const isDiff = (x: unknown): x is Difficulty => typeof x === 'string' && Object.prototype.hasOwnProperty.call(DIFFS, x);
/** "×1,15" */
export const fmtMult = (m: number) => `×${String(m).replace('.', ',')}`;

// ---------- Pie hábil ----------

export interface FootDef { id: Foot; name: string; short: string; desc: string }
export const FOOTS: Record<Foot, FootDef> = {
  der: { id: 'der', name: 'Derecha', short: 'Diestro', desc: 'La pierna de siempre.' },
  izq: { id: 'izq', name: 'Izquierda', short: 'Zurdo', desc: 'Los zurdos escasean: los clubes te miran un poco más.' },
  amb: { id: 'amb', name: 'Ambidiestro', short: 'Ambidiestro', desc: 'Hábil con las dos: más regate y pase, algo menos de techo.' },
};
export const FOOT_LIST: readonly FootDef[] = [FOOTS.der, FOOTS.izq, FOOTS.amb];
export const isFoot = (x: unknown): x is Foot => typeof x === 'string' && Object.prototype.hasOwnProperty.call(FOOTS, x);
/** Cuánto sube el nivel de los clubes que te ofrecen por tu pie (los zurdos, un poco más). */
export const FOOT_OFFER: Record<Foot, number> = { der: 0, izq: 1.5, amb: 0.5 };
