// Datos crudos de partidos jugados + presentismo. Lógica pura (sin Supabase) para testear sin variables de entorno.
import { aggregateStats, emptyStats, type Appearance, type EventKind, type PlayerStats, type Team } from './statsCore';

/** Partido jugado de la comunidad. */
export interface PlayedMatch { id: string; starts_at: string; score_a: number | null; score_b: number | null }
/** Anotado ('in') en un partido jugado. `absent`: figura anotado pero no se presentó. */
export interface Signup { match_id: string; profile_id: string; team: Team | null; absent: boolean }
export interface PlayerEvent { match_id: string; kind: EventKind }

export const ms = (iso: string): number => { const t = Date.parse(iso); return Number.isNaN(t) ? 0 : t; };

/** Orden cronológico (desempata por id para que sea estable). */
export const byTime = (a: PlayedMatch, b: PlayedMatch) => ms(a.starts_at) - ms(b.starts_at) || a.id.localeCompare(b.id);

/** Pasó 'played' (jugó), 'absent' (anotado pero no fue) o 'missed' (ni se anotó). */
export type Presence = 'played' | 'absent' | 'missed';

export interface Attendance {
  /** Partidos jugados de la comunidad desde que se sumó (más los que jugó aunque sean anteriores). */
  total: number;
  played: number;
  /** Anotado pero ausente. */
  absences: number;
  /** 0-100, null si todavía no hay partidos que contar. */
  pct: number | null;
  /** Partidos seguidos jugados hasta el más reciente. */
  streak: number;
  /** De más viejo a más nuevo: los últimos 10. */
  recent: Presence[];
  /** Todos los contables, de más viejo a más nuevo (para ventanas de logros). */
  seq: Presence[];
}

export const RECENT = 10;

/** Presentismo a partir de los partidos ya ordenados y las anotaciones del jugador. */
export function attendanceFrom(sorted: PlayedMatch[], mine: Map<string, Signup>, joinedAt: string | null): Attendance {
  const joined = joinedAt ? ms(joinedAt) : null;
  const seq: Presence[] = [];
  for (const m of sorted) {
    const s = mine.get(m.id);
    // Los partidos de antes de que se sumara no le cuentan, salvo que haya jugado.
    if (!s && joined != null && ms(m.starts_at) < joined) continue;
    seq.push(!s ? 'missed' : s.absent ? 'absent' : 'played');
  }
  const played = seq.filter(p => p === 'played').length;
  let streak = 0;
  for (let i = seq.length - 1; i >= 0 && seq[i] === 'played'; i--) streak++;
  return {
    total: seq.length, played, absences: seq.filter(p => p === 'absent').length,
    pct: seq.length ? Math.round((played / seq.length) * 100) : null,
    streak, recent: seq.slice(-RECENT), seq,
  };
}

export const signupMap = (signups: Signup[]) => new Map(signups.map(s => [s.match_id, s]));

/** Presentismo de un jugador (con sus anotaciones, en cualquier orden). */
export function playerAttendance(matches: PlayedMatch[], mine: Signup[], joinedAt: string | null): Attendance {
  return attendanceFrom([...matches].sort(byTime), signupMap(mine), joinedAt);
}

/** Estadísticas del jugador (PJ, goles, G/E/P...) a partir de los mismos datos crudos; cuenta lo mismo que aggregateStats. */
export function playerStatsFrom(pid: string, matches: PlayedMatch[], mine: Signup[], events: PlayerEvent[]): PlayerStats {
  const M = new Map(matches.map(m => [m.id, m]));
  const apps: Appearance[] = mine.filter(s => !s.absent && M.has(s.match_id)).map(s => {
    const m = M.get(s.match_id)!;
    return { match_id: s.match_id, profile_id: s.profile_id, team: s.team, score_a: m.score_a, score_b: m.score_b };
  });
  return aggregateStats(apps, events.map(e => ({ profile_id: pid, kind: e.kind }))).get(pid) ?? emptyStats();
}
