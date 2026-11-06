// Chat: tipos y reglas puras (sin Supabase ni Preact). Las encuestas tienen las suyas en polls.ts.

/** id < 0 + tmp = mensaje local todavía no confirmado por el servidor. */
export interface Msg {
  id: number; author_id: string; body: string; created_at: string;
  reply_to?: number | null; image_url?: string | null;
  tmp?: string; status?: 'sending' | 'failed';
}
/** reacciones[mensaje][perfil] = emoji */
export type Reacts = Record<number, Record<string, string>>;
export interface RxRow { message_id: number; profile_id: string; emoji: string }

/** Mensajes por página. */
export const PAGE = 50;
/** Largo máximo de un mensaje. */
export const MAX = 500;
/** Cuánto dura el "escribiendo…" sin otro aviso. */
export const TYPING_MS = 3500;
/** Autor que ya no es miembro. */
export const GONE = { name: 'Ex miembro', photo_url: null };

/** Último mensaje visto por comunidad (para el contador de no leídos de la pestaña). */
export const seenKey = (communityId: string) => `futrank-seen-${communityId}`;

export const hhmm = (d: Date) => d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** "Hoy", "Ayer" o la fecha larga (con año solo si no es este). */
export function dayLabel(d: Date, today = new Date()) {
  const yest = new Date(today);
  yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Hoy';
  if (d.toDateString() === yest.toDateString()) return 'Ayer';
  return d.toLocaleDateString('es-AR', {
    weekday: 'long', day: 'numeric', month: 'long',
    ...(d.getFullYear() === today.getFullYear() ? {} : { year: 'numeric' }),
  });
}

/** Separa el texto en [texto, link, texto, link, …]: los índices impares son links. */
export const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g;
export const splitLinks = (s: string) => s.split(URL_RE);

/** Traduce los errores del servidor a un mensaje para el usuario. */
export const chatError = (m: string) =>
  m.includes('row-level security') ? 'No tenés permiso para hacer eso (¿seguís siendo miembro?).'
  : m.includes('Failed to fetch') || m.includes('NetworkError') ? 'Sin conexión. Probá de nuevo.'
  : m.includes('Bucket not found') || m.includes('image_url') || m.includes('reply_to') ? 'Las fotos y respuestas todavía no están habilitadas (falta actualizar la base).'
  : m.includes('does not exist') ? 'El chat todavía no está habilitado en esta comunidad.'
  : m.includes('exceeded the maximum allowed size') || m.includes('Payload too large') ? 'La foto es muy pesada (máximo 5 MB).'
  : m;

/** Resumen de un mensaje para citarlo. */
export const snippet = (m: Pick<Msg, 'body' | 'image_url'>) => m.body.trim() ? m.body.trim().slice(0, 90) : m.image_url ? '📷 Foto' : '';

/** Une mensajes por id, ordena por fecha y deja los pendientes (locales) al final. */
export function merge(prev: Msg[], incoming: Msg[]) {
  const byId = new Map<number, Msg>();
  for (const m of prev) if (m.id > 0) byId.set(m.id, m);
  for (const m of incoming) byId.set(m.id, m);
  const real = [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id);
  return [...real, ...prev.filter(m => m.id < 0)];
}

/** Agrupa por día (en hora local), en el orden en que vienen. */
export function byDay(msgs: Msg[]) {
  const days: { key: string; date: Date; items: Msg[] }[] = [];
  for (const m of msgs) {
    const d = new Date(m.created_at), key = d.toDateString();
    if (days[days.length - 1]?.key !== key) days.push({ key, date: d, items: [] });
    days[days.length - 1].items.push(m);
  }
  return days;
}

/** Ruta dentro del bucket "chat" a partir del link público de la foto (o null si no es de ahí). */
export function photoPath(url: string | null | undefined) {
  const path = url?.split('/object/public/chat/')[1]?.split('?')[0];
  return path ? decodeURIComponent(path) : null;
}

/** Pone (o con emoji null, saca) la reacción de un perfil en un mensaje. */
export function withReaction(r: Reacts, messageId: number, profileId: string, emoji: string | null): Reacts {
  const cur = { ...r[messageId] };
  if (emoji) cur[profileId] = emoji; else delete cur[profileId];
  return { ...r, [messageId]: cur };
}

/** Reemplaza las reacciones de esos mensajes por las filas del servidor. */
export function replaceReacts(prev: Reacts, ids: number[], rows: RxRow[]): Reacts {
  const next = { ...prev };
  for (const id of ids) delete next[id];
  for (const r of rows) next[r.message_id] = { ...next[r.message_id], [r.profile_id]: r.emoji };
  return next;
}

/** Cuántas veces aparece cada emoji, en el orden en que aparecieron. */
export function reactionCounts(byProfile: Record<string, string> | undefined) {
  const rx = Object.values(byProfile ?? {});
  return [...new Set(rx)].map(e => [e, rx.filter(x => x === e).length] as const);
}
