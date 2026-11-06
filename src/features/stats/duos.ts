// Duplas: con quién ganás más y contra quién perdés más. Lógica pura.
import { outcome } from './statsCore';
import type { PlayedMatch, Signup } from './playCore';

export interface DuoRow {
  id: string;
  /** Partidos compartidos (con equipos y resultado). */
  games: number;
  wins: number;
  draws: number;
  losses: number;
  /** 0-100: % de victorias juntos (compañeros) o de derrotas en contra (rivales). */
  pct: number;
}
export interface Duos { mates: DuoRow[]; rivals: DuoRow[] }

export const DUO_MIN_GAMES = 2;
export const DUO_TOP = 3;

/**
 * Compañeros con los que más ganás y rivales contra los que más perdés. Solo cuentan los partidos donde jugaste
 * con equipo y hay resultado cargado, sin ausentes; hacen falta al menos `min` partidos juntos o enfrente.
 * Desempata por más partidos y después por id.
 */
export function computeDuos(pid: string, matches: PlayedMatch[], signups: Signup[],
  opts: { min?: number; top?: number } = {}): Duos {
  const min = opts.min ?? DUO_MIN_GAMES, top = opts.top ?? DUO_TOP;
  const byMatch = new Map<string, Signup[]>();
  for (const s of signups) {
    if (s.absent || !s.team) continue;
    const l = byMatch.get(s.match_id);
    if (l) l.push(s); else byMatch.set(s.match_id, [s]);
  }
  const mates = new Map<string, DuoRow>(), rivals = new Map<string, DuoRow>();
  const bump = (m: Map<string, DuoRow>, id: string, o: 'won' | 'drawn' | 'lost') => {
    let r = m.get(id);
    if (!r) m.set(id, r = { id, games: 0, wins: 0, draws: 0, losses: 0, pct: 0 });
    r.games++;
    if (o === 'won') r.wins++; else if (o === 'drawn') r.draws++; else r.losses++;
  };
  for (const m of matches) {
    const list = byMatch.get(m.id);
    const me = list?.find(s => s.profile_id === pid);
    if (!list || !me) continue;
    const o = outcome(me.team, m.score_a, m.score_b);
    if (!o) continue;
    for (const s of list) {
      if (s.profile_id === pid) continue;
      bump(s.team === me.team ? mates : rivals, s.profile_id, o);
    }
  }
  const rank = (m: Map<string, DuoRow>, hit: 'wins' | 'losses') =>
    [...m.values()]
      .filter(r => r.games >= min && r[hit] > 0)
      .map(r => ({ ...r, pct: Math.round((r[hit] / r.games) * 100) }))
      .sort((a, b) => b.pct - a.pct || b.games - a.games || a.id.localeCompare(b.id))
      .slice(0, top);
  return { mates: rank(mates, 'wins'), rivals: rank(rivals, 'losses') };
}
