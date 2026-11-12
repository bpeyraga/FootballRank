// "De potrero a leyenda": tipos del simulador de carrera. Solo tipos (sin lógica ni entorno).
import type { Pos, Stats } from '../../shared/model';

export type StyleId = 'potrero' | 'tactico' | 'fisico';
/**
 * Categoría de un club según su fuerza (`Club.pw`): 0 inferiores · 1 Ascenso y ligas chicas · 2 Primera y ligas medianas · 3 grandes locales,
 * Brasil, México, MLS y Arabia · 4 Europa media y lo mejor de Brasil · 5 Europa élite.
 */
export type Tier = 0 | 1 | 2 | 3 | 4 | 5;
export type Severity = 'leve' | 'media' | 'grave';

/** Liga o torneo local de un club ('inf' = las inferiores, antes de debutar). */
export type LeagueId = 'inf' | 'ar1' | 'ar2' | 'br' | 'uy' | 'cl' | 'co' | 'py' | 'ec' | 'mx' | 'us' | 'sa' | 'en' | 'es' | 'it' | 'de' | 'fr' | 'pt' | 'nl' | 'tr';
/** Copas continentales: Libertadores, Sudamericana, Champions, Europa League, Conference League, Concachampions y Champions de Asia. */
export type ContId = 'lib' | 'sud' | 'cl' | 'el' | 'ecl' | 'ccc' | 'acl';

/** Un club real. `pw` es su fuerza: el OVR de un titular (60 = Ascenso, 70 = Primera, 77 = grande, 80 = Europa media, 87 = élite). */
export interface Club { name: string; tier: Tier; pw: number; lg: LeagueId }

/** Lo que cambia una opción. Todo son probabilidades o empujones, nunca certezas (salvo mudarte de club). */
export interface Fx {
  /** Puntos de OVR extra al cierre de la temporada. */
  growth?: number;
  /** Se suma a la chance de lesión (0.05 = 5 puntos). */
  injury?: number;
  /** Corre tu lugar en el plantel, en puntos de OVR (+ más minutos, − menos). */
  minutes?: number;
  /** Suma a la nota promedio. */
  form?: number;
  /** Suma a las chances de títulos del equipo (0.1 = 10 % más). */
  team?: number;
  /** Confianza del DT (−2 a 2), persiste mientras estés en el club. */
  trust?: number;
  /** Convocatoria a la Selección: true = vas, false = pedís descanso. */
  cap?: boolean;
  /** Convocatoria a la Sub-23 para los Juegos Olímpicos: true = vas, false = pedís descanso. */
  oly?: boolean;
  /** Te quedás con la cinta de capitán. */
  captain?: boolean;
  /** Cambia de puesto. */
  pos?: Pos;
  /** Cambio directo en las stats (+/−). */
  stat?: Partial<Stats>;
  /** Mudanza: traspaso, préstamo (volvés al club de origen) o regreso al club de las inferiores. */
  move?: { club: Club; kind: 'transfer' | 'loan' | 'return' };
  /** Tirada de riesgo: con probabilidad p pasa `ok`, si no `bad`. `text` cuenta qué pasó (ok o bad según `okText`/`badText`). */
  gamble?: { p: number; okText: string; badText: string; ok?: Fx; bad?: Fx };
}

export interface Opt { id: string; label: string; hint: string; fx: Fx }
export interface EventInst { id: string; title: string; text: string; options: Opt[] }

/** Acumulado de las decisiones de la temporada en curso. */
export interface Mods { growth: number; injury: number; minutes: number; form: number; team: number; cap: boolean; oly: boolean }

export interface SeasonLog {
  n: number;            // número de temporada (1, 2, …)
  age: number;
  club: string;
  tier: Tier;
  lg: LeagueId;         // liga del club esa temporada
  fin: number;          // puesto en la liga (0 si no hubo tabla)
  cont: string;         // copa continental que jugó ('' si ninguna)
  ovr0: number;         // OVR al arrancar la temporada
  ovr: number;          // OVR al cerrarla
  pj: number; goals: number; assists: number; cs: number;
  rating: number;       // nota promedio (0 si no jugó)
  role: string;
  trophies: string[];
  awards: string[];
  caps: number; capGoals: number;
  injury: Severity | null;
  captain: boolean;
  picks: string[];      // lo que elegiste
  lines: string[];      // lo que pasó, para contarlo
}

export type Phase = 'decide' | 'result' | 'over';
export type RetireWhy = 'elegido' | 'edad' | 'fisico';

/** Estado completo de una carrera. Serializable (JSON): mismo seed + mismas decisiones = misma carrera. */
export interface Career {
  /** Versión del formato: la 2 es la de los clubes reales (las carreras de la 1, con clubes inventados, se descartan). */
  v: 2;
  seed: number;
  rng: number;
  /** Año en que arrancó la carrera (a los 17): marca el calendario de Mundiales, Copas América y Juegos Olímpicos. */
  y0: number;
  name: string;
  pos: Pos;
  style: StyleId;
  fromCard: boolean;
  stats: Stats;
  potential: number;
  /** Ritmo de crecimiento propio (puntos de OVR por punto de la curva de edad), fijo desde el arranque. */
  rate: number;
  age: number;
  club: Club;
  /** El club de tus inferiores (uno argentino). */
  home: string;
  loan: Club | null;
  /** La copa continental que jugás esta temporada (según cómo terminó tu club el año anterior), o null. */
  qual: ContId | null;
  stint: number;
  captain: boolean;
  trust: number;
  /** Ya volviste al club de tus inferiores y jugaste una temporada ahí (recién ahí cuenta para el Legado). */
  returned: boolean;
  /** Elegiste volver al club de tus inferiores y esa temporada todavía no se jugó. */
  returning?: boolean;
  lastInjury: Severity | null;
  phase: Phase;
  queue: EventInst[];
  mods: Mods;
  notes: string[];
  picks: string[];
  history: SeasonLog[];
  retire: RetireWhy | null;
}

/** `year`: el año de calendario de la primera temporada (por defecto 2026). */
export interface NewCareerOpts { seed: number; name: string; pos: Pos; style: StyleId; card?: Stats | null; year?: number }

export interface Totals {
  seasons: number; clubs: number; pj: number; goals: number; assists: number; cs: number;
  trophies: number; caps: number; capGoals: number; peak: number; peakTier: Tier; awards: number;
  captainSeasons: number; bestRating: number;
}

export interface Legacy { score: number; label: string; index: number }

/** Resumen de la mejor carrera de este dispositivo. */
export interface Best { v: 2; seed: number; name: string; pos: Pos; label: string; score: number; peak: number; seasons: number; trophies: number }
