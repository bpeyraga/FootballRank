import { useEffect, useState } from 'preact/hooks';
import { sb } from '../lib/supabase';
import { go } from '../lib/router';

export interface Match {
  id: string; community_id: string; title: string; starts_at: string; location: string | null;
  slots: number; status: 'open' | 'closed' | 'played' | 'cancelled';
  score_a: number | null; score_b: number | null; created_by: string;
}

export const fmtDate = (iso: string) => new Date(iso).toLocaleString('es-AR',
  { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export const STATUS: Record<Match['status'], string> =
  { open: 'Inscripción abierta', closed: 'Lista cerrada', played: 'Jugado', cancelled: 'Cancelado' };

/** Una lista abierta se cierra sola cuando llega la hora del partido (lo hace también el servidor al anotarse). */
export const statusLabel = (m: Pick<Match, 'status' | 'starts_at'>) =>
  m.status === 'open' && new Date(m.starts_at) <= new Date() ? 'Lista cerrada (ya empezó)' : STATUS[m.status];

/** Lista de próximos e historial; los admins crean convocatorias. */
export function Matches({ communityId, slug, meId, isAdmin }:
  { communityId: string; slug: string; meId: string; isAdmin: boolean }) {
  const [list, setList] = useState<(Match & { taken: number; mine: string | null })[] | null>(null);
  const [form, setForm] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      const m = await sb.from('matches').select('*, match_signups(profile_id,status)')
        .eq('community_id', communityId).order('starts_at', { ascending: false }).limit(100);
      if (m.error) return setErr(m.error.message);
      setList((m.data ?? []).map((x: any) => ({
        ...x,
        taken: x.match_signups.filter((s: any) => s.status === 'in').length,
        mine: x.match_signups.find((s: any) => s.profile_id === meId && s.status !== 'out')?.status ?? null,
      })));
    })();
  }, [communityId]);

  const now = Date.now() - 3 * 3600e3; // un partido sigue "próximo" hasta 3 h después de empezar
  const upcoming = (list ?? []).filter(m => m.status !== 'played' && m.status !== 'cancelled' && +new Date(m.starts_at) > now).reverse();
  const past = (list ?? []).filter(m => !upcoming.includes(m));

  const Item = ({ m }: { m: (typeof upcoming)[number] }) => (
    <a class="card row" style="color:inherit;text-decoration:none" href={`#/c/${slug}/m/${m.id}`}>
      <div style="flex:1;min-width:0">
        <b class="ellipsis" style="display:block">{m.title}</b>
        <div class="muted" style="font-size:.85rem">{fmtDate(m.starts_at)}{m.location ? ` · ${m.location}` : ''}</div>
        <div style="font-size:.85rem">
          {m.status === 'played' && m.score_a != null ? `Resultado ${m.score_a} – ${m.score_b}` : statusLabel(m)}
          {m.mine === 'in' && <span class="pill">Anotado</span>}
          {m.mine === 'waitlist' && <span class="pill warn">En espera</span>}
        </div>
      </div>
      {m.status !== 'played' && m.status !== 'cancelled' &&
        <span class={`slots ${m.taken >= m.slots ? 'full' : ''}`}>{m.taken}/{m.slots}</span>}
    </a>
  );

  return (
    <>
      {isAdmin && (form
        ? <NewMatch communityId={communityId} meId={meId} slug={slug} cancel={() => setForm(false)} />
        : <button class="btn primary block" style="margin-bottom:12px" onClick={() => setForm(true)}>+ Nueva convocatoria</button>)}
      {err && <p class="err">{err}</p>}
      {list === null && !err && <p class="muted">Cargando…</p>}
      <h3 style="margin:4px 0 8px">Próximos</h3>
      {list && !upcoming.length && <p class="muted" style="margin-bottom:12px">No hay partidos convocados.</p>}
      {upcoming.map(m => <Item m={m} />)}
      {past.length > 0 && <h3 style="margin:16px 0 8px">Historial</h3>}
      {past.map(m => <Item m={m} />)}
    </>
  );
}

function NewMatch({ communityId, meId, slug, cancel }: { communityId: string; meId: string; slug: string; cancel: () => void }) {
  const d = new Date(); d.setDate(d.getDate() + ((4 - d.getDay() + 7) % 7 || 7)); d.setHours(21, 0, 0, 0); // próximo jueves 21 h
  const local = (x: Date) => new Date(x.getTime() - x.getTimezoneOffset() * 60e3).toISOString().slice(0, 16);
  const [f, setF] = useState({ title: 'Partido', when: local(d), location: '', slots: 10 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: keyof typeof f) => (e: Event) => {
    const v = (e.target as HTMLInputElement).value;
    setF({ ...f, [k]: k === 'slots' ? +v : v });
  };
  const save = async () => {
    setBusy(true); setErr('');
    const { data, error } = await sb.from('matches').insert({
      community_id: communityId, created_by: meId, title: f.title.trim(),
      starts_at: new Date(f.when).toISOString(), location: f.location.trim() || null, slots: f.slots,
    }).select('id').single();
    setBusy(false);
    if (error) setErr(error.message); else go(`c/${slug}/m/${data.id}`);
  };
  return (
    <div class="card">
      <h3 style="margin-bottom:12px">Nueva convocatoria</h3>
      <label class="field"><span>Título</span><input value={f.title} maxLength={80} onInput={set('title')} /></label>
      <label class="field"><span>Fecha y hora</span><input type="datetime-local" value={f.when} onInput={set('when')} /></label>
      <label class="field"><span>Lugar</span><input value={f.location} placeholder="Cancha, dirección…" onInput={set('location')} /></label>
      <label class="field"><span>Cupos</span><input type="number" min={2} max={40} value={f.slots} onInput={set('slots')} /></label>
      <div class="row">
        <button class="btn primary" disabled={busy || !f.title.trim() || !f.when || f.slots < 2 || f.slots > 40} onClick={save}>
          {busy ? 'Creando…' : 'Crear'}
        </button>
        <button class="btn" onClick={cancel}>Cancelar</button>
      </div>
      {err && <p class="err">{err}</p>}
    </div>
  );
}
