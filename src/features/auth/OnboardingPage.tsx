import './roles.css';
import { useEffect, useState } from 'preact/hooks';
import { go } from '../../app/router';
import { ATTRS, POS, ovr, type Pos, type Profile, type Stats } from '../../shared/supabase';
import { loadAccount, loadBaseStats, saveMyProfile, setMyRoles, uploadPhoto, type Account } from './api';
import { RolePicker } from './RolePicker';
import { ProfileSettings } from './ProfileSettings';
import {
  clearIntent, defaultChoice, routeAfterSetup, choiceFlags, needsRoleChoice, readIntent, roleErrorText, roleFlags,
  type RoleChoice, type RoleFlags,
} from './roles';
import { Radar } from '../../shared/ui/Radar';
import { GkSlider } from '../../shared/ui/GkSlider';
import { TEAMS_ASCENSO, TEAMS_PRIMERA } from '../../shared/teams';
import { Crest } from '../../shared/ui/Crest';
import { ZonePicker } from '../zone/ZonePicker';
import { clearMyZone, loadMyZone, saveMyZone } from '../zone/api';
import { normalizeZone, sameZone, zoneErrorText, type ZoneDraft } from '../zone/model';

/**
 * Primer ingreso y edición de perfil (con `cancel` es modo edición).
 * Primer ingreso: si todavía no eligió rol (`role_chosen` en false) empieza por "¿Cómo vas a usar la app?" (jugador, dueño de cancha
 * o ambos); después viene la ficha de jugador, salvo que sea solo dueño de cancha (esa persona va directo a `#/duenio`).
 * Edición: además de la ficha, un bloque para activar o apagar "Juego al fútbol" y "También tengo cancha".
 */
