import { createPortal } from 'preact/compat';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { displayName, hue, sb } from '../../shared/supabase';
import { Avatar } from '../../shared/ui/Avatar';
import type { Ranked } from '../ranking/ranking';
import { EMOJIS, REACTIONS, STICKERS, isJumbo } from './emoji';
import { PollCard } from './PollCard';
import { PollSheet } from './PollSheet';
import {
  addVote, pollError, pollSnippet, removeVote, replaceVotes, setMine, toggleChoice,
  type Poll, type PollVote, type Votes,
} from './polls';

/** id < 0 + tmp = mensaje local todavía no confirmado por el servidor. */
interface Msg {
  id: number; author_id: string; body: string; created_at: string;
  reply_to?: number | null; image_url?: string | null;
  tmp?: string; status?: 'sending' | 'failed';
}
/** reacciones[mensaje][perfil] = emoji */
type Reacts = Record<number, Record<string, string>>;
interface RxRow { message_id: number; profile_id: string; emoji: string }

const PAGE = 50;
const MAX = 500;
const GONE = { name: 'Ex miembro', photo_url: null };

/** Último mensaje visto por comunidad (para el contador de no leídos de la pestaña). */
export const seenKey = (communityId: string) => `futrank-seen-${communityId}`;
const TYPING_MS = 3500;

const hhmm = (d: Date) => d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const dayLabel = (d: Date) => {
  const today = new Date(), yest = new Date();
  yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Hoy';
  if (d.toDateString() === yest.toDateString()) return 'Ayer';
  return d.toLocaleDateString('es-AR', {
    weekday: 'long', day: 'numeric', month: 'long',
    ...(d.getFullYear() === today.getFullYear() ? {} : { year: 'numeric' }),
  });
};
const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g;
const linkify = (s: string) => s.split(URL_RE).map((part, i) =>
  i % 2 ? <a href={part} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>{part}</a> : part);
const friendly = (m: string) =>
  m.includes('row-level security') ? 'No tenés permiso para hacer eso (¿seguís siendo miembro?).'
  : m.includes('Failed to fetch') || m.includes('NetworkError') ? 'Sin conexión. Probá de nuevo.'
  : m.includes('Bucket not found') || m.includes('image_url') || m.includes('reply_to') ? 'Las fotos y respuestas todavía no están habilitadas (falta actualizar la base).'
  : m.includes('does not exist') ? 'El chat todavía no está habilitado en esta comunidad.'
  : m.includes('exceeded the maximum allowed size') || m.includes('Payload too large') ? 'La foto es muy pesada (máximo 5 MB).'
  : m;
const snippet = (m: Msg) => m.body.trim() ? m.body.trim().slice(0, 90) : m.image_url ? '📷 Foto' : '';

/** Une mensajes por id, ordena por fecha y deja los pendientes (locales) al final. */
const merge = (prev: Msg[], incoming: Msg[]) => {
  const byId = new Map<number, Msg>();
  for (const m of prev) if (m.id > 0) byId.set(m.id, m);
  for (const m of incoming) byId.set(m.id, m);
  const real = [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id);
  return [...real, ...prev.filter(m => m.id < 0)];
};

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

const docH = () => document.documentElement.scrollHeight;
const nearBottom = () => innerHeight + scrollY >= docH() - 160;
const toBottom = (smooth = false) => scrollTo({ top: docH(), behavior: smooth ? 'smooth' : 'auto' });
/** En compu Enter envía (Shift+Enter = salto de línea); en el celu Enter es salto de línea. */
const enterSends = () => matchMedia('(hover: hover) and (pointer: fine)').matches;

const Check = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
const Clock = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="8" /><path d="M12 8v4l2.5 2" /></svg>;
const Smile = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="12" r="9" /><path d="M8.5 14.5c.9 1.3 2.1 2 3.5 2s2.6-.7 3.5-2M9 9.5h.01M15 9.5h.01" stroke-width="2.4" /></svg>;
const Camera = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>;
const PollIco = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 20v-7M12 20V5M18 20v-10" /></svg>;
const ReplyIco = () => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 7l-5 5 5 5M5 12h9a5 5 0 0 1 5 5v1" /></svg>;

