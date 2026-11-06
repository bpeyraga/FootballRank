import { useEffect, useMemo, useState } from 'preact/hooks';
import { Tip } from '../../shared/ui/Tip';
import { go } from '../../app/router';
import { mapUrl, type Venue } from '../venues/maps';
import { NEW_VENUE, draftValid, emptyDraft } from '../venues/venues';
import { deleteVenue, loadVenues, pickVenue } from '../venues/api';
import { VenueField } from '../venues/VenueField';
import type { Ranked } from '../ranking/ranking';
import { debtsOf } from './fees';
import { createMatch, loadMatchList, loadProfileNames, type ProfileName } from './api';
import { fmtDate, splitUpcoming, statusLabel, type MatchListItem } from './model';
import { SchedulesSection } from './ScheduleCard';
import { DebtsCard } from './DebtsCard';
import { Loading, page } from '../../app/lazy';
const QuickMatch = page(() => import('./QuickMatchPage'), m => m.QuickMatch);

const byName = (a: Venue, b: Venue) => a.name.localeCompare(b.name, 'es');

/** Lista de próximos e historial; los admins crean convocatorias y administran las canchas. */
export function Matches({ communityId, slug, meId, isAdmin, rows }:
  { communityId: string; slug: string; meId: string; isAdmin: boolean; rows?: Ranked[] }) {
  const [list, setList] = useState<MatchListItem[] | null>(null);
  const [names, setNames] = useState<Map<string, ProfileName>>(new Map()); // quién es quién en las deudas (si no vienen `rows`)
  const [venues, setVenues] = useState<Venue[]>([]);
  const [form, setForm] = useState(false);
  const [quick, setQuick] = useState(false); // "Cargar partido jugado"
  const [err, setErr] = useState('');
  const [venueErr, setVenueErr] = useState('');

  // absent y paid_at vienen en la misma consulta: de ahí salen las deudas sin pedir nada más.
  const loadList = async () => {
    try { setList(await loadMatchList(communityId, meId)); setErr(''); }
    catch (e: any) { setErr(e?.message ?? 'Error de red'); }
  };
  useEffect(() => { loadList(); }, [communityId]);

  // Deudas de la cancha: partidos jugados con cuota donde alguien anotado (y presente) no marcó "pagué".
  const debts = useMemo(() => debtsOf((list ?? []).map(m => ({
    id: m.id, title: m.title, starts_at: m.starts_at, status: m.status, fee_total: m.fee_total ?? null, signups: m.match_signups,
  }))), [list]);
  const debtKey = isAdmin ? debts.map(d => d.profile_id).join() : '';
  useEffect(() => {
    // Los admins necesitan los nombres de los deudores: de `rows` si vienen; si no, una consulta chica.
    if (!isAdmin || !debtKey || rows) return;
    const ids = debtKey.split(',').filter(id => !names.has(id));
    if (!ids.length) return;
    loadProfileNames(ids).then(ps => {
      if (ps.length) setNames(x => new Map([...x, ...ps.map(p => [p.id, p] as const)]));
    }, () => { /* sin nombres: la tarjeta muestra lo que tenga */ });
  }, [debtKey, isAdmin, !!rows]);
  const whoIs = (pid: string) => rows?.find(r => r.profile.id === pid)?.profile ?? names.get(pid);

  // Las canchas solo las usan los admins (para elegirlas y borrarlas); los demás las ven en la pantalla del partido.
  useEffect(() => {
    if (!isAdmin) return;
    loadVenues(communityId).then(setVenues).catch((e: any) => setVenueErr(e?.message ?? 'No pudimos cargar las canchas.'));
  }, [communityId, isAdmin]);

  const addVenue = (v: Venue) => setVenues(x => [...x.filter(y => y.id !== v.id), v].sort(byName));
  const delVenue = async (v: Venue) => {
    if (!confirm(`¿Borrar la cancha "${v.name}"? Los partidos que la usan conservan el nombre como lugar.`)) return;
    setVenueErr('');
    let gone: boolean;
    try { gone = await deleteVenue(v.id); } catch (e: any) { return setVenueErr(e?.message ?? 'Error de red'); }
    if (!gone) return setVenueErr('No se pudo borrar la cancha (puede que ya la hayan sacado).');
    setVenues(x => x.filter(y => y.id !== v.id));
  };

  const { upcoming, past } = splitUpcoming(list ?? []); // un partido sigue "próximo" hasta 3 h después de empezar
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
      <Tip />
      {list && <DebtsCard debts={debts} meId={meId} isAdmin={isAdmin} slug={slug} whoIs={whoIs} />}
      <SchedulesSection communityId={communityId} meId={meId} isAdmin={isAdmin} venues={venues} defaultVenue={lastVenue}
        addVenue={addVenue} onChanged={loadList} />
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
    try {
      const id = await createMatch({
        communityId, meId, title: f.title.trim(), startsAt: new Date(f.when).toISOString(), slots: f.slots,
        venueId: p.id, location: p.name ?? (f.location.trim() || null), // location lleva el nombre de la cancha: avisos y compartir lo usan
      });
      go(`c/${slug}/m/${id}`);
    } catch (e: any) { setErr(e?.message ?? 'Error de red'); }
    setBusy(false);
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
