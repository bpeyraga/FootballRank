// Tablas del ranking de la comunidad: figura del partido y presentismo. Lógica pura.
import { attendanceFrom, byTime, type PlayedMatch, type Signup } from '../stats/playCore';

export interface PosRow { pos: number }

/** Posición compartida en empates (según `same`). Las filas ya vienen ordenadas. */
function withPos<T>(rows: T[], same: (a: T, b: T) => boolean): (T & PosRow)[] {
  let pos = 0;
  return rows.map((r, i) => {
    if (i === 0 || !same(r, rows[i - 1])) pos = i + 1;
    return { ...r, pos };
  });
}

export interface MvpRow { id: string; name: string; value: number; pos: number }

/** Tabla de figuras: más veces figura primero, oculta a quien nunca lo fue y desempata por nombre. */
export function mvpBoard(players: { id: string; name: string }[], mvps: { profile_id: string; times: number }[]): MvpRow[] {
  const times = new Map(mvps.map(m => [m.profile_id, m.times]));
  const rows = players
    .map(p => ({ id: p.id, name: p.name, value: times.get(p.id) ?? 0 }))
    .filter(r => r.value > 0)
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  return withPos(rows, (a, b) => a.value === b.value);
}

export interface PresenceRow {
  id: string; name: string; total: number; played: number; absences: number; pct: number; streak: number; pos: number;
}

/**
 * Tabla de presentismo: % de partidos jugados de la comunidad desde que cada uno se sumó.
 * Oculta a quien todavía no jugó ninguno; desempata por más partidos jugados, racha y nombre.
 */
export function presenceBoard(
  players: { id: string; name: string }[],
  matches: PlayedMatch[], signups: Signup[], joined: Map<string, string>,
): PresenceRow[] {
  const sorted = [...matches].sort(byTime);
  const per = new Map<string, Map<string, Signup>>();
  for (const s of signups) {
    let m = per.get(s.profile_id);
    if (!m) per.set(s.profile_id, m = new Map());
    m.set(s.match_id, s);
  }
  const rows = players.map(p => {
    const a = attendanceFrom(sorted, per.get(p.id) ?? new Map(), joined.get(p.id) ?? null);
    return { id: p.id, name: p.name, total: a.total, played: a.played, absences: a.absences, pct: a.pct ?? 0, streak: a.streak };
  }).filter(r => r.total > 0 && r.played > 0)
    .sort((a, b) => b.pct - a.pct || b.played - a.played || b.streak - a.streak || a.name.localeCompare(b.name));
  return withPos(rows, (a, b) => a.pct === b.pct && a.played === b.played);
}
