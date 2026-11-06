// Estado y acciones del chat (el "controlador"): mensajes, reacciones, encuestas, en línea y "escribiendo…".
// ChatPage solo dibuja y maneja el scroll; este hook le avisa por `scroll` cuándo bajar o contar no leídos.
import { useEffect, useRef, useState } from 'preact/hooks';
import * as api from './api';
import { PAGE, TYPING_MS, chatError, merge, replaceReacts, withReaction, type Msg, type Reacts } from './model';
import { addVote, pollError, removeVote, replaceVotes, setMine, toggleChoice, type Poll, type PollVote, type Votes } from './polls';

/** Lo que el chat necesita saber y pedirle al scroll de la pantalla. */
export interface ChatScroll {
  /** ¿Está mirando lo último? */
  nearBottom: () => boolean;
  /** Bajar al final en el próximo render. */
  stick: () => void;
  /** Mantener la posición en el próximo render (se agregan mensajes arriba). */
  keep: () => void;
  /** Llegaron n mensajes que no se están viendo. */
  unseen: (n: number) => void;
}

const msgOf = (e: unknown, fallback: string) => (e as { message?: string })?.message || fallback;

export function useChat(communityId: string, meId: string, scroll: ChatScroll) {
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [reacts, setReacts] = useState<Reacts>({});
  const [reactOk, setReactOk] = useState(true);   // false si la tabla de reacciones todavía no existe
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState('');
  const [online, setOnline] = useState(0);
  const [polls, setPolls] = useState<Record<number, Poll>>({});   // encuesta por id de mensaje
  const [votes, setVotes] = useState<Votes>({});
  const [typing, setTyping] = useState<Record<string, number>>({}); // autor → último "escribiendo"
  const chRef = useRef<api.ChatChannel | null>(null);
  const lastTyping = useRef(0);
  const msgsRef = useRef<Msg[] | null>(null);
  msgsRef.current = msgs;
  const scrollRef = useRef(scroll);
  scrollRef.current = scroll;
  const files = useRef(new Map<string, File>());   // fotos de mensajes pendientes (para reintentar)
  const pollsRef = useRef(polls);
  pollsRef.current = polls;
  const votesRef = useRef<Votes>({});              // siempre al día (los toques seguidos parten de lo último)
  const pending = useRef(new Map<string, number>());       // votos míos en vuelo, por encuesta
  const voteChain = useRef(new Map<string, Promise<void>>()); // los votos de una encuesta salen de a uno, en orden
  const mineAt = useRef(new Map<string, number>());        // último voto mío por encuesta
  const live = useRef<{ add: boolean; row: PollVote }[]>([]); // votos que llegan en vivo, juntados de a poco
  const liveTimer = useRef(0);

  const loadReacts = async (ids: number[]) => {
    if (!ids.length) return;
    try {
      const rows = await api.loadReactions(ids);
      setReacts(prev => replaceReacts(prev, ids, rows));
    } catch { setReactOk(false); }
  };

  // ---- Encuestas ----
  const commitVotes = (fn: (v: Votes) => Votes) => {
    const next = fn(votesRef.current);
    if (next === votesRef.current) return;
    votesRef.current = next;
    setVotes(next);
  };
  /** Con un voto mío en vuelo (o recién hecho) lo que está en pantalla manda: no se pisa con datos viejos del servidor. */
  const holdPoll = (id: string, recent = true) =>
    (pending.current.get(id) ?? 0) > 0 || (recent && Date.now() - (mineAt.current.get(id) ?? 0) < 4000);
  const dropPoll = (messageId: number) =>
    setPolls(prev => { if (!(messageId in prev)) return prev; const { [messageId]: _, ...rest } = prev; return rest; });

  /** Los votos de esas encuestas, tal cual están en el servidor. false si no se pudo traer. */
  const loadVotes = async (pollIds: string[], force = false) => {
    if (!pollIds.length) return true;
    let rows: PollVote[];
    try { rows = await api.loadPollVotes(pollIds); } catch { return false; }
    const skip = new Set(pollIds.filter(id => holdPoll(id, !force)));
    commitVotes(v => replaceVotes(v, pollIds, rows, skip));
    return true;
  };
  /** Encuestas (y sus votos) de esos mensajes. */
  const loadPolls = async (messageIds: number[]) => {
    if (!messageIds.length) return;
    const ps = await api.loadPolls(messageIds).catch(() => [] as Poll[]);
    if (!ps.length) return;
    setPolls(prev => { const next = { ...prev }; for (const p of ps) next[p.message_id] = p; return next; });
    await loadVotes(ps.map(p => p.id));
  };

  /** Votos en vivo: se juntan unos 150 ms y se aplican de una vez (el servidor reemplaza votos borrando y volviendo a insertar). */
  const queueVote = (add: boolean, row: PollVote | undefined) => {
    if (!row?.poll_id || !row.profile_id || row.option == null) return;
    live.current.push({ add, row });
    if (liveTimer.current) return;
    liveTimer.current = window.setTimeout(() => {
      liveTimer.current = 0;
      const evs = live.current;
      live.current = [];
      // Mis propios votos ya están en pantalla (optimista): sus ecos no hacen falta ni deben parpadear.
      commitVotes(v => evs.reduce((acc, e) =>
        e.row.profile_id === meId && holdPoll(e.row.poll_id) ? acc : e.add ? addVote(acc, e.row) : removeVote(acc, e.row), v));
    }, 150);
  };

  /** Tocar una opción: se ve al instante y se manda; si falla, vuelve a lo que dice el servidor. */
  const vote = (poll: Poll, option: number) => {
    const before = votesRef.current[poll.id]?.[meId] ?? [];
    const next = toggleChoice(before, option, poll.multi);
    setErr('');
    mineAt.current.set(poll.id, Date.now());
    pending.current.set(poll.id, (pending.current.get(poll.id) ?? 0) + 1);
    commitVotes(v => setMine(v, poll.id, meId, next));
    const run = async () => {
      let failed = '';
      try { await api.votePoll(poll.id, next); } catch (e) { failed = msgOf(e, 'Sin conexión. Probá de nuevo.'); }
      mineAt.current.set(poll.id, Date.now());
      const left = Math.max(0, (pending.current.get(poll.id) ?? 1) - 1);
      pending.current.set(poll.id, left);
      if (!failed) { chRef.current?.send('poll', { id: poll.id }); return; }
      setErr(chatError(pollError(failed)));
      if (left === 0 && !(await loadVotes([poll.id], true)) && !holdPoll(poll.id, false)) commitVotes(v => setMine(v, poll.id, meId, before));
    };
    voteChain.current.set(poll.id, (voteChain.current.get(poll.id) ?? Promise.resolve()).then(run));
  };

  /** Crea la encuesta y la trae enseguida; el INSERT en vivo del mensaje se une por id sin duplicar. Tira Error ya traducido. */
  const createPoll = async (question: string, options: string[], multi: boolean) => {
    let id: number;
    try { id = await api.createPoll(communityId, question, options, multi); }
    catch (e) { throw new Error(chatError(pollError(msgOf(e, 'Sin conexión. Probá de nuevo.')))); }
    try {
      scrollRef.current.stick();
      const [row] = await Promise.all([api.loadMessage(id), loadPolls([id])]);
      if (row) setMsgs(prev => merge(prev ?? [], [row]));
    } catch { /* ya se creó: llega por el canal en vivo */ }
  };

  /** Libera la foto local (blob:) de un mensaje pendiente. */
  const revoke = (m?: Msg) => { if (m?.image_url?.startsWith('blob:')) URL.revokeObjectURL(m.image_url); };
  useEffect(() => () => { msgsRef.current?.forEach(revoke); }, []);

  /** `withPolls`: esperar las encuestas antes de devolver (al cargar anteriores, para que no se corra el scroll). */
  const fetchPage = async (before?: string, withPolls = false) => {
    let got: Msg[];
    try { got = await api.fetchMessages(communityId, before); }
    catch (e) { setErr(chatError(msgOf(e, 'Error de red'))); return null; }
    const ids = got.map(m => m.id);
    loadReacts(ids);
    if (withPolls) await loadPolls(ids); else loadPolls(ids);
    return got;
  };

  useEffect(() => {
    let alive = true;
    // Carga inicial y, cada vez que el canal (re)conecta, se trae lo último y se une por id:
    // así no se pierde nada de lo que llegó mientras el celu estaba en segundo plano.
    const sync = async (first: boolean) => {
      const got = await fetchPage();
      if (!alive || !got) return;
      if (first) setMore(got.length === PAGE);
      const fresh = got.filter(g => !msgsRef.current?.some(x => x.id === g.id)).length;
      if (first || scrollRef.current.nearBottom()) scrollRef.current.stick(); else if (fresh) scrollRef.current.unseen(fresh);
      setMsgs(prev => merge(prev ?? [], got));
      if (!first) {
        // Al reconectar, también se refrescan los votos de encuestas más viejas que ya están cargadas.
        const inPage = new Set(got.map(g => g.id));
        const rest = Object.values(pollsRef.current).filter(p => !inPage.has(p.message_id)).map(p => p.id);
        if (rest.length) loadVotes(rest);
      }
    };
    sync(true);
    chRef.current = api.openChatChannel(communityId, meId, {
      online: setOnline,
      typing: id => setTyping(t => ({ ...t, [id]: Date.now() })),
      message: m => {
        const cur = msgsRef.current ?? [];
        if (cur.some(x => x.id === m.id)) return;
        // Mío y todavía esperando la respuesta del insert: lo reemplaza post().
        if (m.author_id === meId && cur.some(x => x.status === 'sending' && x.body === m.body)) return;
        if (m.author_id === meId || scrollRef.current.nearBottom()) scrollRef.current.stick(); else scrollRef.current.unseen(1);
        setTyping(t => { if (!(m.author_id in t)) return t; const { [m.author_id]: _, ...rest } = t; return rest; });
        setMsgs(prev => merge(prev ?? [], [m]));
      },
      messageGone: id => {
        setMsgs(prev => prev && prev.filter(x => x.id !== id));
        dropPoll(id); // la encuesta se borra en cascada en la base
      },
      poll: row => {
        // Si las opciones no vinieron como lista, se pide la fila por la API.
        if (!Array.isArray(row.options)) { loadPolls([row.message_id]); return; }
        setPolls(prev => ({ ...prev, [row.message_id]: row }));
      },
      pollVote: row => queueVote(true, row),
      pollChanged: id => { loadVotes([id], true); },
      reaction: r => setReacts(prev => withReaction(prev, r.message_id, r.profile_id, r.emoji)),
      reactionGone: (mid, pid) => setReacts(prev => prev[mid]?.[pid] ? withReaction(prev, mid, pid, null) : prev),
      connected: again => { if (again) sync(false); }, // reconexión
    });
    return () => {
      alive = false; chRef.current?.close(); chRef.current = null;
      clearTimeout(liveTimer.current); liveTimer.current = 0;
    };
  }, [communityId]);

  // "Escribiendo…" se apaga solo si el otro deja de tipear
  const typingIds = Object.keys(typing);
  useEffect(() => {
    if (!typingIds.length) return;
    const t = setInterval(() => setTyping(cur => {
      const now = Date.now();
      const left = Object.entries(cur).filter(([, at]) => now - at < TYPING_MS);
      return left.length === Object.keys(cur).length ? cur : Object.fromEntries(left);
    }), 1000);
    return () => clearInterval(t);
  }, [typingIds.length > 0]);

  const loadOlder = async () => {
    const first = msgs?.find(m => m.id > 0);
    if (!first || loadingMore) return;
    setLoadingMore(true);
    const got = await fetchPage(first.created_at, true);
    setLoadingMore(false);
    if (!got) return;
    setMore(got.length === PAGE);
    if (got.length) { scrollRef.current.keep(); setMsgs(prev => merge(prev ?? [], got)); }
  };

  const post = async (tmp: string, body: string, reply: number | null) => {
    try {
      const saved = await api.sendMessage(communityId, meId, body, reply, files.current.get(tmp));
      files.current.delete(tmp);
      revoke(msgsRef.current?.find(m => m.tmp === tmp));
      setMsgs(prev => prev && merge(prev.filter(m => m.tmp !== tmp), [saved]));
    } catch (e) {
      setErr(chatError(msgOf(e, 'No se pudo enviar')));
      setMsgs(prev => prev && prev.map(m => m.tmp === tmp ? { ...m, status: 'failed' as const } : m));
    }
  };

  /** Muestra el mensaje al instante (con reloj) y lo manda. */
  const queue = (body: string, reply: number | null, file?: File) => {
    if ((!body && !file) || msgs === null) return;
    const tmp = Math.random().toString(36).slice(2);
    if (file) files.current.set(tmp, file);
    setErr('');
    scrollRef.current.stick();
    setMsgs(prev => [...(prev ?? []), {
      id: -Date.now(), tmp, author_id: meId, body, created_at: new Date().toISOString(), status: 'sending',
      reply_to: reply, image_url: file ? URL.createObjectURL(file) : null,
    }]);
    post(tmp, body, reply);
  };

  const retry = (m: Msg) => {
    setErr('');
    setMsgs(prev => prev && prev.map(x => x.tmp === m.tmp ? { ...x, status: 'sending' as const } : x));
    post(m.tmp!, m.body, m.reply_to ?? null);
  };
  const discard = (m: Msg) => { files.current.delete(m.tmp!); revoke(m); setMsgs(prev => prev && prev.filter(x => x.tmp !== m.tmp)); };

  const remove = async (id: number) => {
    const img = msgsRef.current?.find(m => m.id === id)?.image_url;
    let gone: boolean;
    try { gone = await api.deleteMessage(id, img); } catch (e) { return setErr(chatError(msgOf(e, 'Error de red'))); }
    if (!gone) return setErr('No tenés permiso para borrar ese mensaje.');
    setMsgs(prev => prev && prev.filter(m => m.id !== id));
    dropPoll(id);
  };

  /** Optimista: tocar la misma reacción la saca (como en WhatsApp). */
  const react = async (m: Msg, emoji: string) => {
    const mineNow = reacts[m.id]?.[meId];
    const next = mineNow === emoji ? null : emoji;
    setReacts(r => withReaction(r, m.id, meId, next));
    try { await api.setReaction(communityId, meId, m.id, next); }
    catch (e) {
      // Deshacer solo mi reacción en ese mensaje (sin pisar lo que llegó en vivo mientras tanto)
      setReacts(r => withReaction(r, m.id, meId, mineNow ?? null));
      const t = msgOf(e, 'Error de red');
      setErr(t.includes('does not exist') ? 'Las reacciones todavía no están habilitadas.' : chatError(t));
    }
  };

  /** Avisa "escribiendo…" (como mucho cada 2 s). */
  const typed = (v: string) => {
    const now = Date.now();
    if (v.trim() && now - lastTyping.current > 2000 && chRef.current) {
      lastTyping.current = now;
      chRef.current.send('typing', { id: meId });
    }
  };

  return {
    msgs, reacts, reactOk, more, loadingMore, err, setErr, online, polls, votes, typingIds,
    loadOlder, queue, retry, discard, remove, react, vote, createPoll, typed,
  };
}
