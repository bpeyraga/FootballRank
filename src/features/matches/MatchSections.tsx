// Tarjetas de la pantalla del partido: solo dibujan y avisan con callbacks (no llaman a la base).
import { useEffect, useState } from 'preact/hooks';
import { displayName, type Profile } from '../../shared/supabase';
import { Avatar } from '../../shared/ui/Avatar';
import type { EventKind, MatchEvent } from '../stats/stats';
import { EventRows, EventSummary, type EvPlayer } from './EventSteppers';
import { eventCounts } from './quickMatch';
import type { Venue } from '../venues/maps';
import { NEW_VENUE, draftValid, emptyDraft, pickVenue } from '../venues/venues';
import { VenueField } from '../venues/VenueField';
import type { Match as M } from './model';

/** valor para <input type="datetime-local"> (hora local) a partir de un instante ISO */
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60e3).toISOString().slice(0, 16);
};

/** Edición de título, fecha, cancha/lugar y cupos (admins). Si bajan los cupos, el servidor manda a los últimos a la lista de espera. */
export function EditMatch({ m, meId, venues, addVenue, busy, onSave, onCancel }: {
  m: M; meId: string; venues: Venue[]; addVenue: (v: Venue) => void; busy: boolean; onCancel: () => void;
  onSave: (v: { title: string; startsAt: string; location: string; slots: number; venueId: string | null }) => Promise<string>;
}) {
  const [f, setF] = useState({ title: m.title, when: toLocalInput(m.starts_at), location: m.location ?? '', slots: String(m.slots) });
  const [venue, setVenue] = useState(m.venue_id && venues.some(v => v.id === m.venue_id) ? m.venue_id : '');
  const [draft, setDraft] = useState(emptyDraft);
  const [picking, setPicking] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: keyof typeof f) => (e: Event) => setF({ ...f, [k]: (e.target as HTMLInputElement).value });
  const slots = Math.round(+f.slots);
  const valid = f.title.trim().length > 0 && !isNaN(+new Date(f.when)) && f.when !== '' && slots >= 2 && slots <= 40
    && (venue !== NEW_VENUE || draftValid(draft));
  const save = async () => {
    setErr(''); setPicking(true);
    // Cancha nueva: se guarda primero; si después falla el partido, queda elegida y un reintento no la duplica.
    const p = await pickVenue(venue, draft, venues, m.community_id, meId);
    setPicking(false);
    if ('error' in p) return setErr(p.error);
    if (p.created) { addVenue(p.created); setVenue(p.created.id); }
    // location lleva el nombre de la cancha: los avisos y el texto de compartir lo usan
    setErr(await onSave({ title: f.title.trim(), startsAt: f.when, location: p.name ?? f.location.trim(), slots, venueId: p.id }));
  };
  return (
    <div class="card adm-card">
      <h3 style="margin-bottom:12px">Editar partido</h3>
      <label class="field"><span>Título</span><input value={f.title} maxLength={80} onInput={set('title')} /></label>
      <label class="field"><span>Fecha y hora</span><input type="datetime-local" value={f.when} onInput={set('when')} /></label>
      <VenueField venues={venues} value={venue} onChange={setVenue} draft={draft} onDraft={setDraft} />
      {!venue && <label class="field"><span>Lugar</span><input value={f.location} maxLength={200} placeholder="Cancha, dirección…" onInput={set('location')} /></label>}
      <label class="field"><span>Cupos</span><input type="number" min={2} max={40} inputMode="numeric" value={f.slots} onInput={set('slots')} /></label>
      <p class="muted adm-note">Si subís los cupos, entran los primeros de la lista de espera. Si los bajás, los últimos en anotarse pasan a la lista de espera.</p>
      <div class="row">
        <button class="btn primary" disabled={busy || picking || !valid} onClick={save}>{busy || picking ? 'Guardando…' : 'Guardar cambios'}</button>
        <button class="btn" disabled={busy || picking} onClick={onCancel}>Cancelar</button>
      </div>
      {err && <p class="err">{err}</p>}
    </div>
  );
}

/** Goles, asistencias y tarjetas: los admins los cargan con − / + por jugador; los demás ven un resumen. */
export function MatchEvents({ events, err, isAdmin, players, nameOf, teamOf, onStep }: {
  events: MatchEvent[] | null; err: string; isAdmin: boolean;
  players: EvPlayer[]; nameOf: (pid: string) => string; teamOf: (pid: string) => 'A' | 'B' | null;
  onStep: (pid: string, kind: EventKind, dir: 1 | -1) => void;
}) {
  const counts = eventCounts(events ?? []);
  return (
    <div class="card">
      <h3>Goles y tarjetas</h3>
      {events == null && !err && <p class="muted" style="margin-top:8px">Cargando…</p>}
      {err && <p class="err">{err}</p>}
      {events != null && isAdmin && (players.length
        ? <>
            <p class="muted" style="margin:6px 0 8px;font-size:.85rem">Tocá + o − para sumar o sacar. ⚽ goles · 👟 asistencias · 🟨 amarilla · 🟥 roja</p>
            <EventRows players={players} counts={counts} onStep={onStep} />
          </>
        : <p class="muted" style="margin-top:8px">No hay jugadores anotados.</p>)}
      {events != null && !isAdmin && (events.length
        ? <EventSummary events={events} nameOf={nameOf} teamOf={teamOf} />
        : <p class="muted" style="margin-top:8px">Todavía no hay goles ni tarjetas cargados.</p>)}
    </div>
  );
}

