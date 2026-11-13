// Votar después del partido (figura y calificar al equipo): reglas puras, sin Supabase ni Preact.
// Espejo de match_voting_open / vote_mvp / my_pending_votes (supabase/migrations/20261115200000_vote_reminders.sql):
// si cambian allá, cambian acá.

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Un partido que nadie marcó como "jugado" se puede votar desde 2 h después de la hora de inicio... */
export const VOTE_OPENS_AFTER_MS = 2 * HOUR;
/** ...y hasta 7 días después. A los 7 días también cierra la figura de un partido ya marcado como jugado. */
export const VOTE_WINDOW_MS = 7 * DAY;
/** Hasta cuándo la app te pide votar al abrirla. */
export const PROMPT_WINDOW_MS = 3 * DAY;

interface VoteMatch { status: string; starts_at: string }

/** ¿Se puede calificar a los compañeros ahora? Jugado: siempre. Abierto o cerrado (nadie cargó el resultado): de 2 h a 7 días después de la hora de inicio. */
export function ratingOpen(m: VoteMatch, now = Date.now()): boolean {
  if (m.status === 'played') return true;
  if (m.status !== 'open' && m.status !== 'closed') return false;
  const t = Date.parse(m.starts_at);
  return t <= now - VOTE_OPENS_AFTER_MS && t > now - VOTE_WINDOW_MS;
}

/** ¿Se puede votar la figura ahora? Lo mismo, y además la votación cierra a los 7 días aunque el partido esté jugado. */
export function mvpOpen(m: VoteMatch, now = Date.now()): boolean {
  return ratingOpen(m, now) && Date.parse(m.starts_at) >= now - VOTE_WINDOW_MS;
}

/** Cuándo se abre la votación de un partido sin resultado cargado (para refrescar la pantalla justo entonces). */
export const voteOpensAt = (startsAt: string) => Date.parse(startsAt) + VOTE_OPENS_AFTER_MS;

export interface VoteSignup { profile_id: string; status: string; absent: boolean; team: 'A' | 'B' | null }

/**
 * Qué puedo hacer yo en este partido y qué me falta.
 * - canMvp: jugué (anotado, sin ausencia) y la figura está abierta. canRate: además tengo equipo (se califica a los compañeros).
 * - pendingMvp: puedo votar la figura y todavía no lo hice (`mvpReady`: ya se leyó mi voto; si no, no se sabe).
 * - pendingRate: puedo calificar, el partido es de los últimos 7 días y me falta alguno de mis compañeros (`mates`). Calificar sigue abierto después, pero no se reclama.
 */
export function myVoteState(m: VoteMatch, signups: VoteSignup[], meId: string, myMvp: string | null, mvpReady: boolean,
  myRatings: Record<string, number>, now = Date.now()) {
  const mine = signups.find(s => s.profile_id === meId && s.status === 'in' && !s.absent);
  const canMvp = !!mine && mvpOpen(m, now);
  const canRate = !!mine?.team && ratingOpen(m, now);
  const mates = canRate
    ? signups.filter(s => s.status === 'in' && !s.absent && s.team === mine!.team && s.profile_id !== meId).map(s => s.profile_id)
    : [];
  return {
    plays: !!mine, canMvp, canRate, mates,
    pendingMvp: canMvp && mvpReady && !myMvp,
    pendingRate: Date.parse(m.starts_at) >= now - VOTE_WINDOW_MS && mates.some(id => myRatings[id] == null),
  };
}

/** El encabezado del bloque de votar arriba de la pantalla del partido, según lo que falta. */
export function voteHeadline(pendingMvp: boolean, pendingRate: boolean): { icon: string; title: string; text: string } {
  if (pendingMvp && pendingRate) return { icon: '🏆', title: '¡Falta tu voto!', text: 'Elegí a la figura y calificá a tu equipo: son 20 segundos.' };
  if (pendingMvp) return { icon: '🏆', title: '¡Falta tu voto!', text: 'Elegí a la figura del partido: es un toque.' };
  if (pendingRate) return { icon: '⭐', title: 'Falta calificar a tu equipo', text: 'Del 1 al 10, ¿cómo jugó cada uno?' };
  return { icon: '✅', title: '¡Listo, gracias por votar!', text: 'Si te equivocaste, podés cambiar tu voto.' };
}

// ---------- El pedido al abrir la app (VotePrompt) ----------

/** Lo que devuelve la RPC my_pending_votes: un partido donde jugué y no voté la figura. `mates` = compañeros que puedo calificar, `rated` = a cuántos ya califiqué. */
export interface PendingVote {
  match_id: string; community_id: string; slug: string; community_name: string; title: string; starts_at: string;
  status: string; mates: number; rated: number;
}

/** Del servidor vienen los de los últimos 3 días; acá se vuelve a mirar con la hora del celular y se sacan los que el usuario descartó. Más nuevos primero. */
export function promptQueue(rows: PendingVote[], skip: ReadonlySet<string>, now = Date.now()): PendingVote[] {
  return rows
    .filter(r => !skip.has(r.match_id) && mvpOpen(r, now) && Date.parse(r.starts_at) <= now && Date.parse(r.starts_at) > now - PROMPT_WINDOW_MS)
    .sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at));
}

/** ¿Le falta calificar a algún compañero? */
export const ratingsLeft = (p: Pick<PendingVote, 'mates' | 'rated'>) => Math.max(0, p.mates - p.rated);

// ---------- "Después" y "No jugué": qué partidos no volver a pedir ----------

/** "Después": solo hasta cerrar la pestaña (sessionStorage). */
export const LATER_KEY = 'fr-vote-later';
/** "No jugué este partido": para siempre en este navegador (localStorage), hasta 30 partidos. */
export const SKIP_KEY = 'fr-vote-skip';
const MAX_IDS = 30;

/** Lo mínimo de sessionStorage / localStorage que se usa (se puede probar con un objeto cualquiera). */
export interface Store { getItem(k: string): string | null; setItem(k: string, v: string): void }

/** Los ids guardados bajo `key`; sin storage, con storage roto o con datos raros: lista vacía. */
export function readIds(store: Store | null, key: string): string[] {
  try {
    const v = JSON.parse(store?.getItem(key) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch { return []; }
}

/** Suma un id (sin repetir y sin pasar del tope: los más viejos se van). Si no se puede guardar, no pasa nada. */
export function addId(store: Store | null, key: string, id: string) {
  try {
    const ids = readIds(store, key).filter(x => x !== id);
    store?.setItem(key, JSON.stringify([...ids, id].slice(-MAX_IDS)));
  } catch { /* sin storage: el aviso vuelve la próxima vez, no es grave */ }
}
