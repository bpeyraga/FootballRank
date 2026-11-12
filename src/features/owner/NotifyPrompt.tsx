import { useEffect, useState } from 'preact/hooks';
import { pushOn, pushStatus, type PushStatus } from '../push/push';

const KEY = 'fr-ow-notify-dismissed';
const dismissed = () => { try { return sessionStorage.getItem(KEY) === '1'; } catch { return false; } };

/**
 * Invitación suave a activar los avisos: un dueño que no juega nunca pasa por el inicio de los jugadores (donde están los avisos),
 * y sin ellos no se entera de los pedidos de turno. Solo aparece si este celular todavía no los tiene (y se puede cerrar por esta sesión).
 * No molesta si el navegador los bloqueó o no los soporta (ahí no hay nada que ofrecer).
 */
export function NotifyPrompt({ onInstall }: { onInstall: () => void }) {
  const [st, setSt] = useState<PushStatus | null>(null);
  const [hide, setHide] = useState(dismissed);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => { pushStatus().then(setSt, () => setSt('unsupported')); }, []);

  if (hide || (st !== 'off' && st !== 'ios-install' && !msg)) return null;   // con mensaje: se ve el "¡Listo!" hasta que se cierra
  const close = () => { try { sessionStorage.setItem(KEY, '1'); } catch { /* sin storage */ } setHide(true); };
  const on = async () => {
    setBusy(true); setMsg('');
    const err = await pushOn();
    setBusy(false);
    // Con error puede haber quedado activado igual (el aviso de prueba no salió): se relee el estado para no ofrecer "Activar" de nuevo.
    if (err) { setMsg(err); pushStatus().then(setSt, () => {}); } else { setMsg('¡Listo! Te mandamos un aviso de prueba.'); setSt('on'); setTimeout(close, 2500); }
  };

  return (
    <div class="card note ow-notify" role="status">
      <span aria-hidden="true" class="ow-notify-ico">🔔</span>
      <div class="ow-notify-copy">
        <b>Enterate cuando te piden un turno</b>
        <span>{st === 'ios-install'
          ? 'En iPhone los avisos funcionan con la app instalada en la pantalla de inicio.'
          : 'Activá los avisos en este celular y te llega una notificación con cada pedido o cancelación.'}</span>
        {msg && <small>{msg}</small>}
      </div>
      <div class="ow-notify-actions">
        {st === 'ios-install'
          ? <button class="btn sm primary" onClick={onInstall}>Cómo instalarla</button>
          : st === 'off' && <button class="btn sm primary" disabled={busy} onClick={on}>{busy ? 'Activando…' : 'Activar avisos'}</button>}
        <button class="btn sm" onClick={close} aria-label="Ahora no">Ahora no</button>
      </div>
    </div>
  );
}
