import { useEffect, useState } from 'preact/hooks';
import { sb, type Profile } from '../lib/supabase';
import { go, slugify } from '../lib/router';

interface Row { role: string; community: { id: string; name: string; slug: string } }

export function Home({ me }: { me: Profile }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    sb.from('memberships').select('role, community:communities(id,name,slug)').eq('profile_id', me.id)
      .then(({ data, error }) => { if (error) setErr(error.message); else setRows((data ?? []) as any); });
  }, [me.id]);

  const create = async () => {
    setBusy(true); setErr('');
    const base = slugify(name) || 'comunidad';
    let slug = base.length >= 3 ? base : base + '-fc';
    let res = await sb.rpc('create_community', { p_name: name.trim(), p_slug: slug });
    if (res.error?.code === '23505') { // slug ocupado
      slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
      res = await sb.rpc('create_community', { p_name: name.trim(), p_slug: slug });
    }
    setBusy(false);
    if (res.error) setErr(res.error.message); else go(`c/${slug}`);
  };

  return (
    <div class="wrap">
      <div class="row" style="justify-content:space-between;margin-bottom:16px">
        <h2>Hola, {me.name}</h2>
        <div class="row">
          <a class="btn sm" href="#/perfil">Editar perfil</a>
          <button class="btn sm" onClick={() => sb.auth.signOut()}>Cerrar sesión</button>
        </div>
      </div>

      <h3 style="margin-bottom:8px">Tus comunidades</h3>
      {rows === null && !err && <p class="muted">Cargando…</p>}
      {rows?.length === 0 && <div class="card"><p class="muted">Todavía no estás en ninguna. Creá una o pedí el link de invitación.</p></div>}
      {rows?.map(r => (
        <a class="card row" style="justify-content:space-between;text-decoration:none;color:inherit" href={`#/c/${r.community.slug}`}>
          <b>{r.community.name}</b>
          <span class="muted">{r.role === 'owner' ? 'Owner' : r.role === 'admin' ? 'Admin' : 'Miembro'}</span>
        </a>
      ))}

      {creating ? (
        <div class="card">
          <label class="field"><span>Nombre de la comunidad</span>
            <input value={name} maxLength={60} placeholder="Fútbol de los jueves"
              onInput={e => setName((e.target as HTMLInputElement).value)} /></label>
          <div class="row">
            <button class="btn primary" disabled={busy || !name.trim()} onClick={create}>{busy ? 'Creando…' : 'Crear'}</button>
            <button class="btn" onClick={() => setCreating(false)}>Cancelar</button>
          </div>
        </div>
      ) : (
        <button class="btn primary block" onClick={() => setCreating(true)}>+ Crear comunidad</button>
      )}
      {err && <p class="err">{err}</p>}
    </div>
  );
}
