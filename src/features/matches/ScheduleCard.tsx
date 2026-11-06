import { useEffect, useState } from 'preact/hooks';
import { sb } from '../../shared/supabase';
import type { Venue } from '../venues/maps';
import { NEW_VENUE, draftValid, emptyDraft, pickVenue } from '../venues/venues';
import { VenueField } from '../venues/VenueField';
import {
  SCHEDULE_COLS, WEEKDAY_CHIPS, emptyScheduleForm, formError, formOf, memberLine, opensText, previewText, scheduleError,
  scheduleLine, schedulePayload, type Schedule, type ScheduleForm,
} from './schedule';

const byTime = (a: Schedule, b: Schedule) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7) || a.at_time.localeCompare(b.at_time); // de lunes a domingo

/**
 * Partido fijo semanal. Los admins ven una tarjeta por horario (editar, pausar, borrar) y arman otros;
 * los demás ven una línea de solo lectura. Al guardar o reactivar, el servidor crea la convocatoria que toque:
 * `onChanged` le avisa a la lista de partidos para que se vuelva a leer.
 */
export function SchedulesSection({ communityId, meId, isAdmin, venues, defaultVenue, addVenue, onChanged }: {
  communityId: string; meId: string; isAdmin: boolean; venues: Venue[]; defaultVenue: string;
  addVenue: (v: Venue) => void; onChanged: () => void;
}) {
  const [list, setList] = useState<Schedule[] | null>(null);
  const [form, setForm] = useState<string | null>(null); // id del horario que se edita, o 'new'
  const [busyId, setBusyId] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    let dead = false;
    sb.from('match_schedules').select(SCHEDULE_COLS).eq('community_id', communityId).then(r => {
      if (dead) return;
      if (r.error) { if (isAdmin) setErr(scheduleError(r.error.message)); setList([]); return; } // para los demás, sin horarios no se ve nada
      setList(((r.data ?? []) as Schedule[]).sort(byTime));
    });
    return () => { dead = true; };
  }, [communityId]);

  const put = (s: Schedule) => setList(x => [...(x ?? []).filter(y => y.id !== s.id), s].sort(byTime));

  const toggle = async (s: Schedule) => {
    setBusyId(s.id); setErr('');
    const r = await sb.from('match_schedules').update({ active: !s.active }).eq('id', s.id).select(SCHEDULE_COLS).single();
    setBusyId('');
    if (r.error || !r.data) return setErr(scheduleError(r.error?.message ?? 'No se pudo cambiar (puede que ya lo hayan borrado).'));
    put(r.data as Schedule);
    if (!s.active) onChanged(); // al activarlo se puede crear la convocatoria en el acto
  };
  const del = async (s: Schedule) => {
    if (!confirm(`¿Borrar el partido fijo (${scheduleLine(s)})? Las convocatorias que ya se crearon se mantienen.`)) return;
    setBusyId(s.id); setErr('');
    const r = await sb.from('match_schedules').delete().eq('id', s.id).select('id');
    setBusyId('');
    if (r.error || !r.data?.length) return setErr(scheduleError(r.error?.message ?? 'No se pudo borrar (puede que ya lo hayan sacado).'));
    setList(x => (x ?? []).filter(y => y.id !== s.id));
  };

  if (list === null) return null;

  if (!isAdmin) {
    return <>{list.filter(s => s.active).map(s => <p class="sch-line">🗓️ {memberLine(s)}</p>)}</>;
  }

  if (form) {
    const cur = form === 'new' ? null : list.find(s => s.id === form) ?? null;
    return <ScheduleForm key={form} cur={cur} communityId={communityId} meId={meId} venues={venues}
      defaultVenue={defaultVenue} addVenue={addVenue}
      onSaved={s => { put(s); setForm(null); onChanged(); }} onCancel={() => setForm(null)} />;
  }

  return (
    <>
      {list.map(s => (
        <div class={`card sch-card ${s.active ? '' : 'off'}`}>
          <div class="sch-top">
            <b>📅 {s.title.trim() && s.title.trim() !== 'Partido' ? s.title : 'Partido fijo'}</b>
            {!s.active && <span class="pill warn">Pausado</span>}
          </div>
          <p class="sch-when">{scheduleLine(s)}</p>
          <p class="muted sch-sub">{s.active ? opensText(s.open_days_before) : 'En pausa: no se crean convocatorias nuevas.'}</p>
          <div class="sch-actions">
            <button class="btn sm" disabled={!!busyId} onClick={() => { setErr(''); setForm(s.id); }}>Editar</button>
            <button class="btn sm" disabled={!!busyId} onClick={() => toggle(s)}>{s.active ? 'Pausar' : 'Activar'}</button>
            <button class="btn sm danger" disabled={!!busyId} onClick={() => del(s)}>Borrar</button>
          </div>
        </div>
      ))}
      {list.length === 0
        ? <div class="card sch-card sch-empty">
            <div class="sch-top"><b>📅 Partido fijo</b></div>
            <p class="muted sch-sub">¿Juegan siempre el mismo día? Configuralo una vez y la convocatoria se crea sola cada semana.</p>
            <div class="sch-actions"><button class="btn sm primary" onClick={() => { setErr(''); setForm('new'); }}>Configurar</button></div>
          </div>
        : <button class="linkbtn sch-add" onClick={() => { setErr(''); setForm('new'); }}>+ Agregar otro horario fijo</button>}
      {err && <p class="err">{err}</p>}
    </>
  );
}

