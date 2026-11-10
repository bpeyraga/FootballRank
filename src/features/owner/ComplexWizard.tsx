import { useState } from 'preact/hooks';
import { go } from '../../app/router';
import { createComplex, setComplexPhoto, uploadComplexPhoto } from './api';
import { ContactFields } from './ContactFields';
import { CoverField } from './CoverField';
import { complexError, emptyComplex, ownerErrorText, type ComplexDraft } from './model';
import { PlaceField } from './PlaceField';

/** Alta de un complejo en dos pasos: dónde está y cómo te encuentran. Las canchas y los horarios se cargan en el panel. */
export function ComplexWizard() {
  const [step, setStep] = useState<1 | 2>(1);
  const [d, setD] = useState<ComplexDraft>(emptyComplex);
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const patch = (p: Partial<ComplexDraft>) => { setD(x => ({ ...x, ...p })); setErr(''); };

  // Paso 1: lo mínimo para ubicarlo. (El resto de las reglas se valida con complexError al crear.)
  const step1Error = (): string | null => {
    if (d.name.trim().length < 2) return 'Poné el nombre del complejo (mínimo 2 letras).';
    if (d.lat === null || d.lng === null) return 'Buscá el barrio o la ciudad para ubicar el complejo.';
    return null;
  };
  const next = () => { const e = step1Error(); if (e) setErr(e); else { setErr(''); setStep(2); } };

  const create = async () => {
    const e = complexError(d);
    if (e) { setErr(e); return; }
    setBusy(true); setErr('');
    let id: string;
    try { id = await createComplex(d); }
    catch (x) { setBusy(false); setErr(ownerErrorText(x)); return; }
    // La foto va aparte: si falla, el complejo ya está creado y se puede subir después desde "Datos".
    if (photo) { try { await setComplexPhoto(id, await uploadComplexPhoto(id, photo), null); } catch { /* se sube desde Datos */ } }
    go(`duenio/${id}/canchas`);
  };

  return (
    <div class="ow-wiz">
      <a href="#/duenio" class="ow-back">← Mis complejos</a>
      <div class="ow-wiz-head">
        <span class="ow-kicker">Nuevo complejo · paso {step} de 2</span>
        <h2>{step === 1 ? '¿Cómo se llama y dónde queda?' : '¿Cómo te contactan los jugadores?'}</h2>
        <div class="ow-steps" aria-hidden="true"><i class="on" /><i class={step === 2 ? 'on' : ''} /></div>
      </div>

      <div class="card ow-form">
        {step === 1 ? (
          <>
            <label class="field"><span>Nombre del complejo</span>
              <input value={d.name} maxLength={80} placeholder="Complejo Los Amigos" autoFocus disabled={busy}
                onInput={e => patch({ name: (e.target as HTMLInputElement).value })} /></label>
            <PlaceField draft={d} onChange={patch} disabled={busy} />
          </>
        ) : (
          <>
            <ContactFields draft={d} onChange={patch} disabled={busy} />
            <CoverField url={null} file={photo} busy={busy} onFile={setPhoto} onRemove={photo ? () => setPhoto(null) : undefined} />
          </>
        )}
        {err && <p class="err" role="alert">{err}</p>}
      </div>

      <div class="ow-wiz-actions">
        {step === 2 && <button class="btn" disabled={busy} onClick={() => { setStep(1); setErr(''); }}>Atrás</button>}
        {step === 1
          ? <button class="btn primary" onClick={next}>Seguir</button>
          : <button class="btn primary" disabled={busy} onClick={create}>{busy ? 'Creando…' : 'Crear complejo'}</button>}
      </div>
      <p class="muted ow-wiz-note">
        {step === 1
          ? 'Después cargás tus canchas y los horarios. El complejo aparece en el buscador cuando tenga ubicación, una cancha y horarios.'
          : 'El teléfono y el WhatsApp son opcionales, pero los jugadores los usan para confirmar con vos.'}
      </p>
    </div>
  );
}
