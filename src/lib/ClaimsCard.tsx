import { useEffect, useState } from 'preact/hooks';
import { sb } from './supabase';
import { Avatar } from './Avatar';
import { playerError } from './players';

interface Claim {
  placeholder_id: string; placeholder_name: string;
  claimant_id: string; claimant_name: string; claimant_photo: string | null; created_at: string;
}

/**
 * Solo el owner: pedidos de "¿Sos vos?" sobre jugadores cargados a mano. Aprobar le pasa a esa cuenta todo el historial
 * del jugador (approve_claim); rechazar borra el pedido (reject_claim). No muestra nada si no hay pedidos.
 */
export function ClaimsCard({ communityId, onChanged }: { communityId: string; onChanged: () => void | Promise<void> }) {
  const [list, setList] = useState<Claim[]>([]);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  const load = async () => {
    const { data, error } = await sb.rpc('pending_claims', { p_community: communityId });
    if (!error) setList((data ?? []) as Claim[]);
    // Si la función todavía no existe en el servidor (migración sin aplicar) no mostramos nada.
  };
  useEffect(() => { setList([]); load(); }, [communityId]);

  const act = async (c: Claim, kind: 'approve' | 'reject') => {
    if (busy) return;
    if (kind === 'approve' && !confirm(
      `¿Aprobar que ${c.claimant_name} es ${c.placeholder_name}?\n\nTodo el historial de ${c.placeholder_name} (votos, partidos, goles, mensajes) pasa a la cuenta de ${c.claimant_name}, y el perfil que ${c.claimant_name} tiene ahora se junta con este. No se puede deshacer.`)) return;
    setBusy(c.placeholder_id + c.claimant_id); setErr('');
    const { error } = await sb.rpc(kind === 'approve' ? 'approve_claim' : 'reject_claim', { p_placeholder: c.placeholder_id, p_claimant: c.claimant_id });
    setBusy('');
    if (error) setErr(playerError(error.message));
    await load();
    if (!error && kind === 'approve') await onChanged();
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
