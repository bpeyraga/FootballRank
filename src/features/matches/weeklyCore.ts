// Resumen de la semana de una comunidad: lógica pura. SIN imports: la usan la app (tarjeta "Resumen de la semana" de
// Partidos) y la Edge Function `push` (el aviso del lunes), que lleva una copia EXACTA de este archivo entre los
// marcadores BEGIN/END SHARED (una Edge Function no puede importar de src; el deploy sube un solo archivo).
// `npm test` verifica que la copia siga igual: si editás esto, pegalo también en supabase/functions/push/index.ts.

/** Ventana del resumen: los partidos jugados en los últimos 7 días. */
export const WEEK_DAYS = 7;
/** Largo máximo del texto del aviso (los celulares cortan lo que sobra). */
export const WEEK_BODY_MAX = 120;

export interface WeekMatch { id: string; score_a: number | null; score_b: number | null }
export interface WeekEvent { match_id: string; profile_id: string; kind: string }
/** Votos de figura que recibió un jugador en un partido. */
export interface WeekVote { match_id: string; profile_id: string; votes: number }
/** El que lidera una cuenta; si hay empate, todos los empatados. */
export interface WeekTop { ids: string[]; n: number }
export interface WeekSummary {
  played: number;
  /** "3–2", en el orden en que vinieron los partidos; solo si todos tienen resultado. */
  results: string[];
  scorers: WeekTop | null;
  assisters: WeekTop | null;
  /** Figura de la semana: el que fue figura en más partidos (n); desempata por votos recibidos. */
  mvp: WeekTop | null;
}

/** Junta votos sueltos (uno por votante) en votos por partido y jugador. */
export function tallyVotes(votes: { match_id: string; target_id: string }[]): WeekVote[] {
  const m = new Map<string, WeekVote>();
  for (const v of votes) {
    const k = `${v.match_id}|${v.target_id}`;
    const x = m.get(k);
    if (x) x.votes++; else m.set(k, { match_id: v.match_id, profile_id: v.target_id, votes: 1 });
  }
  return [...m.values()];
}

/** Los que tienen el mayor valor (mayor que cero); todos si empatan. */
function leaders(counts: Map<string, [number, number]>): WeekTop | null {
  let best: [number, number] | null = null;
  for (const c of counts.values()) {
    if (c[0] <= 0) continue;
    if (!best || c[0] > best[0] || (c[0] === best[0] && c[1] > best[1])) best = c;
  }
  if (!best) return null;
  const b = best;
  return { ids: [...counts].filter(([, c]) => c[0] === b[0] && c[1] === b[1]).map(([id]) => id), n: b[0] };
}

/**
 * Goleador, asistidor y figura de los partidos dados. Cuenta solo eventos y votos de esos partidos.
 * Figura de un partido = el más votado (empate: los dos, igual que el ranking de figuras).
 */
export function weekSummary(matches: WeekMatch[], events: WeekEvent[], votes: WeekVote[]): WeekSummary {
  const ids = new Set(matches.map(m => m.id));
  const count = (kind: string) => {
    const c = new Map<string, [number, number]>();
    for (const e of events) if (e.kind === kind && ids.has(e.match_id)) c.set(e.profile_id, [(c.get(e.profile_id)?.[0] ?? 0) + 1, 0]);
    return leaders(c);
  };

  const perMatch = new Map<string, WeekVote[]>();
  for (const v of votes) if (ids.has(v.match_id) && v.votes > 0) perMatch.set(v.match_id, [...(perMatch.get(v.match_id) ?? []), v]);
  const wins = new Map<string, [number, number]>(); // [partidos en que fue figura, votos recibidos]
  for (const vs of perMatch.values()) {
    const max = Math.max(...vs.map(v => v.votes));
    for (const v of vs) {
      const w = wins.get(v.profile_id) ?? [0, 0];
      wins.set(v.profile_id, [w[0] + (v.votes === max ? 1 : 0), w[1] + v.votes]);
    }
  }

  const scored = matches.filter(m => m.score_a != null && m.score_b != null);
  return {
    played: matches.length,
    results: scored.length === matches.length ? scored.map(m => `${m.score_a}–${m.score_b}`) : [],
    scorers: count('goal'),
    assisters: count('assist'),
    mvp: leaders(wins),
  };
}

/** "A", "A y B", "A, B y 1 más". */
export function listNames(names: string[]): string {
  if (names.length <= 2) return names.join(' y ');
  return `${names.slice(0, 2).join(', ')} y ${names.length - 2} más`;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const sorted = (ids: string[], nameOf: (id: string) => string) => ids.map(nameOf).sort((a, b) => a.localeCompare(b, 'es'));

/** Las partes del resumen, cada una con su emoji ("⚽ Goleador: Benja (4)"); lo que no hubo no aparece. */
export function weekParts(s: WeekSummary, nameOf: (id: string) => string, opts: { results?: boolean; assists?: boolean } = {}): string[] {
  const out = [plural(s.played, 'partido', 'partidos') + (opts.results !== false && s.results.length && s.results.length <= 3 ? ` (${s.results.join(', ')})` : '')];
  if (s.scorers) out.push(`⚽ ${s.scorers.ids.length > 1 ? 'Goleadores' : 'Goleador'}: ${listNames(sorted(s.scorers.ids, nameOf))} (${s.scorers.n})`);
  if (opts.assists !== false && s.assisters) out.push(`🎯 ${s.assisters.ids.length > 1 ? 'Asistidores' : 'Asistidor'}: ${listNames(sorted(s.assisters.ids, nameOf))} (${s.assisters.n})`);
  if (s.mvp) out.push(`⭐ Figura${s.mvp.ids.length > 1 ? 's' : ''}: ${listNames(sorted(s.mvp.ids, nameOf))}${s.mvp.n > 1 ? ` (${s.mvp.n} veces)` : ''}`);
  return out;
}

/** El aviso del lunes (título y texto de hasta WEEK_BODY_MAX); null si no se jugó nada. */
export function weekNote(s: WeekSummary, nameOf: (id: string) => string, community: string): { title: string; body: string } | null {
  if (s.played < 1) return null;
  // Si no entra, se van sacando primero las asistencias y después los resultados.
  const tries = [{}, { assists: false }, { assists: false, results: false }].map(o => weekParts(s, nameOf, o));
  let body = (tries.find(p => p.join(' · ').length <= WEEK_BODY_MAX) ?? tries[tries.length - 1]).join(' · ');
  if (tries[0].length === 1) body = `${tries[0][0]}. Mirá cómo quedó el ranking.`; // sin goles ni figura: que el aviso tenga un motivo para abrirse
  if (body.length > WEEK_BODY_MAX) body = `${body.slice(0, WEEK_BODY_MAX - 1).trimEnd()}…`;
  return { title: `📊 La semana en ${community}`.slice(0, 60), body };
}
