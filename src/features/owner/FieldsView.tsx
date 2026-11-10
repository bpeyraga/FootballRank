import { useState } from 'preact/hooks';
import { Sheet } from '../../shared/ui/Sheet';
import { addField, removeField, updateField } from './api';
import {
  FIELD_SIZES, SURFACES, emptyField, fieldError, fieldLine, fieldToDraft, ownerErrorText, sizeLabel, type ComplexData, type Field, type FieldDraft,
} from './model';
import { Choice, Switch } from './ui';

const MAX_FIELDS = 30;

/** Formulario de una cancha (nueva o existente). */
function FieldSheet({ field, n, complexId, onClose, onSaved, onRemoved }: {
  field: Field | null; n: number; complexId: string; onClose: () => void; onSaved: (f: Field) => void; onRemoved: (id: string, how: 'deleted' | 'deactivated') => void;
}) {
  const [d, setD] = useState<FieldDraft>(() => (field ? fieldToDraft(field) : emptyField(n)));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (p: Partial<FieldDraft>) => { setD(x => ({ ...x, ...p })); setErr(''); };

  const save = async () => {
    const e = fieldError(d);
    if (e) { setErr(e); return; }
    setBusy(true); setErr('');
    try { onSaved(field ? await updateField(field.id, d) : await addField(complexId, d)); }
    catch (x) { setErr(ownerErrorText(x)); setBusy(false); }
  };
  const remove = async () => {
    if (!field || !confirm(`¿Quitar "${field.name}"? Si ya tuvo reservas, queda inactiva y el historial se conserva.`)) return;
    setBusy(true); setErr('');
    try { onRemoved(field.id, await removeField(field.id)); }
    catch (x) { setErr(ownerErrorText(x)); setBusy(false); }
  };

  return (
    <Sheet title={field ? 'Editar cancha' : 'Nueva cancha'} onClose={onClose} busy={busy}>
      <div class="ow-sheet">
      <label class="field"><span>Nombre</span>
        <input value={d.name} maxLength={40} placeholder="Cancha 1" disabled={busy} onInput={e => set({ name: (e.target as HTMLInputElement).value })} /></label>
      <div class="field"><span>Tamaño</span>
        <Choice label="Tamaño" value={d.size} disabled={busy} onChange={v => set({ size: v })}
          options={FIELD_SIZES.map(s => ({ value: s as number, label: sizeLabel(s) }))} /></div>
      <div class="field"><span>Piso</span>
        <Choice label="Piso" value={d.surface} disabled={busy} onChange={v => set({ surface: v })}
          options={SURFACES.map(s => ({ value: s.key, label: s.label }))} /></div>
      <Switch checked={d.roofed} disabled={busy} onChange={v => set({ roofed: v })} title="Techada" hint="Se puede jugar aunque llueva." />
      <label class="field"><span>Precio por hora <span class="muted">(opcional)</span></span>
        <div class="ow-money"><span aria-hidden="true">$</span>
          <input inputMode="decimal" value={d.price} placeholder="20000" disabled={busy} onInput={e => set({ price: (e.target as HTMLInputElement).value })} /></div></label>
      {field && <Switch checked={d.active} disabled={busy} onChange={v => set({ active: v })} title="Activa" hint="Una cancha inactiva no aparece para reservar." />}
      {err && <p class="err" role="alert">{err}</p>}
      <div class="ow-actions">
        {field && <button class="btn danger" disabled={busy} onClick={remove}>Quitar</button>}
        <button class="btn primary" disabled={busy} onClick={save}>{busy ? 'Guardando…' : 'Guardar'}</button>
      </div>
      </div>
    </Sheet>
  );
}

/** Las canchas del complejo: nombre, tamaño, piso, techo y precio por hora. */
export function FieldsView({ data, patch }: { data: ComplexData; patch: (p: Partial<ComplexData>) => void }) {
  const { complex, fields } = data;
  const [editing, setEditing] = useState<Field | 'new' | null>(null);
  const [note, setNote] = useState('');
  const upsert = (f: Field) => {
    patch({ fields: fields.some(x => x.id === f.id) ? fields.map(x => (x.id === f.id ? f : x)) : [...fields, f] });
    setEditing(null);
  };
  const gone = (id: string, how: 'deleted' | 'deactivated') => {
    patch({ fields: how === 'deleted' ? fields.filter(x => x.id !== id) : fields.map(x => (x.id === id ? { ...x, active: false } : x)) });
    setNote(how === 'deleted' ? 'Cancha eliminada.' : 'La cancha tenía reservas: quedó inactiva y el historial se conserva.');
    setEditing(null);
  };

  return (
    <div class="ow-fields">
      <div class="ow-title sm">
        <div><h3>Canchas</h3><p class="muted">Lo que los jugadores pueden reservar en {complex.name}.</p></div>
        {fields.length < MAX_FIELDS && <button class="btn primary" onClick={() => { setNote(''); setEditing('new'); }}>＋ Agregar cancha</button>}
      </div>
      {note && <p class="ow-ok" role="status">{note}</p>}
      {fields.length === 0 && (
        <div class="card ow-empty">
          <span class="ow-empty-ico" aria-hidden="true">⚽</span>
          <h3>Cargá tu primera cancha</h3>
          <p class="muted">Poné el nombre, el tamaño (F5, F7…), el piso y cuánto cuesta la hora. Después definís los horarios y ya podés recibir reservas.</p>
          <button class="btn primary" onClick={() => setEditing('new')}>Agregar cancha</button>
        </div>
      )}
      <div class="ow-field-grid">
        {fields.map(f => (
          <button class={`card ow-field${f.active ? '' : ' off'}`} onClick={() => { setNote(''); setEditing(f); }}>
            <span class="ow-field-size" aria-hidden="true">{sizeLabel(f.size)}</span>
            <span class="ow-field-copy">
              <b class="ellipsis">{f.name}{!f.active && <span class="ow-pill off">Inactiva</span>}</b>
              <small class="muted">{fieldLine(f, false)}</small>
            </span>
            <span class="chev" aria-hidden="true">›</span>
          </button>
        ))}
      </div>
      {editing && (
        <FieldSheet field={editing === 'new' ? null : editing} n={fields.length + 1} complexId={complex.id}
          onClose={() => setEditing(null)} onSaved={upsert} onRemoved={gone} />
      )}
    </div>
  );
}
