// Estadísticas por jugador: tipos y agregación pura (sin Supabase, para testear sin variables de entorno).

export type EventKind = 'goal' | 'assist' | 'yellow' | 'red';
export type Team = 'A' | 'B';

/** Orden de aparición en pantallas. */
export const EVENT_KINDS: readonly EventKind[] = ['goal', 'assist', 'yellow', 'red'];
export const KIND_ICON: Record<EventKind, string> = { goal: '⚽', assist: '👟', yellow: '🟨', red: '🟥' };
export const KIND_LABEL: Record<EventKind, string> = { goal: 'Gol', assist: 'Asistencia', yellow: 'Amarilla', red: 'Roja' };
export const KIND_LABEL_PLURAL: Record<EventKind, string> = { goal: 'Goles', assist: 'Asistencias', yellow: 'Amarillas', red: 'Rojas' };

export interface MatchEvent {
  id: number; match_id: string; community_id: string; profile_id: string;
  kind: EventKind; created_by: string | null; created_at: string;
}

/** Una participación: el jugador estuvo anotado ('in') en un partido jugado. */
export interface Appearance {
  match_id: string; profile_id: string; team: Team | null;
  score_a: number | null; score_b: number | null;
}

export interface PlayerStats {
  pj: number; goals: number; assists: number; yellow: number; red: number;
  won: number; drawn: number; lost: number;
}

export const emptyStats = (): PlayerStats =>
  ({ pj: 0, goals: 0, assists: 0, yellow: 0, red: 0, won: 0, drawn: 0, lost: 0 });

/** Resultado para un equipo; null si no hay equipo o marcador. */
export function outcome(team: Team | null, a: number | null, b: number | null): 'won' | 'drawn' | 'lost' | null {
  if (!team || a == null || b == null) return null;
  if (a === b) return 'drawn';
  return (team === 'A') === (a > b) ? 'won' : 'lost';
}

/**
 * Agrega PJ, goles, asistencias, tarjetas y G/E/P por jugador.
 * G/E/P solo cuenta partidos con equipo asignado y marcador cargado, así que ganados+empatados+perdidos <= pj.
 */
export function aggregateStats(appearances: Appearance[], events: Pick<MatchEvent, 'profile_id' | 'kind'>[]): Map<string, PlayerStats> {
  const out = new Map<string, PlayerStats>();
  const get = (id: string) => { let s = out.get(id); if (!s) out.set(id, s = emptyStats()); return s; };
  for (const ap of appearances) {
    const s = get(ap.profile_id);
    s.pj++;
    const o = outcome(ap.team, ap.score_a, ap.score_b);
    if (o) s[o]++;
  }
  for (const e of events) {
    const s = get(e.profile_id);
    if (e.kind === 'goal') s.goals++;
    else if (e.kind === 'assist') s.assists++;
    else if (e.kind === 'yellow') s.yellow++;
    else if (e.kind === 'red') s.red++;
  }
  return out;
}

/** Promedio por partido (2 decimales); 0 si no jugó. */
export const perMatch = (n: number, pj: number) => pj > 0 ? Math.round((n / pj) * 100) / 100 : 0;

export interface BoardRow { id: string; name: string; value: number; pj: number; pos: number }

/** Tabla ordenada por goles o asistencias: oculta ceros, desempata por nombre y comparte posición en empates. */
export function leaderboard(
  players: { id: string; name: string }[],
  stats: Map<string, PlayerStats>,
  key: 'goals' | 'assists',
): BoardRow[] {
  const rows = players
    .map(p => ({ id: p.id, name: p.name, value: stats.get(p.id)?.[key] ?? 0, pj: stats.get(p.id)?.pj ?? 0 }))
    .filter(r => r.value > 0)
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  let pos = 0;
  return rows.map((r, i) => {
    if (i === 0 || r.value !== rows[i - 1].value) pos = i + 1;
    return { ...r, pos };
  });
}

export interface EventGroup { profile_id: string; kind: EventKind; events: MatchEvent[] }
export interface TeamEvents { team: Team | 'none'; goals: number; groups: EventGroup[] }

/**
 * Agrupa los eventos de un partido por equipo (A, B, sin equipo) y, dentro de cada uno, por jugador y tipo.
 * Orden: goles, asistencias, amarillas, rojas; dentro de cada tipo, más repeticiones primero y luego por orden de carga.
 * Si no hay equipos, todo cae en 'none'. Solo devuelve equipos con eventos.
 */
export function groupMatchEvents(events: MatchEvent[], teamOf: (profileId: string) => Team | null): TeamEvents[] {
  const buckets = new Map<Team | 'none', Map<string, EventGroup>>();
  for (const e of [...events].sort((a, b) => a.id - b.id)) {
    const t = teamOf(e.profile_id) ?? 'none';
    let g = buckets.get(t);
    if (!g) buckets.set(t, g = new Map());
    const k = `${e.profile_id}|${e.kind}`;
    const grp = g.get(k);
    if (grp) grp.events.push(e); else g.set(k, { profile_id: e.profile_id, kind: e.kind, events: [e] });
  }
  return (['A', 'B', 'none'] as const).flatMap(t => {
    const g = buckets.get(t);
    if (!g) return [];
    const groups = [...g.values()].sort((a, b) =>
      EVENT_KINDS.indexOf(a.kind) - EVENT_KINDS.indexOf(b.kind) ||
      b.events.length - a.events.length || a.events[0].id - b.events[0].id);
    const goals = groups.filter(x => x.kind === 'goal').reduce((n, x) => n + x.events.length, 0);
    return [{ team: t, goals, groups }];
  });
}

/** Número con coma decimal (es-AR), sin ceros de más: 1.5 -> "1,5". */
export const fmtAvg = (n: number) => String(n).replace('.', ',');
