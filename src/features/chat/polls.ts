// Encuestas del chat: lógica pura (sin Supabase) para poder testearla.

export const POLL_MIN_OPTIONS = 2;
export const POLL_MAX_OPTIONS = 8;
export const POLL_MAX_QUESTION = 140;
export const POLL_MAX_OPTION = 60;

export interface Poll {
  id: string; message_id: number; question: string; options: string[]; multi: boolean;
  community_id?: string; created_by?: string | null; created_at?: string;
}
/** Una fila de poll_votes (la clave es poll_id + profile_id + option). */
export interface PollVote { poll_id: string; profile_id: string; option: number }
/** votos[encuesta][perfil] = opciones elegidas (ordenadas, sin repetir) */
export type Votes = Record<string, Record<string, number[]>>;

const sortedSet = (a: number[]) => [...new Set(a)].sort((x, y) => x - y);

/** Agrupa las filas de la base en el mapa encuesta → perfil → opciones. */
export function groupVotes(rows: PollVote[]): Votes {
  const out: Votes = {};
  for (const r of rows) {
    const poll = (out[r.poll_id] ??= {});
    poll[r.profile_id] = sortedSet([...(poll[r.profile_id] ?? []), Number(r.option)]);
  }
  return out;
}

/**
 * Reemplaza los votos de `pollIds` por lo que dice el servidor (`rows`), salvo los de `skip`
 * (encuestas con un voto mío todavía en vuelo: no hay que pisar lo optimista).
 */
export function replaceVotes(prev: Votes, pollIds: string[], rows: PollVote[], skip?: ReadonlySet<string>): Votes {
  const fresh = groupVotes(rows.filter(r => pollIds.includes(r.poll_id)));
  const next = { ...prev };
  for (const id of pollIds) {
    if (skip?.has(id)) continue;
    if (fresh[id]) next[id] = fresh[id]; else delete next[id];
  }
  return next;
}

/** Llega un voto (INSERT en vivo). Idempotente. */
export function addVote(prev: Votes, r: PollVote): Votes {
  const cur = prev[r.poll_id]?.[r.profile_id] ?? [];
  const opt = Number(r.option);
  if (cur.includes(opt)) return prev;
  return { ...prev, [r.poll_id]: { ...prev[r.poll_id], [r.profile_id]: sortedSet([...cur, opt]) } };
}

/** Se borra un voto (DELETE en vivo: solo trae la clave poll_id + profile_id + option). Idempotente. */
export function removeVote(prev: Votes, r: PollVote): Votes {
  const cur = prev[r.poll_id]?.[r.profile_id];
  const opt = Number(r.option);
  if (!cur?.includes(opt)) return prev;
  const left = cur.filter(o => o !== opt);
  const { [r.profile_id]: _, ...others } = prev[r.poll_id];
  return { ...prev, [r.poll_id]: left.length ? { ...others, [r.profile_id]: left } : others };
}

/** Pisa los votos de un perfil en una encuesta (lista vacía = sacarlos). */
export function setMine(prev: Votes, pollId: string, profileId: string, options: number[]): Votes {
  const { [profileId]: _, ...others } = prev[pollId] ?? {};
  return { ...prev, [pollId]: options.length ? { ...others, [profileId]: sortedSet(options) } : others };
}

/**
 * Lo que queda elegido al tocar `option`:
 * varias respuestas → se prende/apaga esa opción; una sola → pasa el voto ahí (y tocar la misma lo saca).
 */
export function toggleChoice(current: number[], option: number, multi: boolean): number[] {
  const has = current.includes(option);
  if (multi) return sortedSet(has ? current.filter(o => o !== option) : [...current, option]);
  return has ? [] : [option];
}

export interface Tally {
  /** Personas que votaron. */
  voters: number;
  /** Votos por opción. */
  counts: number[];
  /** Quiénes votaron cada opción (en el orden en que quedaron cargados). */
  by: string[][];
  /** 0–100 por opción, sobre las personas que votaron (en varias respuestas el total puede pasar de 100). */
  pct: number[];
}

export function tally(poll: Pick<Poll, 'options'>, byProfile: Record<string, number[]> | undefined): Tally {
  const by: string[][] = poll.options.map(() => []);
  let voters = 0;
  for (const [pid, opts] of Object.entries(byProfile ?? {})) {
    let any = false;
    for (const o of opts) if (by[o]) { by[o].push(pid); any = true; }
    if (any) voters++;
  }
  const counts = by.map(b => b.length);
  const pct = counts.map(c => (voters ? Math.round((c / voters) * 100) : 0));
  return { voters, counts, by, pct };
}

export const votesLabel = (n: number) => (n === 1 ? '1 voto' : `${n} votos`);

/** Texto corto para citar/responder una encuesta. */
export const pollSnippet = (question: string, max = 90) => `📊 ${question.trim()}`.slice(0, max);

export interface PollForm { ok: boolean; question: string; options: string[]; hint: string }

/** Valida el formulario con las mismas reglas que create_poll (más: sin opciones repetidas). */
export function validatePoll(question: string, options: string[]): PollForm {
  const q = question.trim();
  const opts = options.map(o => o.trim()).filter(Boolean);
  const dup = new Set(opts.map(o => o.toLowerCase())).size !== opts.length;
  const hint = dup ? 'Hay opciones repetidas.' : '';
  const ok = q.length >= 1 && q.length <= POLL_MAX_QUESTION
    && opts.length >= POLL_MIN_OPTIONS && opts.length <= POLL_MAX_OPTIONS
    && opts.every(o => o.length <= POLL_MAX_OPTION) && !dup;
  return { ok, question: q, options: opts, hint };
}

/** Errores de create_poll / vote_poll en castellano. Si no lo reconoce, devuelve el mensaje tal cual. */
export function pollError(m: string): string {
  if (m.includes('bad_options')) return `Poné entre ${POLL_MIN_OPTIONS} y ${POLL_MAX_OPTIONS} opciones (máximo ${POLL_MAX_OPTION} letras cada una).`;
  if (m.includes('bad_question')) return `La pregunta tiene que tener entre 1 y ${POLL_MAX_QUESTION} letras.`;
  if (m.includes('single_choice')) return 'Esta encuesta es de una sola respuesta.';
  if (m.includes('bad_option')) return 'Esa opción ya no existe.';
  if (m.includes('forbidden')) return 'No tenés permiso para hacer eso (¿seguís siendo miembro?).';
  if (m.includes('schema cache') || m.includes('does not exist')) return 'Las encuestas todavía no están habilitadas (falta actualizar la base).';
  return m;
}
