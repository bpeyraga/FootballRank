import { useState } from 'preact/hooks';
import { loadComplex, setComplexActive, setComplexPhoto, updateComplex, uploadComplexPhoto } from './api';
import { ContactFields } from './ContactFields';
import { CoverField } from './CoverField';
import {
  AMENITIES, complexError, complexToDraft, isPublished, ownerErrorText, setupChecklist, type ComplexData, type ComplexDraft,
} from './model';
import { PlaceField } from './PlaceField';
import { Switch } from './ui';

/** Datos del complejo: foto, nombre, ubicación, contacto, servicios y si aparece en el buscador. */
export function DetailsView({ data, patch }: { data: ComplexData; patch: (p: Partial<ComplexData>) => void }) {
  const { complex, fields, hours } = data;
  const [d, setD] = useState<ComplexDraft>(() => complexToDraft(complex));
  const [amen, setAmen] = useState<string[]>(complex.amenities ?? []);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [err, setErr] = useState('');
  const [photoErr, setPhotoErr] = useState('');
  const [saved, setSaved] = useState(false);
  const [pubBusy, setPubBusy] = useState(false);
  const [pubErr, setPubErr] = useState('');

  const edit = (p: Partial<ComplexDraft>) => { setD(x => ({ ...x, ...p })); setSaved(false); setErr(''); };
  const toggleAmen = (k: string) => { setAmen(a => (a.includes(k) ? a.filter(x => x !== k) : [...a, k])); setSaved(false); };
  const refresh = async () => { const c = await loadComplex(complex.id); if (c) patch({ complex: c }); };

  const save = async () => {
    const e = complexError(d);
    if (e) { setErr(e); return; }
    setBusy(true); setErr('');
    try { await updateComplex(complex.id, d, null, amen); await refresh(); setSaved(true); }
    catch (x) { setErr(ownerErrorText(x)); }
    setBusy(false);
  };

  const photo = async (next: File | null) => {
    setPhotoBusy(true); setPhotoErr('');
    try {
      const url = next ? await uploadComplexPhoto(complex.id, next) : null;
      await setComplexPhoto(complex.id, url, complex.photo_url);
      patch({ complex: { ...complex, photo_url: url } });
    } catch (x) { setPhotoErr(ownerErrorText(x)); }
    setPhotoBusy(false);
  };

  const items = setupChecklist(complex, fields, hours);
  const live = isPublished(items, complex.active);
  const setActive = async (v: boolean) => {
    setPubBusy(true); setPubErr('');
    try { await setComplexActive(complex.id, v); patch({ complex: { ...complex, active: v } }); }
    catch (x) { setPubErr(ownerErrorText(x)); }
    setPubBusy(false);
  };

  return (
    <div class="ow-details">
      <div class="ow-title sm"><div><h3>Datos del complejo</h3><p class="muted">Lo que ven los jugadores cuando te encuentran en el buscador.</p></div></div>

      <div class="ow-two-col">
        <div>
          <div class="card">
            <h4 class="ow-h4">Foto</h4>
            <CoverField url={complex.photo_url} busy={photoBusy} onFile={f => void photo(f)} onRemove={complex.photo_url ? () => { if (confirm('¿Quitar la foto del complejo?')) void photo(null); } : undefined} />
            {photoErr && <p class="err" role="alert">{photoErr}</p>}
          </div>

          <div class="card ow-form">
            <h4 class="ow-h4">Nombre y ubicación</h4>
            <label class="field"><span>Nombre del complejo</span>
              <input value={d.name} maxLength={80} disabled={busy} onInput={e => edit({ name: (e.target as HTMLInputElement).value })} /></label>
            <PlaceField draft={d} onChange={edit} disabled={busy} />
          </div>
        </div>

        <div>
          <div class="card ow-form">
            <h4 class="ow-h4">Contacto</h4>
            <ContactFields draft={d} onChange={edit} disabled={busy} />
          </div>

          <div class="card">
            <h4 class="ow-h4">Servicios</h4>
            <div class="ow-amen">
              {AMENITIES.map(a => (
                <button type="button" class={`ow-chip${amen.includes(a.key) ? ' on' : ''}`} aria-pressed={amen.includes(a.key)} disabled={busy} onClick={() => toggleAmen(a.key)}>
                  <span aria-hidden="true">{a.icon}</span> {a.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {err && <p class="err" role="alert">{err}</p>}
      {saved && <p class="ow-ok" role="status">Datos guardados.</p>}
      <div class="ow-savebar"><button class="btn primary block" disabled={busy} onClick={save}>{busy ? 'Guardando…' : 'Guardar datos'}</button></div>

      <div class="card ow-pub">
        <h4 class="ow-h4">Publicación</h4>
        <Switch checked={complex.active} disabled={pubBusy} onChange={v => void setActive(v)} title="Aparecer en el buscador de canchas"
          hint={complex.active ? 'Los jugadores pueden encontrarte y pedirte turnos.' : 'Pausado: no aparecés en el buscador ni recibís pedidos. Tus reservas se conservan.'} />
        {pubErr && <p class="err" role="alert">{pubErr}</p>}
        <ul class="ow-check">
          {items.map(i => (
            <li class={i.ok ? 'ok' : i.required ? 'req' : ''}>
              <span aria-hidden="true">{i.ok ? '✓' : i.required ? '!' : '○'}</span>
              {i.ok ? i.label : <a href={`#/duenio/${complex.id}/${i.tab}`}>{i.label}{i.required ? '' : ' (opcional)'}</a>}
            </li>
          ))}
        </ul>
        <p class="muted ow-hint">{live ? 'Tu complejo está publicado en el buscador.' : complex.active ? 'Completá lo que falta para aparecer en el buscador.' : 'Está pausado.'}</p>
      </div>
    </div>
  );
}
