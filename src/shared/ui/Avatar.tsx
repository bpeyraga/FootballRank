import { useEffect, useState } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { displayName, type Profile } from '../model';

type Who = Pick<Profile, 'name' | 'photo_url'> & { nickname?: string | null };

/**
 * Foto de perfil (o la inicial si no tiene). Con foto, tocarla la muestra grande (`zoom={false}` donde el avatar
 * ya es un botón, como el menú de la cuenta). El toque no sigue al link o fila que la contiene.
 */
export function Avatar({ p, size = 40, zoom = true }: { p: Who; size?: number; zoom?: boolean }) {
  const [open, setOpen] = useState(false);
  const style = `width:${size}px;height:${size}px;font-size:${size * 0.4}px;flex:none`;
  if (!p.photo_url) return <span class="avatar" style={style}>{displayName(p).trim().charAt(0).toUpperCase() || '?'}</span>;
  if (!zoom) return <img class="avatar" style={style} src={p.photo_url} alt="" loading="lazy" referrerpolicy="no-referrer" />;

  const show = (e: Event) => { e.preventDefault(); e.stopPropagation(); setOpen(true); };
  return (
    <>
      <img class="avatar avatar-zoom" style={style} src={p.photo_url} loading="lazy" referrerpolicy="no-referrer"
        role="button" tabIndex={0} alt={`Ver foto de ${displayName(p)}`} onClick={show}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') show(e); }} />
      {open && <Zoom src={p.photo_url} name={displayName(p)} onClose={() => setOpen(false)} />}
    </>
  );
}

function Zoom({ src, name, onClose }: { src: string; name: string; onClose: () => void }) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, [onClose]);
  // En el <body>, para tapar todo; los clics no llegan al link de la fila que tenía el avatar.
  const close = (e: Event) => { e.preventDefault(); e.stopPropagation(); onClose(); };
  return createPortal(
    <div class="zoom-bg" role="dialog" aria-modal="true" aria-label={`Foto de ${name}`} onClick={close}>
      <button type="button" class="zoom-close" aria-label="Cerrar" autoFocus onClick={close}>✕</button>
      <figure class="zoom-fig">
        <img class="zoom-img" src={src} alt={`Foto de ${name}`} referrerpolicy="no-referrer" />
        <figcaption>{name}</figcaption>
      </figure>
    </div>,
    document.body,
  );
}
