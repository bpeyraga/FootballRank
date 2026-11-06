import { useState } from 'preact/hooks';
import { displayName, type Profile } from '../../shared/model';
import { Avatar } from '../../shared/ui/Avatar';
import { feeNum, money, perPerson } from './fees';

export interface FeePlayer { profile: Profile; paid: boolean }

/**
 * "💸 Cancha": costo total del partido, cuánto le toca a cada uno y quién ya pagó.
 * Cada uno marca "Ya pagué" en su fila; los admins marcan a cualquiera y cargan o corrigen el costo.
 */
export function FeeCard({ total, players, meId, isAdmin, busy, error, onPaid, onSetFee }: {
  total: number | null; players: FeePlayer[]; meId: string; isAdmin: boolean;
  busy: string[]; // ids con un cambio en camino: su botón espera
  error?: string; // error al marcar un pago (la card se encarga de los suyos al guardar el costo)
  onPaid: (pid: string, paid: boolean) => void;
  onSetFee: (total: number | null) => Promise<string>; // devuelve el error o ''
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const has = feeNum(total) != null;
  if (!has && !isAdmin) return null;

  const n = players.length, paid = players.filter(p => p.paid).length;
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

  const sorted = [...players].sort((a, b) => displayName(a.profile).localeCompare(displayName(b.profile), 'es'));
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
      {n > 0 && <>
        <div class="fee-bar" role="progressbar" aria-valuemin={0} aria-valuemax={n} aria-valuenow={paid} aria-label="Pagos">
          <i style={`width:${(paid / n) * 100}%`} />
        </div>
        <p class="muted fee-count">
          Pagaron {paid}/{n}{paid === n ? ' · ¡completo!' : ` · faltan ${money((n - paid) * each)}`}
        </p>
        <div class="fee-list">
          {sorted.map(({ profile: p, paid: ok }) => {
            const mine = p.id === meId, can = mine || isAdmin, wait = busy.includes(p.id);
            return (
              <div class={`fee-row ${ok ? 'ok' : ''}`}>
                <Avatar p={p} size={30} />
                <span class="ellipsis fee-name">{displayName(p)}{mine && <span class="muted"> (vos)</span>}</span>
                <span class={`fee-st ${ok ? 'ok' : 'due'}`}>{ok ? '✅ Pagó' : '⏳ Debe'}</span>
                {can && (
                  <button class={`btn sm ${!ok && mine ? 'primary' : ''}`} disabled={wait} onClick={() => onPaid(p.id, !ok)}
                    aria-label={`${ok ? 'Deshacer el pago de' : 'Marcar como pagado a'} ${displayName(p)}`}>
                    {ok ? 'Deshacer' : mine ? 'Ya pagué' : 'Pagó'}
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
