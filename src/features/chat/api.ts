// Chat: la única puerta a la base (consultas, fotos y canal en vivo). Todas tiran Error con el mensaje del servidor.
import { must, sb } from '../../shared/supabase';
import { PAGE, photoPath, type Msg, type RxRow } from './model';
import type { Poll, PollVote } from './polls';

// ---------- Mensajes ----------

/** Una página de mensajes (los más nuevos antes de `before`), de más viejo a más nuevo. */
export async function fetchMessages(communityId: string, before?: string): Promise<Msg[]> {
  let q = sb.from('messages').select('*').eq('community_id', communityId)
    .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(PAGE);
  if (before) q = q.lt('created_at', before);
  return ((must(await q) ?? []) as Msg[]).reverse();
}

export async function loadMessage(id: number): Promise<Msg | null> {
  return must(await sb.from('messages').select('*').eq('id', id).maybeSingle()) as Msg | null;
}

/** Achica la foto a 1280 px de lado mayor (JPEG); los GIF se suben tal cual para no perder la animación. */
async function shrink(file: File): Promise<{ blob: Blob; ext: string; type: string }> {
  if (file.type === 'image/gif') return { blob: file, ext: 'gif', type: 'image/gif' };
  const img = await createImageBitmap(file);
  const k = Math.min(1, 1280 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise<Blob>((ok, ko) =>
    c.toBlob(b => (b ? ok(b) : ko(new Error('No se pudo procesar la foto'))), 'image/jpeg', 0.82));
  return { blob, ext: 'jpg', type: 'image/jpeg' };
}

/** Sube la foto (si hay) y guarda el mensaje. Devuelve el mensaje tal como quedó en la base. */
export async function sendMessage(communityId: string, meId: string, body: string, reply: number | null, file?: File): Promise<Msg> {
  let image_url: string | null = null;
  if (file) {
    const { blob, ext, type } = await shrink(file);
    const path = `${communityId}/${meId}/${crypto.randomUUID()}.${ext}`;
    must(await sb.storage.from('chat').upload(path, blob, { contentType: type }));
    image_url = sb.storage.from('chat').getPublicUrl(path).data.publicUrl;
  }
  const row: Record<string, unknown> = { community_id: communityId, author_id: meId, body };
  if (reply) row.reply_to = reply;
  if (image_url) row.image_url = image_url;
  return must(await sb.from('messages').insert(row).select('*').single()) as Msg;
}

/** Borra el mensaje (y su foto, si tenía). Devuelve false si no se borró nada (sin permiso). */
export async function deleteMessage(id: number, imageUrl?: string | null): Promise<boolean> {
  const gone = !!must(await sb.from('messages').delete().eq('id', id).select('id'))?.length;
  // La foto también se borra del almacenamiento (si no, quedaba accesible por su link)
  const path = gone ? photoPath(imageUrl) : null;
  if (path) sb.storage.from('chat').remove([path]).catch(() => {});
  return gone;
}

// ---------- Reacciones ----------

export async function loadReactions(messageIds: number[]): Promise<RxRow[]> {
  return (must(await sb.from('message_reactions').select('message_id,profile_id,emoji').in('message_id', messageIds)) ?? []) as RxRow[];
}

/** Pone mi reacción en un mensaje; con emoji null la saca. */
export async function setReaction(communityId: string, meId: string, messageId: number, emoji: string | null) {
  must(emoji
    ? await sb.from('message_reactions').upsert({ message_id: messageId, profile_id: meId, community_id: communityId, emoji })
    : await sb.from('message_reactions').delete().eq('message_id', messageId).eq('profile_id', meId));
}

// ---------- Encuestas ----------

/** Las encuestas de esos mensajes (los mensajes comunes no tienen fila en `polls`). */
export async function loadPolls(messageIds: number[]): Promise<Poll[]> {
  return (must(await sb.from('polls').select('*').in('message_id', messageIds)) ?? []) as Poll[];
}
export async function loadPollVotes(pollIds: string[]): Promise<PollVote[]> {
  return (must(await sb.from('poll_votes').select('poll_id,profile_id,option').in('poll_id', pollIds)) ?? []) as PollVote[];
}
export async function votePoll(pollId: string, options: number[]) {
  must(await sb.rpc('vote_poll', { p_poll: pollId, p_options: options }));
}
/** Crea la encuesta (con su mensaje) y devuelve el id del mensaje. */
export async function createPoll(communityId: string, question: string, options: string[], multi: boolean): Promise<number> {
  return Number(must(await sb.rpc('create_poll', { p_community: communityId, p_question: question, p_options: options, p_multi: multi })));
}

// ---------- En vivo ----------

export interface ChatEvents {
  online: (n: number) => void;
  typing: (profileId: string) => void;
  message: (m: Msg) => void;
  messageGone: (id: number) => void;
  poll: (p: Poll) => void;
  pollVote: (v: PollVote) => void;
  /** Alguien votó: hay que releer los votos de esa encuesta. */
  pollChanged: (pollId: string) => void;
  reaction: (r: RxRow) => void;
  reactionGone: (messageId: number, profileId: string) => void;
  /** Conectado; `again` = es una reconexión (puede haberse perdido algo mientras tanto). */
  connected: (again: boolean) => void;
}
export interface ChatChannel { send: (event: 'typing' | 'poll', payload: Record<string, unknown>) => void; close: () => void }

/** Un solo canal: mensajes, encuestas y reacciones (tablas), presencia (en línea) y broadcast ("escribiendo…", votos). */
export function openChatChannel(communityId: string, meId: string, on: ChatEvents): ChatChannel {
  const mine = `community_id=eq.${communityId}`;
  let connected = false;
  const ch = sb.channel(`chat-${communityId}`, { config: { presence: { key: meId }, broadcast: { self: false } } })
    .on('presence', { event: 'sync' }, () => on.online(Object.keys(ch.presenceState()).length))
    .on('broadcast', { event: 'typing' }, ({ payload }) => {
      const id = (payload as { id?: string })?.id;
      if (id && id !== meId) on.typing(id);
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: mine }, p => on.message(p.new as Msg))
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, p => {
      const id = (p.old as { id?: number }).id;
      if (id) on.messageGone(id);
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'polls', filter: mine }, p => on.poll(p.new as Poll))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'poll_votes', filter: mine }, p => on.pollVote(p.new as PollVote))
    // Los DELETE de votos no se pueden filtrar por comunidad (llegarían los de toda la app): en su lugar,
    // quien vota avisa por broadcast en este canal y los demás releen los votos de esa encuesta.
    .on('broadcast', { event: 'poll' }, ({ payload }) => { if (payload?.id) on.pollChanged(payload.id); })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_reactions', filter: mine }, p => on.reaction(p.new as RxRow))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'message_reactions', filter: mine }, p => on.reaction(p.new as RxRow))
    // Los DELETE solo traen la clave (message_id, profile_id): no se pueden filtrar por comunidad.
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'message_reactions' }, p => {
      const o = p.old as { message_id?: number; profile_id?: string };
      if (o.message_id && o.profile_id) on.reactionGone(o.message_id, o.profile_id);
    })
    .subscribe(status => {
      if (status !== 'SUBSCRIBED') return;
      ch.track({ at: Date.now() }).catch(() => {});
      on.connected(connected);
      connected = true;
    });
  return {
    send: (event, payload) => { ch.send({ type: 'broadcast', event, payload }).catch(() => {}); },
    close: () => { sb.removeChannel(ch); },
  };
}
