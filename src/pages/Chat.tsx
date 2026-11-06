import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { hue, sb } from '../lib/supabase';
import { Avatar } from '../lib/Avatar';
import type { Ranked } from '../lib/ranking';

/** id < 0 + tmp = mensaje local todavía no confirmado por el servidor. */
interface Msg { id: number; author_id: string; body: string; created_at: string; tmp?: string; status?: 'sending' | 'failed' }

const COLS = 'id,author_id,body,created_at';
const PAGE = 50;
const MAX = 500;
const GONE = { name: 'Ex miembro', photo_url: null };

const hhmm = (d: Date) => d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
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
  : m.includes('does not exist') ? 'El chat todavía no está habilitado en esta comunidad.'
  : m;

/** Une mensajes por id, ordena por fecha y deja los pendientes (locales) al final. */
const merge = (prev: Msg[], incoming: Msg[]) => {
  const byId = new Map<number, Msg>();
  for (const m of prev) if (m.id > 0) byId.set(m.id, m);
  for (const m of incoming) byId.set(m.id, m);
  const real = [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id);
  return [...real, ...prev.filter(m => m.id < 0)];
};

const docH = () => document.documentElement.scrollHeight;
const nearBottom = () => innerHeight + scrollY >= docH() - 160;
const toBottom = (smooth = false) => scrollTo({ top: docH(), behavior: smooth ? 'smooth' : 'auto' });
/** En compu Enter envía (Shift+Enter = salto de línea); en el celu Enter es salto de línea. */
const enterSends = () => matchMedia('(hover: hover) and (pointer: fine)').matches;

const Check = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
const Clock = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="8" /><path d="M12 8v4l2.5 2" /></svg>;

