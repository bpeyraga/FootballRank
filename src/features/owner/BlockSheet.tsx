import { useState } from 'preact/hooks';
import { Sheet } from '../../shared/ui/Sheet';
import { blockSlot } from './api';
import {
  blockDurations, fmtDuration, isDate, minuteToLocal, ownerErrorText, parseHHMM, sizeLabel, zonedToUtc, type Complex, type Field,
} from './model';

const REASONS = ['Reserva por teléfono', 'Mantenimiento', 'Torneo o evento', 'Clase / escuelita'];

/** Bloquear un horario de una cancha: lo que se reservó por teléfono, el mantenimiento, un torneo… Queda ocupado para los jugadores. */
export function BlockSheet({ complex, fields, date, init, onClose, onDone }: {
  complex: Complex; fields: Field[]; date: string; init: { fieldId?: string; startMin?: number }; onClose: () => void; onDone: () => void;
}) {
  const active = fields.filter(f => f.active);
  const [fieldId, setFieldId] = useState(init.fieldId ?? active[0]?.id ?? '');
  // El minuto puede pasar de 1440 (madrugada del día de agenda): eso es el día calendario siguiente, no el mismo día a esa hora
  const [first] = useState(() => minuteToLocal(date, init.startMin ?? 20 * 60));
  const [day, setDay] = useState(first.date);
  const [time, setTime] = useState(first.time);
  const [minutes, setMinutes] = useState(complex.slot_minutes);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const durations = blockDurations(complex.slot_minutes);

  const save = async () => {
    const t = parseHHMM(time);
    if (!fieldId) { setErr('Elegí la cancha.'); return; }
    if (!isDate(day)) { setErr('Elegí el día.'); return; }
    if (t === null) { setErr('Elegí la hora de inicio.'); return; }
    setBusy(true); setErr('');
    try {
      await blockSlot(fieldId, new Date(zonedToUtc(day, t, complex.tz)).toISOString(), minutes, note);
      onDone();
    } catch (e) { setErr(ownerErrorText(e)); setBusy(false); }
  };

  return (
    <Sheet title="Bloquear horario" onClose={onClose} busy={busy}>
      <div class="ow-sheet">
      <p class="muted ow-hint">Queda ocupado y los jugadores no lo pueden pedir.</p>
      <label class="field"><span>Cancha</span>
        <select value={fieldId} disabled={busy} onChange={e => setFieldId((e.target as HTMLSelectElement).value)}>
          {active.map(f => <option value={f.id}>{f.name} · {sizeLabel(f.size)}</option>)}
        </select></label>
      <div class="ow-two">
        <label class="field"><span>Día</span>
          <input type="date" value={day} disabled={busy} onInput={e => setDay((e.target as HTMLInputElement).value)} /></label>
        <label class="field"><span>Desde</span>
          <input type="time" step={complex.slot_minutes * 60} value={time} disabled={busy} onInput={e => setTime((e.target as HTMLInputElement).value)} /></label>
      </div>
      <label class="field"><span>Duración</span>
        <select value={minutes} disabled={busy} onChange={e => setMinutes(+(e.target as HTMLSelectElement).value)}>
          {durations.map(m => <option value={m}>{m === 1440 ? 'Todo el día (24 h)' : fmtDuration(m)}</option>)}
        </select></label>
      <label class="field"><span>Nota <span class="muted">(solo la ves vos)</span></span>
        <input value={note} maxLength={300} placeholder="Reservó Juan, 11 5555-1234" disabled={busy}
          onInput={e => setNote((e.target as HTMLInputElement).value)} /></label>
      <div class="ow-chips">
        {REASONS.map(r => <button type="button" class="ow-chip" disabled={busy} onClick={() => setNote(r)}>{r}</button>)}
      </div>
      {err && <p class="err" role="alert">{err}</p>}
      <div class="ow-actions">
        <button class="btn" disabled={busy} onClick={onClose}>Cancelar</button>
        <button class="btn primary" disabled={busy || !active.length} onClick={save}>{busy ? 'Bloqueando…' : 'Bloquear'}</button>
      </div>
      </div>
    </Sheet>
  );
}
