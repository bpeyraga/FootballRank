import { useEffect, useState } from 'preact/hooks';
import { hasMyClaim, rejectClaim, requestClaim } from './api';
import { playerError } from './players';

/**
 * En la página de un jugador sin cuenta: "¿Sos vos? Reclamá este perfil".
 * Manda el pedido (request_claim) y queda pendiente hasta que el owner lo apruebe o lo rechace; se puede cancelar.
 */
export function ClaimProfile({ placeholderId, meId, name }: { placeholderId: string; meId: string; name: string }) {
  const [state, setState] = useState<'loading' | 'none' | 'pending'>('loading');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    setState('loading'); setErr('');
    hasMyClaim(placeholderId, meId).then(yes => { if (alive) setState(yes ? 'pending' : 'none'); });
    return () => { alive = false; };
  }, [placeholderId, meId]);

  const claim = async () => {
    setBusy(true); setErr('');
    const e = await requestClaim(placeholderId).then(() => '', (x: any) => (x?.message as string) || 'Error de red');
    setBusy(false);
    if (e) setErr(e.includes('not_placeholder') ? 'Este perfil ya tiene dueño.' : playerError(e));
    else setState('pending');
  };
  const cancel = async () => {
    setBusy(true); setErr('');
    const e = await rejectClaim(placeholderId, meId).then(() => '', (x: any) => (x?.message as string) || 'Error de red');
    setBusy(false);
    if (e && !e.includes('no_claim')) setErr(playerError(e));
    else setState('none');
  };

  if (state === 'loading') return null;
  return (
    <div class="card claim-card">
      {state === 'pending'
        ? <>
            <p><b>Pedido enviado</b>, lo aprueba el owner.</p>
            <p class="muted" style="font-size:.9rem;margin-top:2px">Cuando lo apruebe, este perfil pasa a ser tuyo con todo su historial.</p>
            <button class="linkbtn" style="margin-top:6px" disabled={busy} onClick={cancel}>Cancelar pedido</button>
          </>
        : <>
            <p><b>¿Sos vos?</b> Reclamá este perfil.</p>
            <p class="muted" style="font-size:.9rem;margin:2px 0 10px">{name} lo cargó el admin y todavía no tiene cuenta. Si sos esa persona, pedilo: el owner lo aprueba y te quedás con sus votos, partidos y stats.</p>
            <button class="btn primary block" disabled={busy} onClick={claim}>{busy ? 'Enviando…' : 'Reclamar este perfil'}</button>
          </>}
      {err && <p class="err" role="alert">{err}</p>}
    </div>
  );
}
