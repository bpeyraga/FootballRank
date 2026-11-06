import { useEffect, useRef, useState } from 'preact/hooks';
import { sb } from '../lib/supabase';
import { Avatar } from '../lib/Avatar';
import type { Ranked } from '../lib/ranking';

interface Msg { id: number; author_id: string; body: string; created_at: string }
const COLS = 'id,author_id,body,created_at';
const GONE = { name: 'Ex miembro', photo_url: null };

const when = (iso: string) => {
  const d = new Date(iso);
  const today = d.toDateString() === new Date().toDateString();
  return d.toLocaleString('es-AR', today
    ? { hour: '2-digit', minute: '2-digit' }
    : { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

export function Chat({ communityId, rows, meId, isAdmin }:
  { communityId: string; rows: Ranked[]; meId: string; isAdmin: boolean }) {
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const box = useRef<HTMLDivElement>(null);

  const add = (m: Msg) => setMsgs(prev => !prev || prev.some(x => x.id === m.id) ? prev : [...prev, m]);

  useEffect(() => {
    sb.from('messages').select(COLS).eq('community_id', communityId)
      .order('created_at', { ascending: false }).limit(100)
      .then(({ data, error }) => { if (error) setErr(error.message); else setMsgs(((data ?? []) as Msg[]).reverse()); });
    const ch = sb.channel(`chat-${communityId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `community_id=eq.${communityId}` },
        p => add(p.new as Msg))
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [communityId]);

  useEffect(() => { const b = box.current; if (b) b.scrollTop = b.scrollHeight; }, [msgs?.length]);

  const send = async (e: Event) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true); setErr('');
    const { data, error } = await sb.from('messages')
      .insert({ community_id: communityId, author_id: meId, body }).select(COLS).single();
    setBusy(false);
    if (error) setErr(error.message); else { setText(''); add(data as Msg); }
  };

  const del = async (id: number) => {
    if (!confirm('¿Borrar este mensaje?')) return;
    const { error } = await sb.from('messages').delete().eq('id', id);
    if (error) setErr(error.message); else setMsgs(prev => prev && prev.filter(m => m.id !== id));
  };

  const byId = new Map(rows.map(r => [r.profile.id, r.profile]));

  return <>
    <div class="card chat" ref={box}>
      {msgs === null && !err && <p class="muted">Cargando…</p>}
      {msgs?.length === 0 && <p class="muted">Todavía no hay mensajes. ¡Arrancá la charla!</p>}
      {msgs?.map((m, i) => {
        const mine = m.author_id === meId;
        const p = byId.get(m.author_id) ?? GONE;
        const first = i === 0 || msgs[i - 1].author_id !== m.author_id;
        return (
          <div class={`msg${mine ? ' mine' : ''}`} key={m.id}>
            {!mine && (first ? <Avatar p={p} size={28} /> : <span style="width:28px;flex:none" />)}
            <div class="bubble">
              {!mine && first && <b class="ellipsis">{p.name}</b>}
              <p>{m.body}</p>
              <small class="muted">
                {when(m.created_at)}
                {(mine || isAdmin) && <button class="linkbtn" onClick={() => del(m.id)}>Borrar</button>}
              </small>
            </div>
          </div>
        );
      })}
    </div>
    <form class="row chat-form" onSubmit={send}>
      <input value={text} maxLength={500} placeholder="Escribí un mensaje…" enterKeyHint="send"
        onInput={e => setText((e.target as HTMLInputElement).value)} />
      <button class="btn primary" disabled={busy || !text.trim()}>Enviar</button>
    </form>
    {err && <p class="err">{err}</p>}
  </>;
}