export function Chat({ communityId, rows, meId, isAdmin, onUnknown }: {
  communityId: string; rows: Ranked[]; meId: string; isAdmin: boolean;
  /** Llega un mensaje de alguien que no está en `rows` (se acaba de sumar): recargar miembros. */
  onUnknown?: () => void;
}) {
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [reacts, setReacts] = useState<Reacts>({});
  const [reactOk, setReactOk] = useState(true);   // false si la tabla de reacciones todavía no existe
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<Msg | null>(null);
  const [panel, setPanel] = useState<'' | 'emoji' | 'sticker'>('');
  const [sel, setSel] = useState<number | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  const [flash, setFlash] = useState<number | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [unseen, setUnseen] = useState(0);
  const [composerH, setComposerH] = useState(64);
  const [err, setErr] = useState('');
  const [online, setOnline] = useState(0);
  const [polls, setPolls] = useState<Record<number, Poll>>({});   // encuesta por id de mensaje
  const [votes, setVotes] = useState<Votes>({});
  const [pollOpen, setPollOpen] = useState(false);
  const [typing, setTyping] = useState<Record<string, number>>({}); // autor → último "escribiendo"
  const chRef = useRef<ReturnType<typeof sb.channel> | null>(null);
  const lastTyping = useRef(0);
  const ta = useRef<HTMLTextAreaElement>(null);
  const fileIn = useRef<HTMLInputElement>(null);
  const composer = useRef<HTMLFormElement>(null);
  const msgsRef = useRef<Msg[] | null>(null);
  msgsRef.current = msgs;
  const files = useRef(new Map<string, File>());   // fotos de mensajes pendientes (para reintentar)
  const stick = useRef(false);                     // bajar al final en el próximo render
  const keepFrom = useRef<number | null>(null);    // alto previo al cargar anteriores (mantener posición)
  const asked = useRef(new Set<string>());         // autores desconocidos ya pedidos
  const pollsRef = useRef(polls);
  pollsRef.current = polls;
  const votesRef = useRef<Votes>({});              // siempre al día (los toques seguidos parten de lo último)
  const atBottomRef = useRef(true);
  atBottomRef.current = atBottom;
  const pending = useRef(new Map<string, number>());       // votos míos en vuelo, por encuesta
  const voteChain = useRef(new Map<string, Promise<void>>()); // los votos de una encuesta salen de a uno, en orden
  const mineAt = useRef(new Map<string, number>());        // último voto mío por encuesta
  const live = useRef<{ add: boolean; row: PollVote }[]>([]); // votos que llegan en vivo, juntados de a poco
  const liveTimer = useRef(0);

  const loadReacts = async (ids: number[]) => {
    if (!ids.length) return;
    const { data, error } = await sb.from('message_reactions').select('message_id,profile_id,emoji').in('message_id', ids);
    if (error) { setReactOk(false); return; }
    setReacts(prev => {
      const next = { ...prev };
      for (const id of ids) delete next[id];
      for (const r of data ?? []) next[r.message_id] = { ...next[r.message_id], [r.profile_id]: r.emoji };
      return next;
    });
  };

  const onReact = (n: RxRow) =>
    setReacts(prev => ({ ...prev, [n.message_id]: { ...prev[n.message_id], [n.profile_id]: n.emoji } }));

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
    const { data, error } = await sb.from('poll_votes').select('poll_id,profile_id,option').in('poll_id', pollIds);
    if (error) return false;
    const skip = new Set(pollIds.filter(id => holdPoll(id, !force)));
    commitVotes(v => replaceVotes(v, pollIds, (data ?? []) as PollVote[], skip));
    return true;
  };
  /** Encuestas (y sus votos) de esos mensajes. Los mensajes comunes no tienen fila en `polls`. */
  const loadPolls = async (messageIds: number[]) => {
    if (!messageIds.length) return;
    const { data, error } = await sb.from('polls').select('*').in('message_id', messageIds);
    if (error || !data?.length) return;
    const ps = data as Poll[];
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
      try {
        const { error } = await sb.rpc('vote_poll', { p_poll: poll.id, p_options: next });
        if (error) failed = error.message;
      } catch (e: any) { failed = e?.message ?? 'Sin conexión. Probá de nuevo.'; }
      mineAt.current.set(poll.id, Date.now());
      const left = Math.max(0, (pending.current.get(poll.id) ?? 1) - 1);
      pending.current.set(poll.id, left);
      if (!failed) {
        chRef.current?.send({ type: 'broadcast', event: 'poll', payload: { id: poll.id } }).catch(() => {});
        return;
      }
      setErr(friendly(pollError(failed)));
      if (left === 0 && !(await loadVotes([poll.id], true)) && !holdPoll(poll.id, false)) commitVotes(v => setMine(v, poll.id, meId, before));
    };
    voteChain.current.set(poll.id, (voteChain.current.get(poll.id) ?? Promise.resolve()).then(run));
  };

  /** Crea la encuesta (RPC) y la trae enseguida; el INSERT en vivo del mensaje se une por id sin duplicar. */
  const createPoll = async (question: string, options: string[], multi: boolean) => {
    const { data, error } = await sb.rpc('create_poll', { p_community: communityId, p_question: question, p_options: options, p_multi: multi });
    if (error) throw new Error(friendly(pollError(error.message)));
    const id = Number(data);
    try {
      stick.current = true;
      const [row] = await Promise.all([sb.from('messages').select('*').eq('id', id).maybeSingle(), loadPolls([id])]);
      if (row.data) setMsgs(prev => merge(prev ?? [], [row.data as Msg]));
    } catch { /* ya se creó: llega por el canal en vivo */ }
  };

  /** Libera la foto local (blob:) de un mensaje pendiente. */
  const revoke = (m?: Msg) => { if (m?.image_url?.startsWith('blob:')) URL.revokeObjectURL(m.image_url); };
  useEffect(() => () => { msgsRef.current?.forEach(revoke); }, []);

  /** `withPolls`: esperar las encuestas antes de devolver (al cargar anteriores, para que no se corra el scroll). */
  const fetchPage = async (before?: string, withPolls = false) => {
    let q = sb.from('messages').select('*').eq('community_id', communityId)
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(PAGE);
    if (before) q = q.lt('created_at', before);
    const { data, error } = await q;
    if (error) { setErr(friendly(error.message)); return null; }
    const got = ((data ?? []) as Msg[]).reverse();
    loadReacts(got.map(m => m.id));
    const ids = got.map(m => m.id);
    if (withPolls) await loadPolls(ids); else loadPolls(ids);
    return got;
  };

  useEffect(() => {
    let alive = true;
    // Carga inicial y, cada vez que el WebSocket (re)conecta, se trae lo último y se une por id:
    // así no se pierde nada de lo que llegó mientras el celu estaba en segundo plano.
    const sync = async (first: boolean) => {
      const got = await fetchPage();
      if (!alive || !got) return;
      if (first) setMore(got.length === PAGE);
      const fresh = got.filter(g => !msgsRef.current?.some(x => x.id === g.id)).length;
      if (first || nearBottom()) stick.current = true; else if (fresh) setUnseen(n => n + fresh);
      setMsgs(prev => merge(prev ?? [], got));
      if (!first) {
        // Al reconectar, también se refrescan los votos de encuestas más viejas que ya están cargadas.
        const inPage = new Set(got.map(g => g.id));
        const rest = Object.values(pollsRef.current).filter(p => !inPage.has(p.message_id)).map(p => p.id);
        if (rest.length) loadVotes(rest);
      }
    };
    sync(true);
    let connected = false;
    // Un solo canal: mensajes y reacciones (tablas), presencia (en línea) y broadcast ("escribiendo…").
    const ch = sb.channel(`chat-${communityId}`, { config: { presence: { key: meId }, broadcast: { self: false } } })
      .on('presence', { event: 'sync' }, () => setOnline(Object.keys(ch.presenceState()).length))
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        const id = (payload as { id?: string })?.id;
        if (id && id !== meId) setTyping(t => ({ ...t, [id]: Date.now() }));
      })
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `community_id=eq.${communityId}` },
        p => {
          const m = p.new as Msg;
          const cur = msgsRef.current ?? [];
          if (cur.some(x => x.id === m.id)) return;
          // Mío y todavía esperando la respuesta del insert: lo reemplaza post().
          if (m.author_id === meId && cur.some(x => x.status === 'sending' && x.body === m.body)) return;
          if (m.author_id === meId || nearBottom()) stick.current = true; else setUnseen(n => n + 1);
          setTyping(t => { if (!(m.author_id in t)) return t; const { [m.author_id]: _, ...rest } = t; return rest; });
          setMsgs(prev => merge(prev ?? [], [m]));
        })
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'messages' },
        p => {
          const id = (p.old as { id?: number }).id;
          if (!id) return;
          setMsgs(prev => prev && prev.filter(x => x.id !== id));
          dropPoll(id); // la encuesta se borra en cascada en la base
        })
      // Encuestas: la fila nueva (el mensaje ya llegó por su lado) y los votos, juntados en queueVote.
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'polls', filter: `community_id=eq.${communityId}` },
        p => {
          const row = p.new as Poll;
          // Si las opciones no vinieron como lista, se pide la fila por la API.
          if (!Array.isArray(row.options)) { loadPolls([row.message_id]); return; }
          setPolls(prev => ({ ...prev, [row.message_id]: row }));
        })
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'poll_votes', filter: `community_id=eq.${communityId}` },
        p => queueVote(true, p.new as PollVote))
      // Los DELETE de votos no se pueden filtrar por comunidad (llegarían los de toda la app): en su lugar,
      // quien vota avisa por broadcast en este canal y los demás releen los votos de esa encuesta.
      .on('broadcast', { event: 'poll' }, ({ payload }) => { if (payload?.id) loadVotes([payload.id], true); })
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'message_reactions', filter: `community_id=eq.${communityId}` },
        p => onReact(p.new as RxRow))
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'message_reactions', filter: `community_id=eq.${communityId}` },
        p => onReact(p.new as RxRow))
      // Los DELETE solo traen la clave (message_id, profile_id): no se pueden filtrar por comunidad.
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'message_reactions' },
        p => {
          const o = p.old as { message_id?: number; profile_id?: string };
          if (!o.message_id || !o.profile_id) return;
          setReacts(prev => {
            if (!prev[o.message_id!]?.[o.profile_id!]) return prev;
            const { [o.profile_id!]: _, ...rest } = prev[o.message_id!];
            return { ...prev, [o.message_id!]: rest };
          });
        })
      .subscribe(status => {
        if (status !== 'SUBSCRIBED') return;
        ch.track({ at: Date.now() }).catch(() => {});
        if (connected) sync(false); // reconexión
        connected = true;
      });
    chRef.current = ch;
    return () => { alive = false; chRef.current = null; clearTimeout(liveTimer.current); liveTimer.current = 0; sb.removeChannel(ch); };
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

  // Marcar como leído lo último que se ve (para el contador de la pestaña)
  useEffect(() => {
    const last = msgs && [...msgs].reverse().find(m => m.id > 0);
    if (last && atBottom) try { localStorage.setItem(seenKey(communityId), last.created_at); } catch { /* sin storage */ }
  }, [msgs, atBottom]);

  // El chat usa el scroll de la página: sin "scroll anchoring" para que cargar anteriores no salte dos veces.
  useEffect(() => {
    const html = document.documentElement;
    html.style.overflowAnchor = 'none';
    return () => { html.style.overflowAnchor = ''; };
  }, []);

  useLayoutEffect(() => {
    if (keepFrom.current != null) { scrollBy(0, docH() - keepFrom.current); keepFrom.current = null; }
    else if (stick.current) { stick.current = false; toBottom(); setUnseen(0); }
  }, [msgs]);
  // La encuesta llega un instante después de su mensaje y lo agranda: si estabas abajo de todo, seguís viendo lo último.
  useLayoutEffect(() => { if (atBottomRef.current && Object.keys(polls).length) toBottom(); }, [polls]);

  // Autores que no están en la lista de miembros (alguien que se acaba de sumar)
  const byId = new Map(rows.map(r => [r.profile.id, r.profile]));
  useEffect(() => {
    if (!onUnknown || !msgs) return;
    // Todos los autores (y votantes de encuestas) desconocidos de una vez: una sola recarga (los ex miembros no van a aparecer igual)
    const ids = new Set(msgs.map(m => m.author_id));
    for (const byP of Object.values(votes)) for (const pid of Object.keys(byP)) ids.add(pid);
    const missing = [...ids].filter(a => !byId.has(a) && !asked.current.has(a));
    if (missing.length) { missing.forEach(a => asked.current.add(a)); onUnknown(); }
  }, [msgs, rows, votes]);

  useEffect(() => {
    const on = () => { const b = nearBottom(); setAtBottom(b); if (b) setUnseen(0); };
    on();
    addEventListener('scroll', on, { passive: true });
    addEventListener('resize', on);
    return () => { removeEventListener('scroll', on); removeEventListener('resize', on); };
  }, []);

  // Alto real del cuadro de texto (crece, y con panel de emojis/respuesta): margen de abajo y botón ↓
  useEffect(() => {
    const el = composer.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    // Si estabas abajo de todo y el cuadro crece (emojis, respuesta, varias líneas), seguís viendo lo último
    const ro = new ResizeObserver(() => {
      const pinned = nearBottom();
      setComposerH(el.offsetHeight);
      if (pinned) requestAnimationFrame(() => toBottom());
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Textarea que crece con el texto (hasta ~5 líneas, el resto scrollea)
  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight + 2, 132)}px`;
  }, [text]);

  // Escape cierra lo que esté abierto
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || pollOpen) return; // la hoja de encuesta se cierra sola
      if (zoom) setZoom(null); else if (panel) setPanel(''); else if (sel) setSel(null); else if (replyTo) setReplyTo(null);
    };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, [zoom, panel, sel, replyTo, pollOpen]);

  const loadOlder = async () => {
    const first = msgs?.find(m => m.id > 0);
    if (!first || loadingMore) return;
    setLoadingMore(true);
    const got = await fetchPage(first.created_at, true);
    setLoadingMore(false);
    if (!got) return;
    setMore(got.length === PAGE);
    if (got.length) { keepFrom.current = docH(); setMsgs(prev => merge(prev ?? [], got)); }
  };

  const post = async (tmp: string, body: string, reply: number | null) => {
    let image_url: string | null = null;
    const file = files.current.get(tmp);
    try {
      if (file) {
        const { blob, ext, type } = await shrink(file);
        const path = `${communityId}/${meId}/${crypto.randomUUID()}.${ext}`;
        const up = await sb.storage.from('chat').upload(path, blob, { contentType: type });
        if (up.error) throw up.error;
        image_url = sb.storage.from('chat').getPublicUrl(path).data.publicUrl;
      }
      const row: Record<string, unknown> = { community_id: communityId, author_id: meId, body };
      if (reply) row.reply_to = reply;
      if (image_url) row.image_url = image_url;
      const { data, error } = await sb.from('messages').insert(row).select('*').single();
      if (error) throw error;
      files.current.delete(tmp);
      revoke(msgsRef.current?.find(m => m.tmp === tmp));
      setMsgs(prev => prev && merge(prev.filter(m => m.tmp !== tmp), [data as Msg]));
    } catch (e: any) {
      setErr(friendly(e?.message ?? 'No se pudo enviar'));
      setMsgs(prev => prev && prev.map(m => m.tmp === tmp ? { ...m, status: 'failed' as const } : m));
    }
  };

  const queue = (body: string, file?: File) => {
    if ((!body && !file) || msgs === null) return;
    const tmp = Math.random().toString(36).slice(2);
    if (file) files.current.set(tmp, file);
    const reply = replyTo?.id ?? null;
    setErr(''); setSel(null); setReplyTo(null);
    stick.current = true;
    setMsgs(prev => [...(prev ?? []), {
      id: -Date.now(), tmp, author_id: meId, body, created_at: new Date().toISOString(), status: 'sending',
      reply_to: reply, image_url: file ? URL.createObjectURL(file) : null,
    }]);
    post(tmp, body, reply);
  };

  const send = () => {
    const body = text.trim();
    if (!body) return;
    setText(''); setPanel('');
    ta.current?.focus();
    queue(body);
  };
  const sendSticker = (s: string) => { setPanel(''); queue(s); };
  const onFile = (e: Event) => {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) return setErr('Solo se pueden mandar fotos.');
    if (f.size > 15 * 1024 * 1024) return setErr('La foto es muy pesada.');
    const caption = text.trim();
    setText(''); setPanel('');
    queue(caption, f);
  };

  const retry = (m: Msg) => {
    setErr('');
    setMsgs(prev => prev && prev.map(x => x.tmp === m.tmp ? { ...x, status: 'sending' as const } : x));
    post(m.tmp!, m.body, m.reply_to ?? null);
  };
  const discard = (m: Msg) => { files.current.delete(m.tmp!); revoke(m); setMsgs(prev => prev && prev.filter(x => x.tmp !== m.tmp)); };

  const del = async (id: number) => {
    if (!confirm('¿Borrar este mensaje para todos?')) return;
    setSel(null);
    const img = msgsRef.current?.find(m => m.id === id)?.image_url;
    const { data, error } = await sb.from('messages').delete().eq('id', id).select('id');
    if (error) return setErr(friendly(error.message));
    if (!data?.length) return setErr('No tenés permiso para borrar ese mensaje.');
    setMsgs(prev => prev && prev.filter(m => m.id !== id));
    dropPoll(id);
    // La foto también se borra del almacenamiento (si no, quedaba accesible por su link)
    const path = img?.split('/object/public/chat/')[1]?.split('?')[0];
    if (path) sb.storage.from('chat').remove([decodeURIComponent(path)]).catch(() => {});
  };
  const copy = async (body: string) => {
    setSel(null);
    try { await navigator.clipboard.writeText(body); } catch { /* sin permiso */ }
  };
  const react = async (m: Msg, emoji: string) => {
    setSel(null);
    const mineNow = reacts[m.id]?.[meId];
    // Optimista: tocar la misma reacción la saca (como en WhatsApp)
    setReacts(r => {
      const cur = { ...r[m.id] };
      if (mineNow === emoji) delete cur[meId]; else cur[meId] = emoji;
      return { ...r, [m.id]: cur };
    });
    const { error } = mineNow === emoji
      ? await sb.from('message_reactions').delete().eq('message_id', m.id).eq('profile_id', meId)
      : await sb.from('message_reactions').upsert({ message_id: m.id, profile_id: meId, community_id: communityId, emoji });
    if (error) {
      // Deshacer solo mi reacción en ese mensaje (sin pisar lo que llegó en vivo mientras tanto)
      setReacts(r => {
        const cur = { ...r[m.id] };
        if (mineNow) cur[meId] = mineNow; else delete cur[meId];
        return { ...r, [m.id]: cur };
      });
      setErr(error.message.includes('does not exist') ? 'Las reacciones todavía no están habilitadas.' : friendly(error.message)); }
  };
  const reply = (m: Msg) => { setSel(null); setReplyTo(m); ta.current?.focus(); };
  const goTo = (id: number) => {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setFlash(id); setTimeout(() => setFlash(f => (f === id ? null : f)), 1400);
  };

  const onType = (v: string) => {
    setText(v);
    const now = Date.now();
    if (v.trim() && now - lastTyping.current > 2000 && chRef.current) {
      lastTyping.current = now;
      chRef.current.send({ type: 'broadcast', event: 'typing', payload: { id: meId } }).catch(() => {});
    }
  };
  const addEmoji = (e: string) => {
    const el = ta.current;
    const start = el?.selectionStart ?? text.length, end = el?.selectionEnd ?? text.length;
    const v = (text.slice(0, start) + e + text.slice(end)).slice(0, MAX);
    setText(v);
    requestAnimationFrame(() => { if (el) { const p = start + e.length; el.setSelectionRange(p, p); } });
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && enterSends()) { e.preventDefault(); send(); }
  };

  const nameOf = (id: string) => displayName(byId.get(id) ?? GONE);
  const who = (id: string) => byId.get(id) ?? GONE;
  /** Citar/responder una encuesta muestra "📊 pregunta". */
  const snip = (m: Msg) => (polls[m.id] ? pollSnippet(polls[m.id].question) : snippet(m));
  const openPoll = () => { setPanel(''); setSel(null); ta.current?.blur(); setPollOpen(true); };
  const byMsg = new Map((msgs ?? []).map(m => [m.id, m]));

  // Agrupado por día: cada día es una sección con su etiqueta "pegajosa" (sticky) arriba.
  const days: { key: string; date: Date; items: Msg[] }[] = [];
  for (const m of msgs ?? []) {
    const d = new Date(m.created_at), key = d.toDateString();
    if (days[days.length - 1]?.key !== key) days.push({ key, date: d, items: [] });
    days[days.length - 1].items.push(m);
  }

  const bubble = (m: Msg, first: boolean) => {
    const mine = m.author_id === meId;
    const p = byId.get(m.author_id) ?? GONE;
    const real = m.id > 0;
    const poll = polls[m.id];
    const jumbo = !poll && !m.image_url && !m.reply_to && isJumbo(m.body);
    const quoted = m.reply_to ? byMsg.get(m.reply_to) : undefined;
    const rx = Object.values(reacts[m.id] ?? {});
    const counts = [...new Set(rx)].map(e => [e, rx.filter(x => x === e).length] as const);
    const myRx = reacts[m.id]?.[meId];
    const meta = (
      <span class={`msg-meta${m.image_url && !m.body ? ' on-img' : ''}`}>
        {hhmm(new Date(m.created_at))}
        {mine && (m.status === 'failed' ? <span class="fail">!</span> : m.status === 'sending' ? <Clock /> : <Check />)}
      </span>
    );
    return (
      <div class="msg-row" key={m.tmp ?? m.id} id={real ? `msg-${m.id}` : undefined}>
        <div class={`msg${mine ? ' mine' : ''}${first ? ' first' : ''}${jumbo ? ' jumbo' : ''}`}>
          {!mine && (first ? <Avatar p={p} size={28} /> : <span class="msg-gap" />)}
          <div class={`bubble${sel === m.id ? ' sel' : ''}${flash === m.id ? ' flash' : ''}${m.image_url ? ' has-img' : ''}${poll ? ' has-poll' : ''}`}
            onClick={() => real && setSel(sel === m.id ? null : m.id)}>
            {!mine && first && !jumbo && <b class="ellipsis" style={`color:hsl(${hue(m.author_id)} 60% var(--name-l))`}>{displayName(p)}</b>}
            {m.reply_to && (
              <button type="button" class="quote" style={quoted ? `--qh:${hue(quoted.author_id)}` : ''}
                onClick={e => { e.stopPropagation(); if (m.reply_to) goTo(m.reply_to); }}>
                <b>{quoted ? (quoted.author_id === meId ? 'Vos' : nameOf(quoted.author_id)) : 'Mensaje'}</b>
                <span class="ellipsis">{quoted ? snip(quoted) : 'Mensaje anterior'}</span>
              </button>
            )}
            {m.image_url && (
              <img class="msg-img" src={m.image_url} alt="Foto" loading="lazy"
                onClick={e => { e.stopPropagation(); setZoom(m.image_url!); }} />
            )}
            {poll
              ? <PollCard poll={poll} byProfile={votes[poll.id]} meId={meId} who={who} onVote={vote} meta={meta} />
              : <>
                {jumbo
                  ? <span class="msg-jumbo">{m.body}</span>
                  : m.body && <span class="msg-body">{linkify(m.body)}<span class="msg-spacer" /></span>}
                {meta}
              </>}
          </div>
        </div>
        {counts.length > 0 && (
          <div class={`rx-chips${mine ? ' mine' : ''}`}>
            {counts.map(([e, n]) => (
              <button type="button" class={`rx-chip${myRx === e ? ' on' : ''}`} onClick={() => react(m, e)}
                aria-label={`${e} ${n}${myRx === e ? ', tu reacción (tocá para sacarla)' : ''}`}>
                {e}{n > 1 && <small>{n}</small>}
              </button>
            ))}
          </div>
        )}
        {m.status === 'failed' && (
          <div class="msg-sub mine">
            <span class="err" style="margin:0">No se envió</span>
            <button class="linkbtn" onClick={() => retry(m)}>Reintentar</button>
            <button class="linkbtn danger" onClick={() => discard(m)}>Descartar</button>
          </div>
        )}
        {sel === m.id && (
          <div class={`msg-menu${mine ? ' mine' : ''}`}>
            {reactOk && (
              <div class="rx-bar" role="group" aria-label="Reaccionar">
                {REACTIONS.map(e => (
                  <button type="button" class={myRx === e ? 'on' : ''} onClick={() => react(m, e)} aria-label={`Reaccionar ${e}`}>{e}</button>
                ))}
              </div>
            )}
            <div class="msg-sub">
              <button class="linkbtn" onClick={() => reply(m)}>Responder</button>
              {m.body && <button class="linkbtn" onClick={() => copy(m.body)}>Copiar</button>}
              {(mine || isAdmin) && <button class="linkbtn danger" onClick={() => del(m.id)}>Borrar</button>}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div class="chat" style={`padding-bottom:${Math.max(8, composerH - 88)}px`}>
      <div class="chat-head">
        <span><i class={`dot${online > 1 ? ' on' : ''}`} />{online === 0 ? 'Conectando…' : online === 1 ? 'Solo vos en línea' : `${online} en línea`}</span>
        <span>{rows.length} {rows.length === 1 ? 'miembro' : 'miembros'}</span>
      </div>
      {more && <button class="btn sm chat-more" disabled={loadingMore} onClick={loadOlder}>
        {loadingMore ? 'Cargando…' : 'Ver mensajes anteriores'}</button>}
      {msgs === null && !err && <p class="muted chat-empty">Cargando…</p>}
      {msgs?.length === 0 && <p class="muted chat-empty">Todavía no hay mensajes. ¡Arrancá la charla! ⚽</p>}

      {days.map(d => (
        <section class="chat-dayg" key={d.key}>
          <div class="chat-day"><span>{dayLabel(d.date)}</span></div>
          {d.items.map((m, i) => bubble(m, i === 0 || d.items[i - 1].author_id !== m.author_id))}
        </section>
      ))}
      {err && <p class="err">{err}{msgs === null && <> · <button class="linkbtn" onClick={() => location.reload()}>Reintentar</button></>}</p>}

      {!atBottom && (
        <button class="chat-down" style={`bottom:${composerH + 12}px`} aria-label="Ir al último mensaje" onClick={() => toBottom(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6" /></svg>
          {unseen > 0 && <span>{unseen}</span>}
        </button>
      )}

      {/* En el <body>: fuera del chat (que tiene su propio contexto de apilado) para tapar también las pestañas */}
      {zoom && createPortal(
        <div class="lightbox" role="dialog" aria-label="Foto" onClick={() => setZoom(null)}>
          <img src={zoom} alt="Foto" />
          <button class="lightbox-x" aria-label="Cerrar">✕</button>
        </div>,
        document.body,
      )}

      {pollOpen && <PollSheet onClose={() => setPollOpen(false)} onCreate={createPoll} />}

      <form class="composer" ref={composer} onSubmit={e => { e.preventDefault(); send(); }}>
        {typingIds.length > 0 && (
          <div class="typing" aria-live="polite">
            <span class="typing-dots"><i /><i /><i /></span>
            {typingIds.length === 1 ? `${nameOf(typingIds[0])} está escribiendo…` : `${typingIds.length} personas están escribiendo…`}
          </div>
        )}
        {replyTo && (
          <div class="reply-bar">
            <ReplyIco />
            <div class="reply-txt" style={`--qh:${hue(replyTo.author_id)}`}>
              <b>{replyTo.author_id === meId ? 'Vos' : nameOf(replyTo.author_id)}</b>
              <span class="ellipsis">{snip(replyTo)}</span>
            </div>
            <button type="button" class="icon-btn" aria-label="Cancelar respuesta" onClick={() => setReplyTo(null)}>✕</button>
          </div>
        )}
        {panel && (
          <div class="emoji-panel">
            <div class="ep-tabs">
              <button type="button" class={panel === 'emoji' ? 'on' : ''} onClick={() => setPanel('emoji')}>Emojis</button>
              <button type="button" class={panel === 'sticker' ? 'on' : ''} onClick={() => setPanel('sticker')}>Stickers</button>
            </div>
            <div class="ep-body">
              {panel === 'emoji'
                ? EMOJIS.map(g => <>
                  <p class="ep-cat">{g.name}</p>
                  <div class="ep-grid">{g.list.map(e => <button type="button" onClick={() => addEmoji(e)}>{e}</button>)}</div>
                </>)
                : <div class="ep-stickers">{STICKERS.map(s => <button type="button" onClick={() => sendSticker(s)} aria-label={`Mandar ${s}`}>{s}</button>)}</div>}
            </div>
          </div>
        )}
        <div class="composer-in">
          <div class="composer-box">
            <button type="button" class={`icon-btn${panel ? ' on' : ''}`} aria-label="Emojis y stickers"
              onClick={() => setPanel(panel ? '' : 'emoji')}><Smile /></button>
            <textarea ref={ta} rows={1} value={text} maxLength={MAX} placeholder="Mensaje" aria-label="Mensaje"
              onInput={e => onType((e.target as HTMLTextAreaElement).value)} onKeyDown={onKey}
              onFocus={() => matchMedia('(pointer: coarse)').matches && setPanel('')} />
            <button type="button" class="icon-btn" aria-label="Crear una encuesta" title="Encuesta" disabled={msgs === null}
              onClick={openPoll}><PollIco /></button>
            <button type="button" class="icon-btn" aria-label="Mandar una foto" disabled={msgs === null}
              onClick={() => fileIn.current?.click()}><Camera /></button>
            <input ref={fileIn} type="file" accept="image/*" hidden onChange={onFile} />
          </div>
          <button class="send" type="submit" aria-label="Enviar" disabled={!text.trim() || msgs === null}>
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3.4 20.4l17.45-7.48a1 1 0 000-1.84L3.4 3.6a.993.993 0 00-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z" /></svg>
          </button>
        </div>
      </form>
    </div>
  );
}
