import { useEffect, useState } from 'preact/hooks';
import { approveClaim, pendingClaims, rejectClaim } from './api';
import type { Claim } from './model';
import { Avatar } from '../../shared/ui/Avatar';
import { playerError } from './players';

/**
 * Solo el owner: pedidos de "¿Sos vos?" sobre jugadores cargados a mano. Aprobar le pasa a esa cuenta todo el historial
 * del jugador (approve_claim); rechazar borra el pedido (reject_claim). No muestra nada si no hay pedidos.
 */
export function ClaimsCard({ communityId, onChanged }: { communityId: string; onChanged: () => void | Promise<void> }) {
  const [list, setList] = useState<Claim[]>([]);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  const load = async () => {
    // Si la función todavía no existe en el servidor (migración sin aplicar) no mostramos nada.
    try { setList(await pendingClaims(communityId)); } catch { /* nada */ }
  };
  useEffect(() => { setList([]); load(); }, [communityId]);

  const act = async (c: Claim, kind: 'approve' | 'reject') => {
    if (busy) return;
    if (kind === 'approve' && !confirm(
      `¿Aprobar que ${c.claimant_name} es ${c.placeholder_name}?\n\nTodo el historial de ${c.placeholder_name} (votos, partidos, goles, mensajes) pasa a la cuenta de ${c.claimant_name}, y el perfil que ${c.claimant_name} tiene ahora se junta con este. No se puede deshacer.`)) return;
    setBusy(c.placeholder_id + c.claimant_id); setErr('');
    const e = await (kind === 'approve' ? approveClaim : rejectClaim)(c.placeholder_id, c.claimant_id)
      .then(() => '', (x: any) => (x?.message as string) || 'Error de red');
    setBusy('');
    if (e) setErr(playerError(e));
    await load();
    if (!e && kind === 'approve') await onChanged();
  };

  if (!list.length) return err ? <p class="err">{err}</p> : null;
  return (
    <div class="card clm-card" aria-label="Pedidos para reclamar perfil">
      <h3 style="margin-bottom:4px">Pedidos para reclamar perfil ({list.length})</h3>
      <p class="muted adm-note">Alguien dice que es uno de los jugadores que cargaste. Si lo aprobás, se queda con su historial.</p>
      {list.map(c => {
        const mine = busy === c.placeholder_id + c.claimant_id;
        return (
          <div class="clm-row">
            <div class="row" style="gap:10px;min-width:0">
              <Avatar p={{ name: c.claimant_name, photo_url: c.claimant_photo }} />
              <div style="min-width:0;flex:1">
                <b class="ellipsis" style="display:block">{c.claimant_name}</b>
                <div class="muted" style="font-size:.9rem">dice que es <b>{c.placeholder_name}</b></div>
              </div>
            </div>
            <div class="clm-acts">
              <button class="btn primary sm" disabled={!!busy} onClick={() => act(c, 'approve')}>{mine ? 'Un momento…' : 'Aprobar'}</button>
              <button class="btn sm danger" disabled={!!busy} onClick={() => act(c, 'reject')}>Rechazar</button>
            </div>
          </div>
        );
      })}
      {err && <p class="err" role="alert">{err}</p>}
    </div>
  );
}
