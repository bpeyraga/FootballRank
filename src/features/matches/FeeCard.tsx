import { useState } from 'preact/hooks';
import { displayName, type Profile } from '../../shared/model';
import { Avatar } from '../../shared/ui/Avatar';
import { feeNum, money, perPerson, settle, type FeePayment } from './fees';

export interface FeePlayer { profile: Profile; paid: boolean }

/** El alias con un botón para copiarlo. */
function AliasCopy({ alias }: { alias: string }) {
  const [state, setState] = useState<'' | 'ok' | 'err'>('');
  const copy = async () => {
    try { await navigator.clipboard.writeText(alias); setState('ok'); }
    catch { setState('err'); }
    setTimeout(() => setState(''), 1800);
  };
  return (
    <div class="fee-alias">
      <code class="ellipsis" title={alias}>{alias}</code>
      <button class="btn sm" onClick={copy}>{state === 'ok' ? '¡Copiado!' : state === 'err' ? 'Copialo a mano' : 'Copiar alias'}</button>
    </div>
  );
}

type PayForm = { pid: string; amount: string; alias: string; isNew: boolean };

/**
 * "💸 Cancha": costo total, cuánto le toca a cada uno, quiénes pusieron plata (la seña, el resto…) con su alias, y a
 * quién le transfiere cada uno (la app reparte sola: ver settle()).
 * Cada uno marca "Ya pagué"; los admins y los que pusieron plata marcan a cualquiera. Los admins cargan el costo.
 */
