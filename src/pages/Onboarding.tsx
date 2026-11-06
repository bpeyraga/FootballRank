import { useEffect, useState } from 'preact/hooks';
import { ATTRS, POS, ovr, sb, uploadPhoto, type Pos, type Profile, type Stats } from '../lib/supabase';
import { Radar } from '../lib/Radar';
import { TEAMS_ASCENSO, TEAMS_PRIMERA } from '../lib/teams';

/** Ficha inicial y edición de perfil (con `cancel` es modo edición). */
export function Onboarding({ me, done, cancel }: { me: Profile; done: () => void; cancel?: () => void }) {
  const [name, setName] = useState(me.name);
  const [nickname, setNickname] = useState(me.nickname ?? '');
  const [shirt, setShirt] = useState(me.shirt_number ? String(me.shirt_number) : '');
  const [team, setTeam] = useState(me.fav_team ?? '');
  const [pos, setPos] = useState<Pos>(me.pos);
  const [photo, setPhoto] = useState(me.photo_url);
  const [stats, setStats] = useState<Stats>({ rit: 50, tir: 50, pas: 50, reg: 50, def: 50, fis: 50 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!cancel) return;
    setBusy(true);
    sb.from('base_stats').select('rit,tir,pas,reg,def,fis').eq('profile_id', me.id).maybeSingle()
      .then(({ data, error }) => { if (error) setErr(error.message); else if (data) setStats(data as Stats); setBusy(false); });
  }, [me.id]);

  const shirtNum = shirt === '' ? null : +shirt;
  const shirtOk = shirtNum === null || (Number.isInteger(shirtNum) && shirtNum >= 1 && shirtNum <= 99);

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
      .update({ name: name.trim(), nickname: nickname.trim() || null, shirt_number: shirtNum, fav_team: team || null, pos, photo_url: photo, onboarded: true }).eq('id', me.id);
    setBusy(false);
    if (p.error) setErr(p.error.message); else done();
  };

  return (
    <div class="wrap">
      {cancel && <a href="#/" class="muted">← Volver</a>}
      <h2 style="margin:8px 0 12px">{cancel ? 'Editar perfil' : 'Tu ficha'}</h2>
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
        <label class="field"><span>Apodo <span class="muted">(opcional, es lo que ven los demás)</span></span>
          <input value={nickname} maxLength={20} placeholder="El Chino"
            onInput={e => setNickname((e.target as HTMLInputElement).value)} /></label>
        <label class="field"><span>Número de camiseta favorito</span>
          <input type="number" inputMode="numeric" min={1} max={99} value={shirt} placeholder="10"
            onInput={e => setShirt((e.target as HTMLInputElement).value)} /></label>
        {!shirtOk && <p class="err">El número tiene que ser entre 1 y 99.</p>}
        <label class="field"><span>¿De qué equipo sos hincha?</span>
          <select value={team} onChange={e => setTeam((e.target as HTMLSelectElement).value)}>
            <option value="">— Ninguno —</option>
            {team && !TEAMS_PRIMERA.includes(team) && !TEAMS_ASCENSO.includes(team) && <option value={team}>{team}</option>}
            <optgroup label="Primera División">{TEAMS_PRIMERA.map(t => <option value={t}>{t}</option>)}</optgroup>
            <optgroup label="Ascenso">{TEAMS_ASCENSO.map(t => <option value={t}>{t}</option>)}</optgroup>
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
      <button class="btn primary block" disabled={busy || !name.trim() || !shirtOk} onClick={save}>
        {busy ? 'Guardando…' : cancel ? 'Guardar' : 'Listo'}
      </button>
      {cancel && <button class="btn block" style="margin-top:8px" disabled={busy} onClick={cancel}>Cancelar</button>}
      {err && <p class="err">{err}</p>}
    </div>
  );
}
