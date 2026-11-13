// "De potrero a leyenda": tipos del simulador de carrera. Solo tipos (sin lógica ni entorno).
import type { Pos, Stats } from '../../shared/model';

export type StyleId = 'potrero' | 'tactico' | 'fisico';
/** Qué tan difícil es la carrera: cambia el crecimiento, los minutos, las ofertas, los títulos, los premios y las lesiones (y multiplica el Legado). */
export type Difficulty = 'normal' | 'intenso' | 'experto';
/** Pie hábil. */
export type Foot = 'der' | 'izq' | 'amb';
/** País del jugador (id de careerNations). */
export type NatId = string;
/** Posición en la cancha: POR, DFC, LI, LD, MCD, MC, MI, MD, MCO, EI, ED, DC. Se juega como ARQ/DEF/MED/DEL (`Career.pos`). */
export type DPos = 'POR' | 'DFC' | 'LI' | 'LD' | 'MCD' | 'MC' | 'MI' | 'MD' | 'MCO' | 'EI' | 'ED' | 'DC';
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
/** Confederación de un club o de una selección ('none' = las inferiores). */
export type Conf = 'conmebol' | 'uefa' | 'concacaf' | 'afc' | 'caf' | 'none';

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
  /** Solo en el momento clave de una final: cuánto suma (o resta) a la fuerza de tu equipo en ese partido. */
  fin?: number;
  /** Cambia de puesto (y de posición en la cancha). */
  pos?: Pos;
  dpos?: DPos;
  /** Cambio directo en las stats (+/−). */
  stat?: Partial<Stats>;
  /** Mudanza: traspaso, préstamo (volvés al club de origen) o regreso al club de las inferiores. */
  move?: { club: Club; kind: 'transfer' | 'loan' | 'return' };
  /**
   * Tirada de riesgo: con probabilidad p pasa `ok`, si no `bad`. `okText`/`badText` cuentan qué pasó; `okTag`/`badTag` son la etiqueta corta
   * que se muestra con su probabilidad en la opción ("Titular 50 %").
   */
  gamble?: { p: number; okText: string; badText: string; ok?: Fx; bad?: Fx; okTag?: string; badTag?: string };
}

/** Cada decisión tiene dos caminos: el seguro y el que se la juega. */
export type Kind = 'safe' | 'risky';
/**
 * Una de las dos opciones. `label` son pocas palabras; `up` lo que ganás (2-3 palabras) y `down` lo que puede salir mal (solo en la arriesgada).
 * `club` es el club al que te lleva (para mostrar su escudo).
 */
export interface Opt { id: string; kind: Kind; icon: string; label: string; up: string; down?: string; club?: string; fx: Fx }
/** Etapa de la carrera: cambia las decisiones que te tocan. */
export type Stage = 'inferiores' | 'debut' | 'consolidacion' | 'pico' | 'veteranía' | 'retiro';

/** Una final que quedó por jugarse: la decisión de último momento la inclina. `p` es la chance de ganarla sin hacer nada especial. */
export interface Tension {
  kind: 'cont' | 'cup'; name: string; cid: ContId | null; p: number; mine: number; opp: number;
  rank: number; cupWon: boolean; extraWon: boolean; lg: LeagueId; mvp: boolean;
}
/** Una decisión: una línea de situación y exactamente dos opciones (la segura y la arriesgada). */
export interface EventInst { id: string; icon: string; title: string; text: string; options: [Opt, Opt] }

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
  /** Selección (y Sub-23): partidos, goles y asistencias, y cómo le fue en cada torneo ("Mundial · Campeón"). */
  caps: number; capGoals: number; capAssists: number; tours: string[];
  injury: Severity | null;
  /** El club subió o bajó de división al terminar la temporada. */
  promo: 'up' | 'down' | null;
  captain: boolean;
  /** Valor de mercado al cerrar la temporada, en euros. */
  val: number;
  picks: string[];      // lo que elegiste
  lines: string[];      // lo que pasó, para contarlo
  /** La decisión de la temporada: cuál era, qué camino tomaste y, si era arriesgado, si salió bien. */
  ev: string;
  kind: Kind | null;
  risk: 'ok' | 'bad' | null;
  /** Lo que pasó con la apuesta, en una línea ("Se cayó el pase: volvés a Banfield."). */
  say: string;
  /** El titular de la temporada (estilo diario) y lo que te quedó cerca. */
  head: string;
  near: string;
  /** Hitos de esta temporada (ids de careerStory.MILES): el primer gol, el debut, la Selección… */
  miles: string[];
}

