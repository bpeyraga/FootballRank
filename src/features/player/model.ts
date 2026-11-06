// Perfil del jugador: reglas puras (sin Supabase ni Preact).
import { plain } from '../../shared/ui/Radar';
import type { Team } from '../stats/stats';
import { labelKey, type CustomRow } from '../stats/customStats';

export interface Played {
  id: string; title: string; starts_at: string; team: Team | null;
  score_a: number | null; score_b: number | null; rating: number | null; n: number; absent: boolean;
}

interface SignupRow { team: Team | null; absent: boolean | null; match: { id: string; title: string; starts_at: string; score_a: number | null; score_b: number | null } }
interface ScoreRow { match_id: string; avg_score: number | string; n: number }

/** Junta anotaciones y notas en el historial, del más nuevo al más viejo. */
export function playedHistory(signups: SignupRow[], scores: ScoreRow[]): Played[] {
  const S = new Map(scores.map(x => [x.match_id, x]));
  return signups.map(x => {
    const s = S.get(x.match.id);
    return {
      id: x.match.id, title: x.match.title, starts_at: x.match.starts_at, team: x.team, absent: !!x.absent,
      score_a: x.match.score_a, score_b: x.match.score_b,
      rating: s ? +s.avg_score : null, n: s?.n ?? 0,
    };
  }).sort((a, b) => +new Date(b.starts_at) - +new Date(a.starts_at));
}

/** Nota promedio (con coma, 1 decimal) de los partidos calificados en los que no faltó, y cuántas faltas. */
export function historySummary(list: Played[]) {
  const rated = list.filter(m => m.rating != null && !m.absent);
  return {
    rated: rated.length,
    absences: list.filter(m => m.absent).length,
    avg: rated.length ? (rated.reduce((t, m) => t + m.rating!, 0) / rated.length).toFixed(1).replace('.', ',') : null,
  };
}

export interface SuspensionRow { id: string; reason: string | null; match: { title: string; starts_at: string; status: string } | null }

/** Activa = pendiente (sin partido) o con un partido que todavía no se jugó (hasta 3 h después de empezar). */
export const activeSuspensions = (rows: SuspensionRow[], now = Date.now()) =>
  rows.filter(x => !x.match || ((x.match.status === 'open' || x.match.status === 'closed')
    && +new Date(x.match.starts_at) > now - 3 * 3600e3));

/** Código para el radar: mayúsculas, solo letras (con Ñ) y números, máx. 3. */
export const cleanCode = (s: string) => plain(s).slice(0, 3);

/**
 * Al guardar una stat de la casa: qué fila mía actualizar (si estoy editando, o ya tengo esa stat aunque con otras
 * mayúsculas) y si choca con otra mía con el mismo nombre. Nunca dos filas mías por stat.
 */
export function customTarget(list: CustomRow[], meId: string, label: string, editingId?: string) {
  const mine = list.filter(c => c.created_by === meId && labelKey(c.label) === labelKey(label));
  const existing = editingId ?? mine[0]?.id;
  return { existing, dup: mine.find(c => c.id !== existing) ?? null };
}

/** Más altas primero. */
export const byValue = (list: CustomRow[]) => [...list].sort((a, b) => b.value - a.value);
