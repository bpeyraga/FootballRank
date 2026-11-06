import { useState } from 'preact/hooks';
import { sb, uploadCommunityPhoto } from './supabase';

/** Foto grupal de la comunidad (portada). Owner y admins la cambian o la quitan. */
export function CommunityPhoto({ id, name, url, isAdmin, changed }: {
  id: string; name: string; url: string | null; isAdmin: boolean; changed: () => void;
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
    if (!confirm('¿Quitar la foto de la comunidad?')) return;
    setBusy(true); setErr('');
    try { await save(null); } catch (x: any) { setErr(x.message); }
    setBusy(false);
  };

  if (!url && !isAdmin) return null;
  return (
    <div class="cphoto-wrap">
      {url
        ? <a class={`cphoto${busy ? ' busy' : ''}`} href={url} target="_blank" rel="noopener">
            <img src={url} alt={`Foto del grupo ${name}`} loading="lazy" />
          </a>
        : <label class={`cphoto empty${busy ? ' busy' : ''}`}>
            <span>📷</span><b>Agregá una foto de todos</b><span class="muted">La ven todos los miembros</span>
            <input type="file" accept="image/*" hidden disabled={busy} onChange={onFile} />
          </label>}
      {url && isAdmin && (
        <div class="cphoto-actions">
          <label class="btn sm">{busy ? 'Subiendo…' : 'Cambiar foto'}<input type="file" accept="image/*" hidden disabled={busy} onChange={onFile} /></label>
          <button class="btn sm" disabled={busy} onClick={remove}>Quitar</button>
        </div>
      )}
      {!url && busy && <p class="muted" style="margin-top:6px">Subiendo…</p>}
      {err && <p class="err">{err}</p>}
    </div>
  );
}
