import { useEffect, useState } from 'preact/hooks';
import { sb } from './supabase';
import { mapUrl, type Venue } from './maps';
import { NEW_VENUE, VENUE_COLS, draftValid, emptyDraft, loadVenues, pickVenue, type VenueDraft } from './venues';
import { VenueNewFields } from './VenueField';

const byName = (a: Venue, b: Venue) => a.name.localeCompare(b.name, 'es');

/**
 * Canchas de la comunidad para owner/admins: lista (nombre, dirección, mapa), alta pegando un link de Google Maps,
 * edición de nombre y dirección y borrado. Lo usan la pestaña Miembros y el asistente de armado.
 */
export function VenuesManager({ communityId, meId, onCount, openIfEmpty }: {
  communityId: string; meId: string;
  /** Avisa cuántas canchas hay (el asistente cambia "Después" por "Siguiente"). */
  onCount?: (n: number) => void;
  /** Con la lista vacía arranca con el formulario de alta abierto. */
  openIfEmpty?: boolean;
}) {
  const [venues, setVenues] = useState<Venue[] | null>(null);
  const [err, setErr] = useState('');
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<VenueDraft>(emptyDraft());
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<{ id: string; name: string; address: string } | null>(null);

  useEffect(() => {
    let alive = true;
    setVenues(null);
    loadVenues(communityId)
      .then(v => { if (!alive) return; setVenues(v); if (openIfEmpty && !v.length) setAdding(true); })
      .catch((e: any) => { if (alive) { setVenues([]); setErr(e?.message ?? 'No pudimos cargar las canchas.'); } });
    return () => { alive = false; };
  }, [communityId]);
  useEffect(() => { if (venues) onCount?.(venues.length); }, [venues?.length]);

  const put = (v: Venue) => setVenues(x => [...(x ?? []).filter(y => y.id !== v.id), v].sort(byName));

  const add = async () => {
    if (!draftValid(draft) || busy) return;
    setBusy(true); setErr('');
    const p = await pickVenue(NEW_VENUE, draft, venues ?? [], communityId, meId);
    setBusy(false);
    if ('error' in p) return setErr(p.error);
    if (p.created) put(p.created);
    setDraft(emptyDraft()); setAdding(false);
  };

  const saveEdit = async () => {
    if (!edit || busy) return;
    const name = edit.name.trim(), address = edit.address.trim();
    if (!name || name.length > 80 || address.length > 160) return;
    setBusy(true); setErr('');
    const r = await sb.from('venues').update({ name, address: address || null }).eq('id', edit.id).select(VENUE_COLS).maybeSingle();
    setBusy(false);
    if (r.error || !r.data) return setErr(r.error?.message ?? 'No se pudo guardar la cancha (puede que ya la hayan sacado).');
    put(r.data as Venue); setEdit(null);
  };

  const del = async (v: Venue) => {
    if (!confirm(`¿Borrar la cancha "${v.name}"? Los partidos que la usan conservan el nombre como lugar.`)) return;
    setErr('');
    const r = await sb.from('venues').delete().eq('id', v.id).select('id');
    if (r.error || !r.data?.length) return setErr(r.error?.message ?? 'No se pudo borrar la cancha (puede que ya la hayan sacado).');
    setVenues(x => (x ?? []).filter(y => y.id !== v.id));
    if (edit?.id === v.id) setEdit(null);
  };

  return (
    <div class="ven">
      {venues === null && <p class="muted">Cargando canchas…</p>}
      {venues && venues.length === 0 && !adding && (
        <p class="muted ven-empty">Todavía no cargaste ninguna cancha. Pegá el link de Google Maps y listo.</p>
      )}
      {venues && venues.map(v => (
        edit?.id === v.id
          ? (
            <div class="venue-row ven-edit">
              <label class="field"><span>Nombre</span>
                <input value={edit.name} maxLength={80} onInput={e => setEdit({ ...edit, name: (e.target as HTMLInputElement).value })} /></label>
              <label class="field"><span>Dirección (opcional)</span>
                <input value={edit.address} maxLength={160} placeholder="Calle y número, barrio…"
                  onInput={e => setEdit({ ...edit, address: (e.target as HTMLInputElement).value })} /></label>
              <div class="ven-btns">
                <button class="btn primary" disabled={busy || !edit.name.trim()} onClick={saveEdit}>{busy ? 'Guardando…' : 'Guardar'}</button>
                <button class="btn" disabled={busy} onClick={() => setEdit(null)}>Cancelar</button>
              </div>
            </div>
          )
          : (
            <div class="row venue-row ven-row">
              <div class="ven-main">
                <b class="ellipsis" style="display:block">{v.name}</b>
                {v.address && <div class="muted ellipsis" style="font-size:.85rem">{v.address}</div>}
                <a href={mapUrl(v)} target="_blank" rel="noopener" style="font-size:.85rem">Ver en el mapa</a>
              </div>
              <div class="mem-acts">
                <button class="btn sm" aria-label={`Editar la cancha ${v.name}`} onClick={() => setEdit({ id: v.id, name: v.name, address: v.address ?? '' })}>Editar</button>
                <button class="btn sm danger" aria-label={`Borrar la cancha ${v.name}`} onClick={() => del(v)}>Borrar</button>
              </div>
            </div>
          )
      ))}

      {adding
        ? (
          <div class="ven-new">
            <VenueNewFields draft={draft} onDraft={setDraft} />
            <div class="ven-btns">
              <button class="btn primary" disabled={busy || !draftValid(draft)} onClick={add}>{busy ? 'Guardando…' : 'Guardar cancha'}</button>
              <button class="btn" disabled={busy} onClick={() => { setAdding(false); setDraft(emptyDraft()); }}>Cancelar</button>
            </div>
          </div>
        )
        : venues && <button class="btn block ven-add" onClick={() => { setAdding(true); setEdit(null); }}>➕ Agregar cancha</button>}
      {err && <p class="err" role="alert">{err}</p>}
    </div>
  );
}

/** La misma lista, en una tarjeta con título (pestaña Miembros, solo admins). */
export function VenuesCard({ communityId, meId }: { communityId: string; meId: string }) {
  return (
    <div class="card ven-card">
      <h3 style="margin-bottom:4px">Canchas</h3>
      <p class="muted adm-note">Las elegís al armar un partido. Pegá el link de Google Maps y se completa solo.</p>
      <VenuesManager communityId={communityId} meId={meId} />
    </div>
  );
}
