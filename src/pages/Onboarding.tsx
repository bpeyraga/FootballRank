import { useState } from 'preact/hooks';
import { ATTRS, POS, ovr, sb, uploadPhoto, type Pos, type Profile, type Stats } from '../lib/supabase';
import { Radar } from '../lib/Radar';

export function Onboarding({ me, done }: { me: Profile; done: () => void }) {
  const [name, setName] = useState(me.name);
  const [pos, setPos] = useState<Pos>(me.pos);
  const [photo, setPhoto] = useState(me.photo_url);
  const [stats, setStats] = useState<Stats>({ rit: 50, tir: 50, pas: 50, reg: 50, def: 50, fis: 50 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const onPhoto = async (e: Event) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    // busy: que no se pueda tocar "Listo" con la foto subiendo (se guardaría la foto vieja)
    setBusy(true); setErr('');
    try { setPhoto(await uploadPhoto(me.id, f)); } catch (x: any) { setErr(x.message); }
    setBusy(false);
  };

  const save = async () => {
    setBusy(true); setErr('');
    const s = await sb.from('base_stats').upsert({ profile_id: me.id, ...stats, updated_at: new Date().toISOString() });
    const p = s.error ? s : await sb.from('profiles')
      .update({ name: name.trim(), pos, photo_url: photo, onboarded: true }).eq('id', me.id);
    setBusy(false);
    if (p.error) setErr(p.error.message); else done();
  };

  return (
    <div class="wrap">
      <h2 style="margin-bottom:12px">Tu ficha</h2>
      <div class="card">
        <div class="row" style="margin-bottom:14px">
          {photo ? <img class="avatar" src={photo} alt="" referrerpolicy="no-referrer" /> : <span class="avatar">{name.charAt(0).toUpperCase() || '?'}</span>}
          <label class="btn">Cambiar foto<input type="file" accept="image/*" hidden onChange={onPhoto} /></label>
        </div>
        <label class="field"><span>Nombre</span>
          <input value={name} maxLength={40} onInput={e => setName((e.target as HTMLInputElement).value)} /></label>
        <label class="field"><span>Posición</span>
          <select value={pos} onChange={e => setPos((e.target as HTMLSelectElement).value as Pos)}>
            {POS.map(p => <option value={p}>{p}</option>)}
          </select></label>
      </div>
      <div class="card">
        <div class="row" style="justify-content:space-between;margin-bottom:8px">
          <h3>Tus stats</h3><h3>OVR {ovr(stats)}</h3>
        </div>
        <p class="muted" style="margin-bottom:12px">Sé honesto: después tus compañeros también te votan.</p>
        <Radar stats={stats} />
        {ATTRS.map(([k, l, full]) => (
          <label class="slider" title={full}>
            <b>{l}</b>
            <input type="range" min={1} max={99} value={stats[k]}
              onInput={e => setStats({ ...stats, [k]: +(e.target as HTMLInputElement).value })} />
            <output>{stats[k]}</output>
          </label>
        ))}
      </div>
      <button class="btn primary block" disabled={busy || !name.trim()} onClick={save}>
        {busy ? 'Guardando…' : 'Listo'}
      </button>
      {err && <p class="err">{err}</p>}
    </div>
  );
}