export function Onboarding({ me, done, cancel }: { me: Profile; done: () => void; cancel?: () => void }) {
  const editing = !!cancel;
  // Si entró por "¿Tenés una cancha?" de la landing, "Dueño de cancha" aparece marcado
  const [intent] = useState(() => readIntent());
  const [step, setStep] = useState<'role' | 'ficha'>(!editing && needsRoleChoice(me) ? 'role' : 'ficha');
  const [choice, setChoice] = useState<RoleChoice>(() => defaultChoice(intent));
  const flags0 = roleFlags(me);
  const [flags, setFlags] = useState<RoleFlags>(flags0);
  const [name, setName] = useState(me.name);
  const [nickname, setNickname] = useState(me.nickname ?? '');
  const [shirt, setShirt] = useState(me.shirt_number ? String(me.shirt_number) : '');
  const [team, setTeam] = useState(me.fav_team ?? '');
  const [pos, setPos] = useState<Pos>(me.pos);
  const [photo, setPhoto] = useState(me.photo_url);
  const [stats, setStats] = useState<Stats>({ rit: 50, tir: 50, pas: 50, reg: 50, def: 50, fis: 50 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // ¿Dónde jugás? (opcional): lo guardado y lo que se está editando; solo se escribe si cambió
  const [zone, setZone] = useState<ZoneDraft | null>(null);
  const [zone0, setZone0] = useState<ZoneDraft | null>(null);

  // Datos de la cuenta (de la sesión local, sin pedir nada al servidor)
  const [acct, setAcct] = useState<Account | null>(null);
  useEffect(() => { loadAccount().then(setAcct, () => {}); }, []);
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });

  useEffect(() => {
    if (!cancel) return;
    setBusy(true);
    loadBaseStats(me.id)
      .then(s => { if (s) setStats(s); }, (e: any) => setErr(e?.message ?? 'Error de red'))
      .then(() => setBusy(false));
  }, [me.id]);

  useEffect(() => {
    if (!cancel) return;
    let live = true;
    loadMyZone().then(z => { if (live && z) { setZone(cur => cur ?? z); setZone0(z); } }, () => {});
    return () => { live = false; };
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

  /** Termina el alta (no la edición): el dueño que no juega, o el que entró por la puerta de dueños, va a su panel; el resto, al inicio. */
  const finish = (f: RoleFlags) => {
    const dest = routeAfterSetup(f, intent, location.hash);
    clearIntent();
    if (dest !== null) go(dest);
    done();
  };

  const chooseRole = async () => {
    const f = choiceFlags(choice);
    setBusy(true); setErr('');
    try { await setMyRoles(f.player, f.owner); } catch (e) { setBusy(false); return setErr(roleErrorText(e)); }
    setBusy(false);
    setFlags(f);
    // Solo dueño de cancha (o jugador que ya tenía la ficha completa): no hay ficha que armar
    if (!f.player || me.onboarded) finish(f); else setStep('ficha');
  };

  const rolesChanged = editing && (flags.player !== flags0.player || flags.owner !== flags0.owner);

  const save = async () => {
    setBusy(true); setErr('');
    try {
      await saveMyProfile(me.id, stats, { name: name.trim(), nickname: nickname.trim() || null, shirt_number: shirtNum, fav_team: team || null, pos, photo_url: photo });
    } catch (e: any) { setBusy(false); return setErr(e?.message ?? 'Error de red'); }
    // La zona va aparte: si falla, el perfil ya quedó guardado y se puede reintentar
    if (!sameZone(zone, zone0)) {
      try {
        const z = zone && normalizeZone(zone);
        if (z) await saveMyZone(z); else await clearMyZone();
        setZone0(z);
      } catch (e) {
        // Editando: se muestra el error y se puede reintentar. En la primera ficha no se traba a nadie: el perfil ya quedó guardado
        // y la zona se puede cargar después desde "Editar perfil".
        if (cancel) { setBusy(false); return setErr('Guardamos tu perfil, pero no pudimos guardar tu zona. ' + zoneErrorText(e)); }
      }
    }
    // Los roles también van aparte (misma lógica: el perfil ya quedó guardado y se puede reintentar)
    if (rolesChanged) {
      try { await setMyRoles(flags.player, flags.owner); }
      catch (e) { setBusy(false); return setErr('Guardamos tu perfil, pero ' + roleErrorText(e).charAt(0).toLowerCase() + roleErrorText(e).slice(1)); }
    }
    setBusy(false);
    if (editing) done(); else finish(flags);
  };

  if (step === 'role') {
    return (
      <div class="wrap rl-wrap">
        <div class="rl-head">
          <span class="kicker">Bienvenido</span>
          <h2>¿Cómo vas a usar Fútbol Rank?</h2>
          <p class="muted">Elegí una opción. Lo podés cambiar después desde tu perfil.</p>
        </div>
        {intent === 'owner' && <p class="rl-tip" role="status">Entraste por la puerta de dueños de cancha, así que ya te marcamos esa opción.</p>}
        <RolePicker value={choice} onChange={c => { setChoice(c); setErr(''); }} disabled={busy} />
        {err && <p class="err" role="alert">{err}</p>}
        <button class="btn primary block rl-go" disabled={busy} onClick={chooseRole}>{busy ? 'Guardando…' : 'Seguir'}</button>
        <p class="rl-note muted">
          {choice === 'owner' ? 'Vas directo a tu panel de dueño: cargás tu complejo, tus canchas y tus horarios.'
            : choice === 'both' ? 'Primero armás tu ficha de jugador y después tenés disponible tu panel de dueño.'
            : 'Ahora armás tu ficha de jugador: posición, foto y tus stats.'}
        </p>
      </div>
    );
  }

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
          <div class="row" style="gap:10px">
          {team && <Crest team={team} size={20} />}
          <select style="flex:1" value={team} onChange={e => setTeam((e.target as HTMLSelectElement).value)}>
            <option value="">— Ninguno —</option>
            {team && !TEAMS_PRIMERA.includes(team) && !TEAMS_ASCENSO.includes(team) && <option value={team}>{team}</option>}
            <optgroup label="Primera División">{TEAMS_PRIMERA.map(t => <option value={t}>{t}</option>)}</optgroup>
            <optgroup label="Ascenso">{TEAMS_ASCENSO.map(t => <option value={t}>{t}</option>)}</optgroup>
          </select>
          </div></label>
      </div>
      <div class="card">
        <div class="row" style="justify-content:space-between;margin-bottom:8px">
          <h3>Tus stats</h3><h3 title={`OVR como ${pos}`}>OVR {ovr(stats, pos)}</h3>
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
        <GkSlider value={stats.arq} onChange={arq => setStats({ ...stats, arq })} />
      </div>
      <div class="card zn-where">
        <h3>¿Dónde jugás? <span class="muted" style="font:500 .85rem var(--f-body)">(opcional)</span></h3>
        <p class="muted">Sumate al ranking de tu zona y mirá quién es el mejor de tu barrio.{cancel ? '' : ' Podés saltearlo y hacerlo después desde tu perfil.'}</p>
        <ZonePicker value={zone} onChange={setZone} disabled={busy} />
      </div>
      {editing && (
        <div class="card rl-edit">
          <h3>Cómo usás la app</h3>
          <label class="zn-switch">
            <input type="checkbox" role="switch" checked={flags.player} disabled={busy || (flags.player && !flags.owner)}
              onChange={e => setFlags(f => ({ ...f, player: (e.target as HTMLInputElement).checked }))} />
            <span class="zn-track" aria-hidden="true"><i /></span>
            <span class="zn-switch-copy"><b>Juego al fútbol</b>
              <small class="muted">{flags.player ? 'Tenés tu carta, tus grupos y tus partidos.' : 'Tu inicio pasa a ser el panel de dueño. Tus grupos y tu ficha se conservan.'}</small></span>
          </label>
          <label class="zn-switch">
            <input type="checkbox" role="switch" checked={flags.owner} disabled={busy || (flags.owner && !flags.player)}
              onChange={e => setFlags(f => ({ ...f, owner: (e.target as HTMLInputElement).checked }))} />
            <span class="zn-track" aria-hidden="true"><i /></span>
            <span class="zn-switch-copy"><b>{flags.player ? 'También tengo cancha' : 'Tengo cancha'}</b>
              <small class="muted">{flags.owner ? 'Manejás turnos y reservas de tu complejo desde el panel de dueño.' : 'Activalo para publicar tus canchas y recibir reservas.'}</small></span>
          </label>
          {flags0.owner && !rolesChanged && <a class="rl-link" href="#/duenio">Ir a mi panel de dueño →</a>}
          {rolesChanged && <p class="muted rl-pending">Se guarda cuando toques “Guardar”.</p>}
        </div>
      )}
      {cancel && acct && (
        <div class="card acct">
          <h3 style="margin-bottom:10px">Tu cuenta</h3>
          <dl>
            <dt>Email</dt><dd>{acct.email}</dd>
            <dt>Entrás con</dt><dd>{acct.via}</dd>
            <dt>Cuenta creada</dt><dd>{fmtDate(acct.created)}</dd>
            {acct.last && <><dt>Sesión iniciada</dt><dd>{fmtDate(acct.last)}</dd></>}
          </dl>
          <p class="muted" style="margin-top:10px;font-size:.82rem">Tu email solo lo ves vos: no se muestra a los demás jugadores.</p>
        </div>
      )}
      <button class="btn primary block" disabled={busy || !name.trim() || !shirtOk} onClick={save}>
        {busy ? 'Guardando…' : cancel ? 'Guardar' : 'Listo'}
      </button>
      {cancel && <button class="btn block" style="margin-top:8px" disabled={busy} onClick={cancel}>Cancelar</button>}
      {err && <p class="err">{err}</p>}
      {/* Solo al editar: ajustes y ayuda (lo que antes estaba en el menú de la foto) */}
      {cancel && <ProfileSettings player={me.is_player !== false} />}
    </div>
  );
}
