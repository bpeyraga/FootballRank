import { useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { sb, uploadCommunityPhoto } from './supabase';

/**
 * Portada de la comunidad: la foto del grupo a todo el ancho, con el escudo y el nombre encima (children).
 * Sin foto, una portada por defecto (cancha). Owner y admins la cambian o la quitan.
 * `compact`: más baja, para pestañas donde importa el espacio (chat, ranking, votar).
 */
export function CommunityPhoto({ id, name, url, isAdmin, changed, compact = false, children }: {
  id: string; name: string; url: string | null; isAdmin: boolean; changed: () => void;
  compact?: boolean; children?: ComponentChildren;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const save = async (next: string | null) => {
    const { error } = await sb.rpc('set_community_photo', { p_community: id, p_url: next });
    if (error) throw error;
    // la foto anterior ya no se usa: se borra (si falla, no importa)
    const old = url?.split('/communities/')[1]?.split('?')[0];
    if (old) await sb.storage.from('communities').remove([old]);
    changed();
  };
  const onFile = async (e: Event) => {
    const input = e.target as HTMLInputElement, f = input.files?.[0];
    input.value = '';
    if (!f) return;
    setBusy(true); setErr('');
    try { await save(await uploadCommunityPhoto(id, f)); } catch (x: any) { setErr(x.message ?? 'No se pudo subir la foto'); }
    setBusy(false);
  };
  const remove = async () => {
    if (!confirm('¿Quitar la portada de la comunidad?')) return;
    setBusy(true); setErr('');
    try { await save(null); } catch (x: any) { setErr(x.message); }
    setBusy(false);
  };

  return (
    <>
      <header class={`cover${url ? ' has-photo' : ''}${compact ? ' compact' : ''}${busy ? ' busy' : ''}`}>
        {url
          ? <img class="cover-img" src={url} alt={`Foto del grupo ${name}`} />
          : <div class="cover-default" aria-hidden="true" />}
        <div class="cover-shade" aria-hidden="true" />
        <div class="cover-body">{children}</div>
        {isAdmin && !compact && (
          <div class="cover-actions">
            <label class="cover-btn">
              {busy ? 'Subiendo…' : url ? '📷 Cambiar portada' : '📷 Agregar portada'}
              <input type="file" accept="image/*" hidden disabled={busy} onChange={onFile} />
            </label>
            {url && <button type="button" class="cover-btn" disabled={busy} onClick={remove}>Quitar</button>}
          </div>
        )}
      </header>
      {err && <p class="err" style="margin:-4px 0 12px">{err}</p>}
    </>
  );
}
