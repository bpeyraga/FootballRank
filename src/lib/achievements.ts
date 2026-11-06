// Logros e insignias de un jugador. Lógica pura: se calcula en el cliente con los datos crudos de la comunidad.
import { outcome } from './statsCore';
import { attendanceFrom, byTime, ms, signupMap, type PlayedMatch, type PlayerEvent, type Signup } from './playCore';

export interface Achievement {
  id: string;
  emoji: string;
  name: string;
  desc: string;
  /** Avance (para los bloqueados: nunca llega a `goal`). */
  have: number;
  goal: number;
  unlocked: boolean;
  /** Cuándo se desbloqueó (hora del partido que lo destrabó); null si no se sabe. */
  at: number | null;
  /** "×3" en los que se repiten. */
  times: number | null;
}

export interface AchievementInput {
  matches: PlayedMatch[];
  /** Anotaciones del jugador (incluye ausentes: no suman). */
  mine: Signup[];
  /** Eventos del jugador. */
  events: PlayerEvent[];
  /** Veces que fue figura del partido. */
  mvpTimes: number;
  joinedAt: string | null;
}

interface Play { id: string; at: number; won: boolean | null; conceded: number | null; goals: number; assists: number; cards: number; reds: number }

/** Mínimo y ventana de "Siempre presente". */
export const ALWAYS_MIN = 5;
export const ALWAYS_WINDOW = 10;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/**
 * Logros del jugador, ordenados: primero los desbloqueados (el más nuevo arriba; los que no tienen fecha, al final de ese grupo)
 * y después los bloqueados, del más cercano al más lejano.
 * "Fair play" = 10 partidos seguidos sin ninguna tarjeta. "Siempre presente" depende de lo reciente: se puede perder.
 */