export function FeeCard({ total, players, meId, isAdmin, busy, error, onPaid, onSetFee, payments = [], profileOf, onSetPayment }: {
  total: number | null; players: FeePlayer[]; meId: string; isAdmin: boolean;
  busy: string[]; // ids con un cambio en camino: su botón espera
  error?: string; // error al marcar un pago (la card se encarga de los suyos al guardar el costo y los aportes)
  onPaid: (pid: string, paid: boolean) => void;
  onSetFee: (total: number | null) => Promise<string>; // devuelve el error o ''
  payments?: FeePayment[];
  profileOf: (id: string) => Profile;
  onSetPayment?: (pid: string, amount: number | null, alias: string | null) => Promise<string>; // devuelve el error o ''
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [pay, setPay] = useState<PayForm | null>(null);

  const has = feeNum(total) != null;
  if (!has && !isAdmin) return null;

  const n = players.length;
  const each = perPerson(total, n);
  const typed = val.trim() === '' ? NaN : Math.round(+val);
  const valid = Number.isFinite(typed) && typed > 0 && typed <= 10_000_000;

  const open = () => { setVal(has ? String(Math.round(total!)) : ''); setErr(''); setEditing(true); };
  const save = async (v: number | null) => {
    setSaving(true); setErr('');
    const e = await onSetFee(v);
    setSaving(false);
    if (e) setErr(e); else setEditing(false);
  };

  const form = editing && (
    <div class="fee-form">
      <label class="field"><span>Costo de la cancha (total, en pesos)</span>
        <input type="number" inputMode="numeric" min={1} max={10000000} step={1} placeholder="Ej: 30000" value={val}
          onInput={e => setVal((e.target as HTMLInputElement).value)} />
      </label>
      {valid && n > 0 && <p class="muted fee-hint">Son {money(perPerson(typed, n))} por cabeza entre {n} {n === 1 ? 'jugador' : 'jugadores'}.</p>}
      <div class="row" style="flex-wrap:wrap">
        <button class="btn primary" disabled={saving || !valid} onClick={() => save(typed)}>{saving ? 'Guardando…' : 'Guardar'}</button>
        <button class="btn" disabled={saving} onClick={() => setEditing(false)}>Cancelar</button>
        {has && <button class="btn danger" disabled={saving} onClick={() => confirm('¿Sacar la cuota de este partido?') && save(null)}>Sacar cuota</button>}
      </div>
    </div>
  );

  if (!has) {
    return (
      <div class="card fee-card">
        <h3>💸 Cancha</h3>
        {!editing && <>
          <p class="muted fee-empty">Cargá lo que sale la cancha y cada uno marca cuando pagó su parte.</p>
          <button class="btn sm" onClick={open}>Cargar costo de la cancha</button>
        </>}
        {form}
        {err && <p class="err">{err}</p>}
      </div>
    );
  }

  // Orden fijo por nombre: el reparto no cambia solo cuando alguien marca que pagó
  const sorted = [...players].sort((a, b) => displayName(a.profile).localeCompare(displayName(b.profile), 'es') || a.profile.id.localeCompare(b.profile.id));
  const st = settle(total, sorted.map(p => p.profile.id), payments);
  const paidOf = new Map(players.map(p => [p.profile.id, p.paid]));
  const settled = (id: string) => paidOf.get(id) || !st.owes.has(id); // marcó "pagué" o lo que puso le cubre su parte
  const done = sorted.filter(p => settled(p.profile.id)).length;
  const missing = sorted.reduce((t, p) => t + (settled(p.profile.id) ? 0 : st.owes.get(p.profile.id) ?? 0), 0);
  const putBy = new Map(payments.map(p => [p.profile_id, p]));
  const iContributed = putBy.has(meId);
  const iPlay = players.some(p => p.profile.id === meId);
  const nameOf = (id: string) => displayName(profileOf(id));

  // ---------- Aportes ----------
  const others = (pid: string) => payments.filter(p => p.profile_id !== pid).reduce((t, p) => t + Number(p.amount), 0);
  const maxFor = (pid: string) => Math.max(0, Math.round(total! - others(pid)));
  const startNew = (pid: string) => { setErr(''); setPay({ pid, amount: String(st.courtDue || ''), alias: '', isNew: true }); };
  const startEdit = (p: FeePayment) => { setErr(''); setPay({ pid: p.profile_id, amount: String(Math.round(Number(p.amount))), alias: p.alias ?? '', isNew: false }); };
  const savePay = async (pid: string, amount: number | null, alias: string | null) => {
    if (!onSetPayment) return;
    setSaving(true); setErr('');
    const e = await onSetPayment(pid, amount, alias);
    setSaving(false);
    if (e) setErr(e); else setPay(null);
  };
  const canEditPay = (pid: string) => !!onSetPayment && (isAdmin || pid === meId);

  const payForm = pay && (() => {
    const amt = pay.amount.trim() === '' ? NaN : Math.round(+pay.amount);
    const max = maxFor(pay.pid);
    const ok = !!pay.pid && Number.isFinite(amt) && amt > 0 && amt <= max && pay.alias.trim().length <= 60;
    const candidates = sorted.filter(p => !putBy.has(p.profile.id) || p.profile.id === pay.pid);
    return (
      <div class="fee-payer">
        {pay.isNew && isAdmin ? (
          <label class="field"><span>¿Quién puso plata?</span>
            <select value={pay.pid} onChange={e => setPay({ ...pay, pid: (e.target as HTMLSelectElement).value })}>
              <option value="">— Elegí un jugador —</option>
              {candidates.map(p => <option value={p.profile.id}>{displayName(p.profile)}{p.profile.id === meId ? ' (vos)' : ''}</option>)}
            </select>
          </label>
        ) : <p class="fee-hint" style="margin:0 0 10px"><b>{nameOf(pay.pid)}</b>{pay.pid === meId && ' (vos)'}</p>}
        <label class="field"><span>¿Cuánto puso? (la seña o lo que pagó)</span>
          <input type="number" inputMode="numeric" min={1} max={max} step={1} placeholder={`Hasta ${money(max)}`} value={pay.amount}
            onInput={e => setPay({ ...pay, amount: (e.target as HTMLInputElement).value })} />
        </label>
        {Number.isFinite(amt) && amt > max && <p class="err" style="margin:-6px 0 10px">Entre todos los aportes no pueden pasar {money(total!)}: como mucho {money(max)}.</p>}
        <label class="field"><span>Alias, CBU o CVU para que le transfieran</span>
          <input value={pay.alias} maxLength={60} placeholder="Ej: juan.perez.mp" autocomplete="off"
            onInput={e => setPay({ ...pay, alias: (e.target as HTMLInputElement).value })} />
        </label>
        <p class="muted fee-hint">Si lo dejás vacío, se usa el último alias que cargó en este grupo.</p>
        <div class="row" style="flex-wrap:wrap;margin-top:10px">
          <button class="btn primary" disabled={saving || !ok} onClick={() => savePay(pay.pid, amt, pay.alias.trim() || null)}>{saving ? 'Guardando…' : 'Guardar'}</button>
          <button class="btn" disabled={saving} onClick={() => { setPay(null); setErr(''); }}>Cancelar</button>
          {!pay.isNew && <button class="btn danger" disabled={saving}
            onClick={() => confirm(`¿Sacar lo que puso ${nameOf(pay.pid)}?`) && savePay(pay.pid, null, null)}>Sacar aporte</button>}
        </div>
      </div>
    );
  })();

  const contribs = onSetPayment && (
    <div class="fee-contribs">
      <h4 class="fee-sub">Quiénes pusieron plata</h4>
      {payments.length === 0 && !pay && <p class="muted fee-hint">¿Alguien señó o pagó la cancha? Cargá cuánto puso y su alias: la app reparte a quién le transfiere cada uno.</p>}
      {payments.map(p => {
        if (pay && !pay.isNew && pay.pid === p.profile_id) return payForm;
        const r = st.receive.get(p.profile_id) ?? 0;
        return (
          <div class="fee-payer">
            <div class="fee-payer-who">
              <Avatar p={profileOf(p.profile_id)} size={36} />
              <div style="flex:1;min-width:0">
                <b class="ellipsis" style="display:block">{nameOf(p.profile_id)}{p.profile_id === meId && <span class="muted"> (vos)</span>}</b>
                <span class="muted fee-payer-lbl">🏦 Puso {money(Number(p.amount))}{r > 0 && <> · recibe {money(r)}</>}</span>
              </div>
              {canEditPay(p.profile_id) && !pay && <button class="linkbtn" onClick={() => startEdit(p)}>Editar</button>}
            </div>
            {p.alias ? <AliasCopy alias={p.alias} /> : <p class="muted fee-hint">{p.profile_id === meId ? 'Cargá tu alias para que te transfieran: tocá "Editar".' : 'Todavía no dejó un alias.'}</p>}
          </div>
        );
      })}
      {pay?.isNew && payForm}
      {st.courtDue > 0 && <p class="fee-court">Falta pagarle a la cancha: <b>{money(st.courtDue)}</b>{payments.length > 0 && <span class="muted"> · cuando alguien lo pague, cargalo acá</span>}</p>}
      {!pay && st.courtDue > 0 && (isAdmin
        ? <button class="btn sm" onClick={() => startNew('')}>{payments.length ? 'Agregar otro aporte' : 'Cargar quién puso plata'}</button>
        : iPlay && !iContributed && <button class="btn sm" onClick={() => startNew(meId)}>Yo puse plata para la cancha</button>)}
    </div>
  );

  // ---------- Lo mío ----------
  const myPlan = st.plan.get(meId) ?? [];
  const myLeft = st.unassigned.get(meId) ?? 0;
  const myReceive = st.receive.get(meId) ?? 0;
  const mine = iPlay && !paidOf.get(meId) && (myPlan.length > 0 || myLeft > 0) ? (
    <div class="fee-mine">
      {myPlan.map(t => {
        const alias = putBy.get(t.to)?.alias;
        return (
          <div class="fee-mine-row">
            <p>Transferile <b>{money(t.amount)}</b> a <b>{nameOf(t.to)}</b>{!alias && <span class="muted"> (todavía no dejó alias)</span>}</p>
            {alias && <AliasCopy alias={alias} />}
          </div>
        );
      })}
      {myLeft > 0 && <p class="muted">{myPlan.length ? 'Y te quedan' : 'Tu parte:'} <b>{money(myLeft)}</b>: todavía no hay a quién transferirle (falta cargar quién pagó el resto de la cancha).</p>}
      <p class="muted fee-hint">Cuando transfieras, marcá "Ya pagué".</p>
    </div>
  ) : myReceive > 0 ? (
    <div class="fee-mine"><p>Tenés que recibir <b>{money(myReceive)}</b>. Cuando te transfieran, marcalos como pagados en la lista.</p></div>
  ) : null;

  return (
    <div class="card fee-card">
      <div class="fee-head">
        <h3>💸 Cancha</h3>
        {isAdmin && !editing && <button class="linkbtn" onClick={open}>Editar</button>}
      </div>
      <div class="fee-sum">
        <span class="fee-total">{money(total!)}</span>
        {n > 0 ? <span class="fee-each">{money(each)} c/u</span> : <span class="muted">Todavía no hay anotados para dividir.</span>}
      </div>
      {form}
      {contribs}
      {mine}
      {n > 0 && <>
        <div class="fee-bar" role="progressbar" aria-valuemin={0} aria-valuemax={n} aria-valuenow={done} aria-label="Pagos">
          <i style={`width:${(done / n) * 100}%`} />
        </div>
        <p class="muted fee-count">
          Pagaron {done}/{n}{done === n ? ' · ¡completo!' : ` · faltan ${money(missing)}`}
        </p>
        <div class="fee-list">
          {sorted.map(({ profile: p, paid: ok }) => {
            const isMine = p.id === meId, wait = busy.includes(p.id);
            const due = st.owes.get(p.id) ?? 0, put = putBy.get(p.id), to = st.plan.get(p.id) ?? [];
            const covered = !due; // lo que puso le cubre su parte
            const can = !covered && (isMine || isAdmin || iContributed); // los que pusieron plata marcan a quién les transfirió
            return (
              <div class={`fee-row ${ok || covered ? 'ok' : ''}`}>
                <Avatar p={p} size={30} />
                <span class="ellipsis fee-name">
                  {displayName(p)}{isMine && <span class="muted"> (vos)</span>}
                  {!ok && !covered && to.length > 0 && <span class="muted fee-to"> → {to.map(t => nameOf(t.to)).join(' y ')}</span>}
                </span>
                <span class={`fee-st ${ok || covered ? 'ok' : 'due'}`}>
                  {covered ? `🏦 Puso ${money(Number(put!.amount))}` : ok ? '✅ Pagó' : `⏳ Debe ${money(due)}`}
                </span>
                {can && (
                  <button class={`btn sm ${!ok && isMine ? 'primary' : ''}`} disabled={wait} onClick={() => onPaid(p.id, !ok)}
                    aria-label={`${ok ? 'Deshacer el pago de' : 'Marcar como pagado a'} ${displayName(p)}`}>
                    {ok ? 'Deshacer' : isMine ? 'Ya pagué' : 'Pagó'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </>}
      {(err || error) && <p class="err">{err || error}</p>}
    </div>
  );
}