export type Phase = 'decide' | 'result' | 'over';
export type RetireWhy = 'elegido' | 'edad' | 'fisico';

/** Estado completo de una carrera. Serializable (JSON): mismo seed + mismas decisiones = misma carrera. */
export interface Career {
  /** Versión del formato: la 4 trae una sola decisión por temporada (segura o arriesgada), titulares e hitos. Las de la 3 se migran; las anteriores se descartan. */
  v: 4;
  seed: number;
  rng: number;
  /** Año en que arrancó la carrera (a los 17): marca el calendario de Mundiales, copas continentales y Juegos Olímpicos. */
  y0: number;
  diff: Difficulty;
  nat: NatId;
  foot: Foot;
  name: string;
  /** Apellido (para la camiseta) y número. */
  surname: string;
  num: number;
  pos: Pos;
  dpos: DPos;
  /** La posición con la que arrancó la carrera (`dpos` cambia si un DT te reconvierte): "Jugar otra carrera" vuelve a arrancar con esta. Las carreras guardadas antes de este campo no la tienen. */
  dpos0?: DPos;
  style: StyleId;
  fromCard: boolean;
  stats: Stats;
  potential: number;
  /** Ritmo de crecimiento propio (puntos de OVR por punto de la curva de edad), fijo desde el arranque. */
  rate: number;
  age: number;
  club: Club;
  /** El club de tus inferiores. */
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
  /** La decisión que se acaba de tomar (cuál, qué camino y cómo salió): se anota en el SeasonLog al jugar la temporada. */
  pk?: { ev: string; kind: Kind; ok: boolean | null; say: string } | null;
  /** Id de la decisión de la temporada anterior (para no repetirla seguido). */
  last?: string;
  history: SeasonLog[];
  retire: RetireWhy | null;
  /** Si la temporada ya se jugó pero falta una final decisiva: el momento clave que se está decidiendo. */
  tension?: Tension | null;
  /** Día (de la Argentina) del Desafío del día al que pertenece esta carrera, si lo es. */
  daily?: string;
  /** Identificador de este intento para contarlo una sola vez (el desafío del día repite la semilla en cada intento). */
  aid?: number;
}

/** `year`: el año de calendario de la primera temporada (por defecto 2026). */
export interface NewCareerOpts {
  seed: number; name: string; pos: Pos; style: StyleId; card?: Stats | null; year?: number;
  diff?: Difficulty; nat?: NatId; foot?: Foot; surname?: string; num?: number; dpos?: DPos; daily?: string; aid?: number;
}

/** Lo que se elige en la pantalla de arranque. */
export interface StartOpts { name: string; surname: string; num: number; dpos: DPos; nat: NatId; foot: Foot; diff: Difficulty; style: StyleId; useCard: boolean }

export interface Totals {
  seasons: number; clubs: number; pj: number; goals: number; assists: number; cs: number;
  trophies: number; caps: number; capGoals: number; capAssists: number; peak: number; peakTier: Tier; awards: number;
  captainSeasons: number; bestRating: number; peakVal: number;
}

export interface Legacy {
  /** Puntaje final (ya con el multiplicador de la dificultad), el de antes del multiplicador y el multiplicador. */
  score: number; base: number; mult: number; label: string; index: number;
}

/** Resumen de la mejor carrera de este dispositivo (una por dificultad). */
export interface Best { v: 3; d: Difficulty; seed: number; name: string; surname: string; num: number; pos: Pos; label: string; score: number; peak: number; seasons: number; trophies: number }
