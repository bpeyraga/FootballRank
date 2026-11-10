import { useRef, useState } from 'preact/hooks';
import { hue } from '../../shared/supabase';
import { initials } from '../../shared/text';
import { Sheet } from '../../shared/ui/Sheet';
import { setCommunityLogo, uploadCommunityLogo } from './api';

/**
 * Escudo de la comunidad en la portada: misma forma de siempre, con la imagen que cargue el grupo adentro
 * (sin imagen, las iniciales sobre el color de la comunidad). Owner y admins lo tocan para cambiarla o quitarla.
 */
export function CommunityLogo({ id, name, url, isAdmin, changed }: {
  id: string; name: string; url: string | null; isAdmin: boolean; changed: () => void;
}) {
  const file = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const save = async (next: string | null) => {
    setBusy(true); setErr('');
    try {
      await setCommunityLogo(id, next, url); // la imagen anterior ya no se usa: se borra
      changed();
      setOpen(false);
    } catch (x: any) { setErr(x.message ?? 'No se pudo guardar el escudo'); }
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

  const crest = (
    <span class={`cover-crest${url ? ' has-logo' : ''}`} aria-hidden="true"
      style={`--h:${hue(id)}${url ? `;background-image:url("${url}")` : ''}`}>{url ? '' : initials(name)}</span>
  );
  if (!isAdmin) return crest;

  return (
    <>
      <button type="button" class="cover-crest-btn" aria-label="Cambiar el escudo de la comunidad" onClick={() => { setErr(''); setOpen(true); }}>
        {crest}
        <span class="cover-crest-edit" aria-hidden="true">✎</span>
      </button>
      {open && (
        <Sheet title="Escudo de la comunidad" busy={busy} onClose={() => setOpen(false)}>
          <div class="logo-sheet">
            <span class={`cover-crest logo-preview${url ? ' has-logo' : ''}`} aria-hidden="true"
              style={`--h:${hue(id)}${url ? `;background-image:url("${url}")` : ''}`}>{url ? '' : initials(name)}</span>
            <p class="muted">La imagen se recorta en cuadrado y va dentro del escudo. Conviene una con el motivo al centro.</p>
            <button type="button" class="btn primary" disabled={busy} onClick={() => file.current?.click()}>
              {busy ? 'Guardando…' : url ? 'Cambiar imagen' : 'Subir imagen'}
            </button>
            <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={onFile} />
            {url && <button type="button" class="btn danger" disabled={busy} onClick={() => save(null)}>Quitar imagen</button>}
            {err && <p class="err">{err}</p>}
          </div>
        </Sheet>
      )}
    </>
  );
}
