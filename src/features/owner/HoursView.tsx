import { useState } from 'preact/hooks';
import { saveHours, setComplexSlot } from './api';
import {
  SLOT_OPTIONS, WEEKDAY_NAMES, WEEK_ORDER, copyDay, draftToRows, fmtDuration, hoursError, hoursLabel, hoursToDraft, ownerErrorText,
  parseHHMM, type ComplexData, type HoursDraft,
} from './model';
import { Choice } from './ui';

const closesNextDay = (d: { opens: string; closes: string }) => {
  const o = parseHHMM(d.opens), c = parseHHMM(d.closes);
  return o !== null && c !== null && c < o ? `Cierra a las ${d.closes} del día siguiente` : o !== null && o === c ? 'Abre las 24 horas' : '';
};

/** Horarios de apertura por día y duración del turno. Un día sin marcar está cerrado. */
export function HoursView({ data, patch }: { data: ComplexData; patch: (p: Partial<ComplexData>) => void }) {
  const { complex, hours } = data;
  const [draft, setDraft] = useState<HoursDraft>(() => hoursToDraft(hours));
  const [slot, setSlot] = useState(complex.slot_minutes);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);

  const edit = (w: number, p: Partial<HoursDraft[number]>) => { setDraft(d => ({ ...d, [w]: { ...d[w], ...p } })); setSaved(false); setErr(''); };
  const dirty = JSON.stringify(draftToRows(draft)) !== JSON.stringify(draftToRows(hoursToDraft(hours))) || slot !== complex.slot_minutes;

  const save = async () => {
    const e = hoursError(draft);
    if (e) { setErr(e); return; }
    setBusy(true); setErr('');
    try {
      const rows = draftToRows(draft);
      await saveHours(complex.id, rows);
      if (slot !== complex.slot_minutes) await setComplexSlot(complex.id, slot);
      patch({ hours: rows, complex: { ...complex, slot_minutes: slot } });
      setSaved(true);
    } catch (x) { setErr(ownerErrorText(x)); }
    setBusy(false);
  };

  return (
    <div class="ow-hours">
      <div class="ow-title sm"><div><h3>Horarios</h3><p class="muted">Cuándo abre {complex.name}. Los jugadores solo pueden pedir turnos dentro de estos horarios.</p></div></div>
      <div class="card ow-hours-card">
        {WEEK_ORDER.map(w => {
          const d = draft[w];
          return (
            <div class={`ow-hrow${d.open ? '' : ' closed'}`}>
              <label class="zn-switch ow-hday">
                <input type="checkbox" checked={d.open} disabled={busy} onChange={e => edit(w, { open: (e.target as HTMLInputElement).checked })} />
                <span class="zn-track" aria-hidden="true"><i /></span>
                <b>{WEEKDAY_NAMES[w]}</b>
              </label>
              {d.open ? (
                <div class="ow-htimes">
                  <input type="time" aria-label={`${WEEKDAY_NAMES[w]}: abre`} value={d.opens} disabled={busy} onInput={e => edit(w, { opens: (e.target as HTMLInputElement).value })} />
                  <span class="muted">a</span>
                  <input type="time" aria-label={`${WEEKDAY_NAMES[w]}: cierra`} value={d.closes} disabled={busy} onInput={e => edit(w, { closes: (e.target as HTMLInputElement).value })} />
                  <button type="button" class="linkbtn ow-copy" disabled={busy} onClick={() => { setDraft(copyDay(draft, w)); setSaved(false); }}
                    title="Usar este horario todos los días">Copiar a todos</button>
                </div>
              ) : <span class="muted ow-hclosed">{hoursLabel(d)}</span>}
              {d.open && closesNextDay(d) && <small class="muted ow-hnote">{closesNextDay(d)}</small>}
            </div>
          );
        })}
      </div>

      <div class="card">
        <h3 style="margin-bottom:4px">Duración del turno</h3>
        <p class="muted ow-hint">Es el tiempo base de cada reserva. Un jugador puede pedir uno o varios turnos seguidos.</p>
        <Choice label="Duración del turno" value={slot} disabled={busy} onChange={v => { setSlot(v); setSaved(false); }}
          options={SLOT_OPTIONS.map(m => ({ value: m as number, label: fmtDuration(m) }))} />
      </div>

      {err && <p class="err" role="alert">{err}</p>}
      {saved && !dirty && <p class="ow-ok" role="status">Horarios guardados.</p>}
      <div class="ow-savebar">
        <button class="btn primary block" disabled={busy || !dirty} onClick={save}>{busy ? 'Guardando…' : 'Guardar horarios'}</button>
      </div>
    </div>
  );
}