function ScheduleForm({ cur, communityId, meId, venues, defaultVenue, addVenue, onSaved, onCancel }: {
  cur: Schedule | null; communityId: string; meId: string; venues: Venue[]; defaultVenue: string;
  addVenue: (v: Venue) => void; onSaved: (s: Schedule) => void; onCancel: () => void;
}) {
  const [f, setF] = useState<ScheduleForm>(cur ? formOf(cur) : emptyScheduleForm());
  // Si las canchas todavía no cargaron (o fallaron), se conserva la del horario: nunca se pierde al guardar.
  const [venue, setVenue] = useState(cur ? (cur.venue_id ?? '') : defaultVenue);
  const [place, setPlace] = useState(cur ? cur.location ?? '' : '');
  const [draft, setDraft] = useState(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: keyof ScheduleForm) => (e: Event) => setF({ ...f, [k]: (e.target as HTMLInputElement).value });
  const invalid = formError(f) || (venue === NEW_VENUE && !draftValid(draft) ? 'Poné el nombre de la cancha.' : '');
  const preview = !formError(f) ? previewText(f.weekday, f.time, +f.open) : '';

  const save = async () => {
    setBusy(true); setErr('');
    // Cancha nueva: se guarda primero; si el horario falla, queda elegida y un reintento no la duplica.
    // La cancha guardada del horario, aunque la lista de canchas no haya cargado: se conserva tal cual.
    const keep = cur && cur.venue_id && venue === cur.venue_id && !venues.some(v => v.id === venue);
    const p = keep ? { id: cur!.venue_id, name: cur!.location, created: null } : await pickVenue(venue, draft, venues, communityId, meId);
    if ('error' in p) { setBusy(false); return setErr(p.error); }
    if (p.created) { addVenue(p.created); setVenue(p.created.id); }
    const payload = schedulePayload(f, { id: p.id, name: p.name ?? (place.trim() || null) });
    const q = cur
      ? sb.from('match_schedules').update(payload).eq('id', cur.id)
      : sb.from('match_schedules').insert({ ...payload, community_id: communityId, created_by: meId, active: true });
    const r = await q.select(SCHEDULE_COLS).single();
    setBusy(false);
    if (r.error || !r.data) return setErr(scheduleError(r.error?.message ?? 'No se pudo guardar.'));
    onSaved(r.data as Schedule);
  };

  return (
    <div class="card adm-card sch-form">
      <h3 style="margin-bottom:12px">{cur ? 'Editar partido fijo' : 'Nuevo partido fijo'}</h3>
      <label class="field"><span>Título</span><input value={f.title} maxLength={80} onInput={set('title')} /></label>
      <div class="field"><span id="sch-day">Día</span>
        <div class="sch-days" role="group" aria-labelledby="sch-day">
          {WEEKDAY_CHIPS.map(c => (
            <button type="button" class={f.weekday === c.d ? 'on' : ''} aria-pressed={f.weekday === c.d} onClick={() => setF({ ...f, weekday: c.d })}>{c.label}</button>
          ))}
        </div>
      </div>
      <label class="field"><span>Hora</span><input type="time" value={f.time} onInput={set('time')} /></label>
      <VenueField venues={venues} value={venue} onChange={setVenue} draft={draft} onDraft={setDraft} />
      {!venue && <label class="field"><span>Lugar</span><input value={place} maxLength={200} placeholder="Cancha, dirección…" onInput={e => setPlace((e.target as HTMLInputElement).value)} /></label>}
      <div class="sch-two">
        <label class="field"><span>Cupos</span><input type="number" min={2} max={40} inputMode="numeric" value={f.slots} onInput={set('slots')} /></label>
        <label class="field"><span>Costo de la cancha</span><input type="number" min={0} inputMode="numeric" placeholder="Opcional" value={f.fee} onInput={set('fee')} /></label>
      </div>
      <label class="field"><span>Crear la convocatoria X días antes (0 a 13)</span>
        <input type="number" min={0} max={13} inputMode="numeric" value={f.open} onInput={set('open')} /></label>
      {preview && <p class="muted adm-note">{preview}</p>}
      <p class="muted adm-note">Los partidos que se creen solos van a usar la cancha, los cupos y el costo de acá. Después podés editar cada uno.</p>
      <div class="row">
        <button class="btn primary" disabled={busy || !!invalid} onClick={save}>{busy ? 'Guardando…' : 'Guardar'}</button>
        <button class="btn" disabled={busy} onClick={onCancel}>Cancelar</button>
      </div>
      {err && <p class="err">{err}</p>}
    </div>
  );
}