export function computeAchievements(inp: AchievementInput): Achievement[] {
  const mineMap = signupMap(inp.mine);
  const sorted = [...inp.matches].sort(byTime);

  const by = (kind: string) => {
    const m = new Map<string, number>();
    for (const e of inp.events) if (e.kind === kind) m.set(e.match_id, (m.get(e.match_id) ?? 0) + 1);
    return m;
  };
  const goals = by('goal'), assists = by('assist'), yellows = by('yellow'), reds = by('red');

  const plays: Play[] = [];
  for (const m of sorted) {
    const s = mineMap.get(m.id);
    if (!s || s.absent) continue;
    const o = outcome(s.team, m.score_a, m.score_b);
    const decided = s.team != null && m.score_a != null && m.score_b != null;
    plays.push({
      id: m.id, at: ms(m.starts_at),
      won: o == null ? null : o === 'won',
      conceded: decided ? (s.team === 'A' ? m.score_b! : m.score_a!) : null,
      goals: goals.get(m.id) ?? 0, assists: assists.get(m.id) ?? 0,
      cards: (yellows.get(m.id) ?? 0) + (reds.get(m.id) ?? 0), reds: reds.get(m.id) ?? 0,
    });
  }

  /** Hora del partido en el que el acumulado llega a `target` (null si no llega). */
  const reach = (value: (p: Play) => number, target: number): number | null => {
    let acc = 0;
    for (const p of plays) { acc += value(p); if (acc >= target) return p.at; }
    return null;
  };
  const sum = (value: (p: Play) => number) => plays.reduce((t, p) => t + value(p), 0);

  const pj = plays.length;
  const totalGoals = sum(p => p.goals);
  const totalAssists = sum(p => p.assists);
  const wins = sum(p => p.won ? 1 : 0);
  const clean = plays.filter(p => p.conceded === 0);
  const hat = plays.filter(p => p.goals >= 3);
  const bestGoals = Math.max(0, ...plays.map(p => p.goals));
  const redPlays = plays.filter(p => p.reds > 0);

  // Racha de victorias: solo cuentan los partidos con equipos y resultado.
  let cur = 0, bestWins = 0, streakAt: number | null = null;
  for (const p of plays) {
    if (p.won == null) continue;
    cur = p.won ? cur + 1 : 0;
    bestWins = Math.max(bestWins, cur);
    if (cur >= 3 && streakAt == null) streakAt = p.at;
  }

  // Fair play: la mejor tanda de partidos seguidos sin tarjetas.
  let run = 0, bestRun = 0, fairAt: number | null = null;
  for (const p of plays) {
    run = p.cards === 0 ? run + 1 : 0;
    bestRun = Math.max(bestRun, run);
    if (run >= 10 && fairAt == null) fairAt = p.at;
  }

  // Siempre presente: asistencia perfecta en los últimos partidos de la comunidad (desde que se sumó).
  const att = attendanceFrom(sorted, mineMap, inp.joinedAt);
  const win = att.recent;
  const alwaysOn = win.length >= ALWAYS_MIN && win.every(p => p === 'played');
  const alwaysGoal = clamp(win.length, ALWAYS_MIN, ALWAYS_WINDOW);
  const lastAt = sorted.length ? ms(sorted[sorted.length - 1].starts_at) : null;

  const mk = (id: string, emoji: string, name: string, desc: string, have: number, goal: number,
    at: number | null, times: number | null = null, forceOn?: boolean): Achievement => {
    const unlocked = forceOn ?? have >= goal;
    return { id, emoji, name, desc, have: unlocked ? goal : Math.min(have, goal - 1), goal, unlocked, at: unlocked ? at : null, times: unlocked ? times : null };
  };

  const list: Achievement[] = [
    mk('debut', '🎽', 'Debut', 'Jugar el primer partido', pj, 1, reach(() => 1, 1)),
    mk('pj10', '🏃', 'Habitual', 'Jugar 10 partidos', pj, 10, reach(() => 1, 10)),
    mk('pj25', '🧱', 'Pilar', 'Jugar 25 partidos', pj, 25, reach(() => 1, 25)),
    mk('pj50', '👑', 'Leyenda', 'Jugar 50 partidos', pj, 50, reach(() => 1, 50)),
    mk('goal1', '⚽', 'Primer gol', 'Convertir el primer gol', totalGoals, 1, reach(p => p.goals, 1)),
    mk('hat', '🎩', 'Hat-trick', '3 goles o más en un partido', bestGoals, 3, hat[0]?.at ?? null, hat.length),
    mk('goal10', '🎯', 'Goleador', 'Llegar a 10 goles', totalGoals, 10, reach(p => p.goals, 10)),
    mk('ast10', '👟', 'Asistidor', 'Llegar a 10 asistencias', totalAssists, 10, reach(p => p.assists, 10)),
    mk('clean', '🧤', 'Valla invicta', 'Terminar un partido con el arco en cero', clean.length, 1, clean[0]?.at ?? null, clean.length),
    mk('win10', '🥇', 'Ganador', 'Ganar 10 partidos', wins, 10, reach(p => p.won ? 1 : 0, 10)),
    mk('streak3', '🔥', 'Racha', '3 victorias seguidas', bestWins, 3, streakAt),
    mk('fair', '🤝', 'Fair play', '10 partidos seguidos sin tarjetas', bestRun, 10, fairAt),
    mk('red', '😅', 'Primera roja', 'Ver la primera roja', redPlays.length, 1, redPlays[0]?.at ?? null, redPlays.length),
    mk('mvp1', '⭐', 'Figura', 'Ser figura del partido', inp.mvpTimes, 1, null, inp.mvpTimes),
    mk('mvp5', '💎', 'Crack', 'Ser figura 5 veces', inp.mvpTimes, 5, null),
    mk('always', '📅', 'Siempre presente', `Asistencia perfecta en los últimos ${ALWAYS_WINDOW} partidos (mínimo ${ALWAYS_MIN})`,
      att.streak, alwaysGoal, lastAt, null, alwaysOn),
  ];
  // "×1" no dice nada
  for (const a of list) if (a.times != null && a.times < 2) a.times = null;
  return sortAchievements(list);
}

/** Desbloqueados primero (más nuevos arriba; sin fecha al final), después bloqueados por cercanía. Estable en empates. */
export function sortAchievements(list: Achievement[]): Achievement[] {
  const order = new Map(list.map((a, i) => [a.id, i]));
  const ratio = (a: Achievement) => a.have / a.goal;
  return [...list].sort((a, b) => {
    if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
    if (a.unlocked) {
      if ((a.at == null) !== (b.at == null)) return a.at == null ? 1 : -1;
      if (a.at != null && b.at != null && a.at !== b.at) return b.at - a.at;
    } else if (ratio(a) !== ratio(b)) return ratio(b) - ratio(a);
    return order.get(a.id)! - order.get(b.id)!;
  });
}
