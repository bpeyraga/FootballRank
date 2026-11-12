import { useRef, useState } from 'preact/hooks';
import { hue } from '../../shared/supabase';
import { initials } from '../../shared/text';
import { Sheet } from '../../shared/ui/Sheet';
import { saveCommunityCrest, setCommunityLogo, uploadCommunityLogo } from './api';
import { CrestDesigner } from './CrestDesigner';
import { crestError, defaultCrest, hslHex, isCrestUrl, validateCrest, type CrestDesign } from './crestCore';

/** El escudo en chico: uno diseñado en la app va entero (trae su propia forma); una imagen subida va dentro de la forma de siempre. */
function CrestMark({ id, name, url, extra = '' }: { id: string; name: string; url: string | null; extra?: string }) {
  if (isCrestUrl(url)) return <span class={`cover-crest designed ${extra}`} aria-hidden="true"><img src={url!} alt="" decoding="async" /></span>;
  return (
    <span class={`cover-crest${url ? ' has-logo' : ''} ${extra}`} aria-hidden="true"
      style={`--h:${hue(id)}${url ? `;background-image:url("${url}")` : ''}`}>{url ? '' : initials(name)}</span>
  );
}

/**
 * Escudo de la comunidad en la portada. Owner y admins lo tocan para armarlo ("Crear escudo": forma, colores, dibujo y
 * símbolo propios), subir una imagen (que va recortada dentro de la forma de siempre) o quitarlo. Los demás solo lo ven.
 */
export function CommunityLogo({ id, name, url, crest, isAdmin, changed }: {
  id: string; name: string; url: string | null; crest?: unknown; isAdmin: boolean; changed: () => void;
}) {
  const file = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [designing, setDesigning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const mark = <CrestMark id={id} name={name} url={url} />;
  if (!isAdmin) return mark;

  const designed = isCrestUrl(url);
  const start = defaultCrest(name, hue(id));
  const close = () => { setOpen(false); setDesigning(false); setErr(''); };

  const save = async (next: string | null) => {
    setBusy(true); setErr('');
    try {
      await setCommunityLogo(id, next, url); // la imagen anterior ya no se usa: se borra
      changed();
      close();
    } catch (x: any) { setErr(crestError(x.message ?? 'No se pudo guardar el escudo')); }
    setBusy(false);
  };
  const onFile = async (e: Event) => {
    const input = e.target as HTMLInputElement, f = input.files?.[0];
    input.value = '';
    if (!f) return;
    setBusy(true); setErr('');
    let next: string;
    try { next = await uploadCommunityLogo(id, f); } catch (x: any) { setErr(x.message ?? 'No se pudo subir la imagen'); setBusy(false); return; }
    await save(next);
  };
  const saveDesign = async (d: CrestDesign) => {
    setBusy(true); setErr('');
    try {
      await saveCommunityCrest(id, d, url, hslHex(hue(id), 55, 38));
      changed();
      close();
    } catch (x: any) { setErr(crestError(x.message ?? 'No se pudo guardar el escudo')); }
    setBusy(false);
  };

  return (
    <>
      <button type="button" class="cover-crest-btn" aria-label="Cambiar el escudo de la comunidad" onClick={() => { setErr(''); setOpen(true); }}>
        {mark}
        <span class="cover-crest-edit" aria-hidden="true">✎</span>
      </button>
      {open && (designing ? (
        <Sheet title={designed ? 'Editar escudo' : 'Crear escudo'} busy={busy} onClose={() => { setErr(''); setDesigning(false); }}>
          <CrestDesigner initial={designed && crest ? validateCrest(crest, start) : start} busy={busy} error={err}
            onSave={saveDesign} onCancel={() => { setErr(''); setDesigning(false); }} />
        </Sheet>
      ) : (
        <Sheet title="Escudo de la comunidad" busy={busy} onClose={close}>
          <div class="logo-sheet">
            <CrestMark id={id} name={name} url={url} extra="logo-preview" />
            <p class="muted">Armá un escudo propio —forma, colores y símbolo— o subí una imagen. La imagen se recorta en cuadrado y va dentro del escudo; conviene una con el motivo al centro.</p>
            <button type="button" class="btn primary" disabled={busy} onClick={() => { setErr(''); setDesigning(true); }}>
              {designed ? 'Editar escudo' : 'Crear escudo'}
            </button>
            <button type="button" class="btn" disabled={busy} onClick={() => file.current?.click()}>
              {busy ? 'Guardando…' : url && !designed ? 'Cambiar imagen' : 'Subir imagen'}
            </button>
            <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={onFile} />
            {url && <button type="button" class="btn danger" disabled={busy} onClick={() => save(null)}>{designed ? 'Quitar escudo' : 'Quitar imagen'}</button>}
            {err && <p class="err">{err}</p>}
          </div>
        </Sheet>
      ))}
    </>
  );
}