export function RateTeammates({ mates, initial, busy, save }:
  { mates: Profile[]; initial: Record<string, number>; busy: boolean; save: (s: Record<string, number>) => void }) {
  const [sc, setSc] = useState<Record<string, number>>(initial);
  useEffect(() => setSc(initial), [initial]);
  if (!mates.length) return null;
  const done = Object.keys(initial).length > 0;
  const missing = mates.filter(p => initial[p.id] == null).length;
  return (
    <div class="card">
      <h3 style="margin-bottom:4px">Calificá a tu equipo</h3>
      <p class="muted" style="margin-bottom:8px">Todos califican a todos sus compañeros: del 1 al 10, ¿cómo jugó cada uno hoy?</p>
      {missing > 0 && <p class="note-inline">Te {missing === 1 ? 'falta' : 'faltan'} calificar <b>{missing}</b> {missing === 1 ? 'compañero' : 'compañeros'}.</p>}
      {mates.map(p => (
        <div class="rank-row">
          <div class="row"><Avatar p={p} size={32} /><span style="flex:1">{displayName(p)}</span><b>{sc[p.id] ?? '—'}</b></div>
          <div class="rate">
            {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
              <button class={sc[p.id] === n ? 'on' : ''} onClick={() => setSc({ ...sc, [p.id]: n })} aria-label={`${displayName(p)}: ${n}`}>{n}</button>
            ))}
          </div>
        </div>
      ))}
      <button class="btn primary block" style="margin-top:12px" disabled={busy || !Object.keys(sc).length} onClick={() => save(sc)}>
        {done ? 'Actualizar calificaciones' : 'Enviar calificaciones'}
      </button>
    </div>
  );
}

export function MvpVote({ canVote, meId, mine, tally, players, busy, vote }: {
  canVote: boolean; meId: string; mine: string | null; tally: Map<string, number>; busy: boolean;
  players: { p: Profile; team: 'A' | 'B' }[]; vote: (pid: string) => void;
}) {
  const [sel, setSel] = useState<string | null>(mine);
  useEffect(() => setSel(mine), [mine]);
  const total = [...tally.values()].reduce((a, b) => a + b, 0);
  const top = Math.max(0, ...tally.values());
  const winners = players.filter(x => top > 0 && tally.get(x.p.id) === top);
  const options = players.filter(x => x.p.id !== meId);
  return (
    <div class="card">
      <h3 style="margin-bottom:4px">🏆 MVP del partido</h3>
      {winners.length > 0
        ? <p style="margin-bottom:8px"><b>{winners.map(w => displayName(w.p)).join(' y ')}</b>
            <span class="muted"> · {top} de {total} {total === 1 ? 'voto' : 'votos'}{winners.length > 1 ? ' (empate)' : ''}</span></p>
        : <p class="muted" style="margin-bottom:8px">Todavía nadie votó.</p>}
      {canVote ? <>
        <p class="muted" style="margin-bottom:8px">
          {mine ? 'Ya votaste, podés cambiar tu voto.' : 'Elegí al mejor de la cancha. Acá sí vale votar a uno del equipo contrario.'}
        </p>
        {(['A', 'B'] as const).map(t => {
          const ps = options.filter(x => x.team === t);
          return ps.length > 0 && <div class={`team ${t}`} style="padding-left:8px;margin-bottom:8px">
            <b class={t === 'A' ? 'ta' : 'tb'} style="font-size:.85rem">Equipo {t}</b>
            {ps.map(({ p }) => (
              <button type="button" class={`row rank-row mvp-opt${sel === p.id ? ' on' : ''}`} onClick={() => setSel(p.id)} aria-pressed={sel === p.id}>
                <Avatar p={p} size={28} /><span class="ellipsis" style="flex:1;text-align:left">{displayName(p)}</span>
                {tally.get(p.id) ? <span class="muted">{tally.get(p.id)}</span> : null}
                <span aria-hidden="true">{sel === p.id ? '🏆' : ''}</span>
              </button>
            ))}
          </div>;
        })}
        <button class="btn primary block" disabled={busy || !sel || sel === mine} onClick={() => sel && vote(sel)}>
          {mine ? 'Cambiar mi voto' : 'Votar MVP'}
        </button>
      </> : <p class="muted">Votan los que jugaron el partido.</p>}
    </div>
  );
}
