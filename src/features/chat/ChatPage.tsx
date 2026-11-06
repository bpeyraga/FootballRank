import { createPortal } from 'preact/compat';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { displayName, hue } from '../../shared/supabase';
import { Avatar } from '../../shared/ui/Avatar';
import type { Ranked } from '../ranking/ranking';
import { EMOJIS, REACTIONS, STICKERS, isJumbo } from './emoji';
import { PollCard } from './PollCard';
import { PollSheet } from './PollSheet';
import { pollSnippet } from './polls';
import { GONE, MAX, byDay, dayLabel, hhmm, reactionCounts, seenKey, snippet, splitLinks, type Msg } from './model';
import { useChat } from './useChat';

const linkify = (s: string) => splitLinks(s).map((part, i) =>
  i % 2 ? <a href={part} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>{part}</a> : part);

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
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<Msg | null>(null);
  const [panel, setPanel] = useState<'' | 'emoji' | 'sticker'>('');
  const [sel, setSel] = useState<number | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  const [flash, setFlash] = useState<number | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [unseen, setUnseen] = useState(0);
  const [composerH, setComposerH] = useState(64);
  const [pollOpen, setPollOpen] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  const fileIn = useRef<HTMLInputElement>(null);
  const composer = useRef<HTMLFormElement>(null);
  const stick = useRef(false);                     // bajar al final en el próximo render
  const keepFrom = useRef<number | null>(null);    // alto previo al cargar anteriores (mantener posición)
  const asked = useRef(new Set<string>());         // autores desconocidos ya pedidos
  const atBottomRef = useRef(true);
  atBottomRef.current = atBottom;

  const c = useChat(communityId, meId, {
    nearBottom,
    stick: () => { stick.current = true; },
    keep: () => { keepFrom.current = docH(); },
    unseen: n => setUnseen(u => u + n),
  });
  const { msgs, reacts, polls, votes, typingIds, err } = c;

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

  const queue = (body: string, file?: File) => {
    if ((!body && !file) || msgs === null) return;
    const reply = replyTo?.id ?? null;
    setSel(null); setReplyTo(null);
    c.queue(body, reply, file);
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
    if (!f.type.startsWith('image/')) return c.setErr('Solo se pueden mandar fotos.');
    if (f.size > 15 * 1024 * 1024) return c.setErr('La foto es muy pesada.');
    const caption = text.trim();
    setText(''); setPanel('');
    queue(caption, f);
  };

  const del = (id: number) => {
    if (!confirm('¿Borrar este mensaje para todos?')) return;
    setSel(null);
    c.remove(id);
  };
  const copy = async (body: string) => {
    setSel(null);
    try { await navigator.clipboard.writeText(body); } catch { /* sin permiso */ }
  };
  const react = (m: Msg, emoji: string) => { setSel(null); c.react(m, emoji); };
  const reply = (m: Msg) => { setSel(null); setReplyTo(m); ta.current?.focus(); };
  const goTo = (id: number) => {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setFlash(id); setTimeout(() => setFlash(f => (f === id ? null : f)), 1400);
  };

  const onType = (v: string) => { setText(v); c.typed(v); };
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
  const days = byDay(msgs ?? []);

  const bubble = (m: Msg, first: boolean) => {
    const mine = m.author_id === meId;
    const p = byId.get(m.author_id) ?? GONE;
    const real = m.id > 0;
    const poll = polls[m.id];
    const jumbo = !poll && !m.image_url && !m.reply_to && isJumbo(m.body);
    const quoted = m.reply_to ? byMsg.get(m.reply_to) : undefined;
    const counts = reactionCounts(reacts[m.id]);
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
              ? <PollCard poll={poll} byProfile={votes[poll.id]} meId={meId} who={who} onVote={c.vote} meta={meta} />
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
            <button class="linkbtn" onClick={() => c.retry(m)}>Reintentar</button>
            <button class="linkbtn danger" onClick={() => c.discard(m)}>Descartar</button>
          </div>
        )}
        {sel === m.id && (
          <div class={`msg-menu${mine ? ' mine' : ''}`}>
            {c.reactOk && (
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
        <span><i class={`dot${c.online > 1 ? ' on' : ''}`} />{c.online === 0 ? 'Conectando…' : c.online === 1 ? 'Solo vos en línea' : `${c.online} en línea`}</span>
        <span>{rows.length} {rows.length === 1 ? 'miembro' : 'miembros'}</span>
      </div>
      {c.more && <button class="btn sm chat-more" disabled={c.loadingMore} onClick={c.loadOlder}>
        {c.loadingMore ? 'Cargando…' : 'Ver mensajes anteriores'}</button>}
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

      {pollOpen && <PollSheet onClose={() => setPollOpen(false)} onCreate={c.createPoll} />}

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
