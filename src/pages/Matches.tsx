import { useEffect, useState } from 'preact/hooks';
import { sb } from '../lib/supabase';
import { go } from '../lib/router';
import { mapUrl, type Venue } from '../lib/maps';
import { NEW_VENUE, draftValid, emptyDraft, loadVenues, pickVenue } from '../lib/venues';
import { VenueField } from '../lib/VenueField';
import type { Ranked } from '../lib/ranking';
import { Loading, page } from '../lib/lazy';
const QuickMatch = page(() => import('./QuickMatch'), m => m.QuickMatch);

export interface Match {
  id: string; community_id: string; title: string; starts_at: string; location: string | null;
  slots: number; status: 'open' | 'closed' | 'played' | 'cancelled';
  score_a: number | null; score_b: number | null; created_by: string;
  venue_id: string | null; venue?: Venue | null; // `venue` solo viene cuando se pide con select('*, venue:venues(...)')
}

export const fmtDate = (iso: string) => new Date(iso).toLocaleString('es-AR',
  { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export const STATUS: Record<Match['status'], string> =
  { open: 'Inscripción abierta', closed: 'Lista cerrada', played: 'Jugado', cancelled: 'Cancelado' };

/** Una lista abierta se cierra sola cuando llega la hora del partido (lo hace también el servidor al anotarse). */
export const statusLabel = (m: Pick<Match, 'status' | 'starts_at'>) =>
  m.status === 'open' && new Date(m.starts_at) <= new Date() ? 'Lista cerrada (ya empezó)' : STATUS[m.status];

const byName = (a: Venue, b: Venue) => a.name.localeCompare(b.name, 'es');

/** Lista de próximos e historial; los admins crean convocatorias y administran las canchas. */
export function Matches({ communityId, slug, meId, isAdmin, rows }:
  { communityId: string; slug: string; meId: string; isAdmin: boolean; rows?: Ranked[] }) {
  const [list, setList] = useState<(Match & { taken: number; mine: string | null })[] | null>(null);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [form, setForm] = useState(false);
  const [quick, setQuick] = useState(false); // "Cargar partido jugado"
  const [err, setErr] = useState('');
  const [venueErr, setVenueErr] = useState('');

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

  // Las canchas solo las usan los admins (para elegirlas y borrarlas); los demás las ven en la pantalla del partido.
  useEffect(() => {
    if (!isAdmin) return;
    loadVenues(communityId).then(setVenues).catch((e: any) => setVenueErr(e?.message ?? 'No pudimos cargar las canchas.'));
  }, [communityId, isAdmin]);

  const addVenue = (v: Venue) => setVenues(x => [...x.filter(y => y.id !== v.id), v].sort(byName));
  const delVenue = async (v: Venue) => {
    if (!confirm(`¿Borrar la cancha "${v.name}"? Los partidos que la usan conservan el nombre como lugar.`)) return;
    setVenueErr('');
    const r = await sb.from('venues').delete().eq('id', v.id).select('id');
    if (r.error || !r.data?.length) return setVenueErr(r.error?.message ?? 'No se pudo borrar la cancha (puede que ya la hayan sacado).');
    setVenues(x => x.filter(y => y.id !== v.id));
  };

  const now = Date.now() - 3 * 3600e3; // un partido sigue "próximo" hasta 3 h después de empezar
  const upcoming = (list ?? []).filter(m => m.status !== 'played' && m.status !== 'cancelled' && +new Date(m.starts_at) > now).reverse();
  const past = (list ?? []).filter(m => !upcoming.includes(m));
  const lastVenue = (list ?? []).find(m => m.venue_id && venues.some(v => v.id === m.venue_id))?.venue_id ?? ''; // la cancha del último partido

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

  // Cargar un partido ya jugado: pantalla propia, de una sola vez (reemplaza a la lista mientras se carga).
  if (isAdmin && quick) {
    return <Loading><QuickMatch communityId={communityId} meId={meId} slug={slug} venues={venues} defaultVenue={lastVenue}
      addVenue={addVenue} cancel={() => setQuick(false)} rows={rows} /></Loading>;
  }

  return (
    <>
      {isAdmin && (form
        ? <NewMatch communityId={communityId} meId={meId} slug={slug} venues={venues} defaultVenue={lastVenue}
            addVenue={addVenue} cancel={() => setForm(false)} />
        : <div class="qm-actions">
            <button class="btn primary" onClick={() => setForm(true)}>+ Nueva convocatoria</button>
            <button class="btn" onClick={() => setQuick(true)}>Cargar partido jugado</button>
          </div>)}
      {err && <p class="err">{err}</p>}
      {list === null && !err && <p class="muted">Cargando…</p>}
      <h3 style="margin:4px 0 8px">Próximos</h3>
      {list && !upcoming.length && <p class="muted" style="margin-bottom:12px">No hay partidos convocados.</p>}
      {upcoming.map(m => <Item m={m} />)}
      {past.length > 0 && <h3 style="margin:16px 0 8px">Historial</h3>}
      {past.map(m => <Item m={m} />)}

      {isAdmin && (venues.length > 0 || venueErr) && (
        <details class="card venues-card">
          <summary>Canchas ({venues.length})</summary>
          {venues.map(v => (
            <div class="row venue-row">
              <div style="flex:1;min-width:0">
                <b class="ellipsis" style="display:block">{v.name}</b>
                <a href={mapUrl(v)} target="_blank" rel="noopener" style="font-size:.85rem">Ver en el mapa</a>
              </div>
              <button class="btn sm danger" onClick={() => delVenue(v)} aria-label={`Borrar la cancha ${v.name}`}>Borrar</button>
            </div>
          ))}
          {venueErr && <p class="err">{venueErr}</p>}
        </details>
      )}
    </>
  );
}

function NewMatch({ communityId, meId, slug, venues, defaultVenue, addVenue, cancel }: {
  communityId: string; meId: string; slug: string; venues: Venue[]; defaultVenue: string;
  addVenue: (v: Venue) => void; cancel: () => void;
}) {
  const d = new Date(); d.setDate(d.getDate() + ((4 - d.getDay() + 7) % 7 || 7)); d.setHours(21, 0, 0, 0); // próximo jueves 21 h
  const local = (x: Date) => new Date(x.getTime() - x.getTimezoneOffset() * 60e3).toISOString().slice(0, 16);
  const [f, setF] = useState({ title: 'Partido', when: local(d), location: '', slots: 10 });
  const [venue, setVenue] = useState(defaultVenue);
  const [draft, setDraft] = useState(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: keyof typeof f) => (e: Event) => {
    const v = (e.target as HTMLInputElement).value;
    setF({ ...f, [k]: k === 'slots' ? +v : v });
  };
  const save = async () => {
    setBusy(true); setErr('');
    // Cancha nueva: se guarda primero; si el partido falla, queda elegida y un reintento no la duplica.
    const p = await pickVenue(venue, draft, venues, communityId, meId);
    if ('error' in p) { setBusy(false); return setErr(p.error); }
    if (p.created) { addVenue(p.created); setVenue(p.created.id); }
    const { data, error } = await sb.from('matches').insert({
      community_id: communityId, created_by: meId, title: f.title.trim(),
      starts_at: new Date(f.when).toISOString(), slots: f.slots,
      venue_id: p.id, location: p.name ?? (f.location.trim() || null), // location lleva el nombre de la cancha: avisos y compartir lo usan
    }).select('id').single();
    setBusy(false);
    if (error) setErr(error.message); else go(`c/${slug}/m/${data.id}`);
  };
  return (
    <div class="card">
      <h3 style="margin-bottom:12px">Nueva convocatoria</h3>
      <label class="field"><span>Título</span><input value={f.title} maxLength={80} onInput={set('title')} /></label>
      <label class="field"><span>Fecha y hora</span><input type="datetime-local" value={f.when} onInput={set('when')} /></label>
      <VenueField venues={venues} value={venue} onChange={setVenue} draft={draft} onDraft={setDraft} />
      {!venue && <label class="field"><span>Lugar</span><input value={f.location} maxLength={200} placeholder="Cancha, dirección…" onInput={set('location')} /></label>}
      <label class="field"><span>Cupos</span><input type="number" min={2} max={40} value={f.slots} onInput={set('slots')} /></label>
      <div class="row">
        <button class="btn primary" disabled={busy || !f.title.trim() || !f.when || f.slots < 2 || f.slots > 40 || (venue === NEW_VENUE && !draftValid(draft))} onClick={save}>
          {busy ? 'Creando…' : 'Crear'}
        </button>
        <button class="btn" onClick={cancel}>Cancelar</button>
      </div>
      {err && <p class="err">{err}</p>}
    </div>
  );
}