export function Chat({ communityId, rows, meId, isAdmin, onUnknown }: {
  communityId: string; rows: Ranked[]; meId: string; isAdmin: boolean;
  /** Llega un mensaje de alguien que no está en `rows` (se acaba de sumar): recargar miembros. */
  onUnknown?: () => void;
}) {
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [text, setText] = useState('');
  const [sel, setSel] = useState<number | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [unseen, setUnseen] = useState(0);
  const [composerH, setComposerH] = useState(64);
  const [err, setErr] = useState('');
  const ta = useRef<HTMLTextAreaElement>(null);
  const composer = useRef<HTMLFormElement>(null);
  const msgsRef = useRef<Msg[] | null>(null);
  msgsRef.current = msgs;
  const stick = useRef(false);                   // bajar al final en el próximo render
  const keepFrom = useRef<number | null>(null);  // alto previo al cargar anteriores (mantener posición)
  const asked = useRef(new Set<string>());       // autores desconocidos ya pedidos

  const fetchPage = async (before?: string) => {
    let q = sb.from('messages').select(COLS).eq('community_id', communityId)
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(PAGE);
    if (before) q = q.lt('created_at', before);
    const { data, error } = await q;
    if (error) { setErr(friendly(error.message)); return null; }
    return ((data ?? []) as Msg[]).reverse();
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
    };
    sync(true);
    let connected = false;
    const ch = sb.channel(`chat-${communityId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `community_id=eq.${communityId}` },
        p => {
          const m = p.new as Msg;
          const cur = msgsRef.current ?? [];
          if (cur.some(x => x.id === m.id)) return;
          // Mío y todavía esperando la respuesta del insert: lo reemplaza post().
          if (m.author_id === meId && cur.some(x => x.status === 'sending' && x.body === m.body)) return;
          if (m.author_id === meId || nearBottom()) stick.current = true; else setUnseen(n => n + 1);
          setMsgs(prev => merge(prev ?? [], [m]));
        })
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'messages' },
        p => { const id = (p.old as { id?: number }).id; if (id) setMsgs(prev => prev && prev.filter(x => x.id !== id)); })
      .subscribe(status => {
        if (status !== 'SUBSCRIBED') return;
        if (connected) sync(false); // reconexión
        connected = true;
      });
    return () => { alive = false; sb.removeChannel(ch); };
  }, [communityId]);

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

  // Autores que no están en la lista de miembros (alguien que se acaba de sumar)
  const byId = new Map(rows.map(r => [r.profile.id, r.profile]));
  useEffect(() => {
    if (!onUnknown || !msgs) return;
    const missing = msgs.find(m => !byId.has(m.author_id) && !asked.current.has(m.author_id));
    if (missing) { asked.current.add(missing.author_id); onUnknown(); }
  }, [msgs, rows]);

  useEffect(() => {
    const on = () => { const b = nearBottom(); setAtBottom(b); if (b) setUnseen(0); };
    on();
    addEventListener('scroll', on, { passive: true });
    addEventListener('resize', on);
    return () => { removeEventListener('scroll', on); removeEventListener('resize', on); };
  }, []);

  // Alto real del cuadro de texto (crece hasta 5 líneas): para el margen de abajo y el botón ↓
  useEffect(() => {
    const el = composer.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setComposerH(el.offsetHeight));
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

  const loadOlder = async () => {
    const first = msgs?.find(m => m.id > 0);
    if (!first || loadingMore) return;
    setLoadingMore(true);
    const got = await fetchPage(first.created_at);
    setLoadingMore(false);
    if (!got) return;
    setMore(got.length === PAGE);
    if (got.length) { keepFrom.current = docH(); setMsgs(prev => merge(prev ?? [], got)); }
  };

  const post = async (tmp: string, body: string) => {
    const { data, error } = await sb.from('messages')
      .insert({ community_id: communityId, author_id: meId, body }).select(COLS).single();
    if (error) setErr(friendly(error.message));
    setMsgs(prev => {
      if (!prev) return prev;
      if (error) return prev.map(m => m.tmp === tmp ? { ...m, status: 'failed' as const } : m);
      return merge(prev.filter(m => m.tmp !== tmp), [data as Msg]);
    });
  };

  const send = () => {
    const body = text.trim();
    if (!body || msgs === null) return;
    setText(''); setErr(''); setSel(null);
    const tmp = Math.random().toString(36).slice(2);
    stick.current = true;
    setMsgs(prev => [...(prev ?? []),
      { id: -Date.now(), tmp, author_id: meId, body, created_at: new Date().toISOString(), status: 'sending' }]);
    ta.current?.focus();
    post(tmp, body);
  };

  const retry = (m: Msg) => {
    setErr('');
    setMsgs(prev => prev && prev.map(x => x.tmp === m.tmp ? { ...x, status: 'sending' as const } : x));
    post(m.tmp!, m.body);
  };
  const discard = (m: Msg) => setMsgs(prev => prev && prev.filter(x => x.tmp !== m.tmp));

  const del = async (id: number) => {
    if (!confirm('¿Borrar este mensaje para todos?')) return;
    setSel(null);
    const { data, error } = await sb.from('messages').delete().eq('id', id).select('id');
    if (error) setErr(friendly(error.message));
    else if (!data?.length) setErr('No tenés permiso para borrar ese mensaje.');
    else setMsgs(prev => prev && prev.filter(m => m.id !== id));
  };
  const copy = async (body: string) => {
    setSel(null);
    try { await navigator.clipboard.writeText(body); } catch { /* sin permiso */ }
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && enterSends()) { e.preventDefault(); send(); }
  };

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
    return (
      <div class="msg-row" key={m.tmp ?? m.id}>
        <div class={`msg${mine ? ' mine' : ''}${first ? ' first' : ''}`}>
          {!mine && (first ? <Avatar p={p} size={28} /> : <span class="msg-gap" />)}
          <div class={`bubble${sel === m.id ? ' sel' : ''}`} onClick={() => real && setSel(sel === m.id ? null : m.id)}>
            {!mine && first && <b class="ellipsis" style={`color:hsl(${hue(m.author_id)} 60% var(--name-l))`}>{p.name}</b>}
            <span class="msg-body">{linkify(m.body)}<span class="msg-spacer" /></span>
            <span class="msg-meta">
              {hhmm(new Date(m.created_at))}
              {mine && (m.status === 'failed' ? <span class="fail">!</span> : m.status === 'sending' ? <Clock /> : <Check />)}
            </span>
          </div>
        </div>
        {m.status === 'failed' && (
          <div class="msg-sub mine">
            <span class="err" style="margin:0">No se envió</span>
            <button class="linkbtn" onClick={() => retry(m)}>Reintentar</button>
            <button class="linkbtn danger" onClick={() => discard(m)}>Descartar</button>
          </div>
        )}
        {sel === m.id && (
          <div class={`msg-sub${mine ? ' mine' : ''}`}>
            <button class="linkbtn" onClick={() => copy(m.body)}>Copiar</button>
            {(mine || isAdmin) && <button class="linkbtn danger" onClick={() => del(m.id)}>Borrar</button>}
          </div>
        )}
      </div>
    );
  };

  return (
    <div class="chat" style={`padding-bottom:${Math.max(8, composerH - 88)}px`}>
      {more && <button class="btn sm chat-more" disabled={loadingMore} onClick={loadOlder}>
        {loadingMore ? 'Cargando…' : 'Ver mensajes anteriores'}</button>}
      {msgs === null && !err && <p class="muted chat-empty">Cargando…</p>}
      {msgs?.length === 0 && <p class="muted chat-empty">Todavía no hay mensajes. ¡Arrancá la charla!</p>}

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

      <form class="composer" ref={composer} onSubmit={e => { e.preventDefault(); send(); }}>
        <div class="composer-in">
          <textarea ref={ta} rows={1} value={text} maxLength={MAX} placeholder="Mensaje" aria-label="Mensaje"
            onInput={e => setText((e.target as HTMLTextAreaElement).value)} onKeyDown={onKey} />
          <button class="send" type="submit" aria-label="Enviar" disabled={!text.trim() || msgs === null}>
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3.4 20.4l17.45-7.48a1 1 0 000-1.84L3.4 3.6a.993.993 0 00-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z" /></svg>
          </button>
        </div>
      </form>
    </div>
  );
}
