// Tutorial de la primera vez (Home): pasos, reglas de teclado/deslizar y "ya lo vio" por dispositivo.
// Lógica pura (sin Preact ni Supabase) para poder testearla.

export interface TourStep {
  emoji: string;
  title: string;
  /** Una o dos frases, en voseo. */
  text: string;
  /** Etiquetas debajo del texto (opcional). */
  chips?: string[];
}

export const TOUR_STEPS: TourStep[] = [
  {
    emoji: '🏟️', title: 'Armá o sumate a una comunidad',
    text: 'Creá la de tu grupo y compartí el link de invitación por WhatsApp, o pegá el que te pasaron. Si ya te cargaron con tu nombre, tocá "¿Sos vos?" en tu ficha para quedártela.',
  },
  {
    emoji: '⭐', title: 'Votá a tus compañeros',
    text: 'Calificá a cada uno en seis atributos. El promedio de los votos arma el OVR y el color de su carta.',
    chips: ['RIT', 'TIR', 'PAS', 'REG', 'DEF', 'FIS'],
  },
  {
    emoji: '⚽', title: 'Anotate y jugá',
    text: 'Anotate con un toque cuando se convoca un partido. Se arman equipos parejos según el nivel y, en la cancha, los goles, faltas y tarjetas se cargan en vivo.',
    chips: ['Lista', 'Equipos parejos', 'En vivo'],
  },
  {
    emoji: '🏆', title: 'Ranking, figura y campeones',
    text: 'Mirá el ranking por OVR, goleadores, asistencias y presentismo. Después de cada partido el grupo vota a la figura, y al cerrar cada temporada quedan los campeones.',
    chips: ['OVR', 'Goleadores', 'Figura', 'Campeones'],
  },
  {
    emoji: '🔔', title: 'Avisos y app instalada',
    text: 'Activá los avisos para enterarte de cada convocatoria e instalá la app en tu celular. Los avisos están en el menú de tu foto; instalar la app, en tu perfil, dentro de "Ajustes y ayuda".',
  },
];

export type TourKey = 'next' | 'prev' | 'close';

/** Qué hace una tecla dentro del tutorial (null: no es nuestra). */
export function keyAction(key: string): TourKey | null {
  if (key === 'ArrowRight') return 'next';
  if (key === 'ArrowLeft') return 'prev';
  if (key === 'Escape') return 'close';
  return null;
}

/** Paso al que se llega desde `i` moviéndose `d`, sin salirse de 0..n-1. */
export const clampStep = (i: number, d: number, n: number) => Math.max(0, Math.min(n - 1, i + d));

/** Deslizar horizontal: -1 (a la izquierda → siguiente) o 1 (derecha → anterior); 0 si fue un toque o un scroll vertical. */
export function swipeDir(dx: number, dy: number, min = 48): -1 | 0 | 1 {
  if (Math.abs(dx) < min || Math.abs(dx) < Math.abs(dy) * 1.5) return 0;
  return dx < 0 ? -1 : 1;
}

export const TOUR_KEY = 'fr-tour-v1';

type Store = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * "¿Ya vio el tutorial?" por dispositivo (localStorage) y por cuenta (profiles.tour_seen_at, que llega en `serverSeen`). Si el storage falla (modo privado, bloqueado), lo
 * recuerda en memoria: se muestra a lo sumo una vez por sesión de la página.
 */
export function makeTourGate(getStore: () => Store | null) {
  let shown = false;
  const local = () => { try { return !!getStore()?.getItem(TOUR_KEY); } catch { return false; } };
  return {
    /** Si corresponde mostrarlo solo, ahora: ni en esta página, ni en este dispositivo, ni en la cuenta (otro dispositivo). */
    due(serverSeen = false): boolean {
      if (shown || serverSeen) return false;
      return !local();
    },
    /** ¿Quedó marcado en este dispositivo? */
    local,
    /** Lo marca como visto (en memoria y, si se puede, en el dispositivo). */
    mark(): void {
      shown = true;
      try { getStore()?.setItem(TOUR_KEY, '1'); } catch { /* sin storage */ }
    },
  };
}

/**
 * Local vs. cuenta, sin mostrar nada: 'setLocal' = la cuenta ya lo vio y este dispositivo no (se marca en silencio, no se
 * vuelve a mostrar); 'backfill' = este dispositivo lo vio y la cuenta no (se le avisa a la cuenta una vez); 'none' = al día.
 * `serverSeen` undefined: no se sabe (la base sin la migración): no se toca la cuenta.
 */
export function tourSyncAction(local: boolean, serverSeen: boolean | undefined): 'setLocal' | 'backfill' | 'none' {
  if (serverSeen === undefined) return 'none';
  if (serverSeen && !local) return 'setLocal';
  if (local && !serverSeen) return 'backfill';
  return 'none';
}

export const tourGate = makeTourGate(() => { try { return localStorage; } catch { return null; } });

/** Cuánto vale un pedido de tutorial que nadie recogió (el Home se arma en un instante; pasado ese tiempo ya no es lo que quiso el usuario). */
export const TOUR_ASK_TTL_MS = 8000;

/**
 * "Ver tutorial" desde otra pantalla (Ajustes del perfil): el tutorial vive en el Home, así que quien lo pide lo anota acá
 * y vuelve al Home; useTour lo recoge al montarse. Se recoge una sola vez y caduca solo, para que un pedido que no llegó
 * a destino (p. ej. un dueño que no juega y no ve el Home) no lo abra de sorpresa más tarde.
 */
export function makeTourRequest(ttl = TOUR_ASK_TTL_MS) {
  let at: number | null = null;
  return {
    ask(now = Date.now()): void { at = now; },
    /** ¿Lo pidieron (y sigue vigente)? Lo consume: la segunda vez da false. */
    take(now = Date.now()): boolean {
      const ok = at !== null && now - at <= ttl;
      at = null;
      return ok;
    },
  };
}

export const tourRequest = makeTourRequest();
