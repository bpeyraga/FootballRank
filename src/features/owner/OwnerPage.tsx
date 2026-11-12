import './owner.css';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useInstall } from '../../app/install';
import { useRoute } from '../../app/router';
import type { Profile } from '../../shared/supabase';
import { Avatar } from '../../shared/ui/Avatar';
import { signOut } from '../auth/api';
import { clearIntent } from '../auth/roles';
import { PushPanel } from '../push/PushPanel';
import { ComplexList } from './ComplexList';
import { ComplexPanel } from './ComplexPanel';
import { ComplexWizard } from './ComplexWizard';
import { isTab } from './model';
import { NotifyPrompt } from './NotifyPrompt';

/**
 * Panel de dueños de cancha. Ruta `#/duenio`:
 *   #/duenio                      mis complejos
 *   #/duenio/nuevo                alta de un complejo
 *   #/duenio/<id>[/<pestaña>]     un complejo: agenda (por defecto), pedidos, canchas, horarios o datos
 * Los avisos (pedidos de turno) se activan desde el menú o desde la invitación de arriba: un dueño que no juega no pasa por el inicio.
 */
export function OwnerPage({ me }: { me: Profile }) {
  const [, id, tab] = useRoute();
  const menu = useRef<HTMLDetailsElement>(null);
  const install = useInstall();
  const [alerts, setAlerts] = useState(false);
  const [tip, setTip] = useState('');
  // Llegó al panel: la intención de "entré como dueño" (de la landing) ya cumplió su papel
  useEffect(() => clearIntent(), []);

  const closeMenu = () => { if (menu.current) menu.current.open = false; };
  const howToInstall = () => {
    setAlerts(false);
    if (install.kind === 'prompt') void install.run(); else if (install.kind === 'help') setTip(install.text);
  };

  return (
    <div class="wrap ow">
      <div class="ow-top">
        <a class="brand" href={me.is_player === false ? '#/duenio' : '#/'}>
          <img src="/icon.png" width={30} height={30} alt="" /> El Partidito
        </a>
        <details class="menu" ref={menu}>
          <summary aria-label="Mi cuenta"><Avatar p={me} size={38} zoom={false} /></summary>
          <div class="menu-pop">
            <div class="menu-who"><b>{me.nickname?.trim() || me.name}</b><small class="muted">Panel de dueño</small></div>
            {me.is_player !== false && <a href="#/">Mis grupos</a>}
            <a href="#/duenio">Mis canchas</a>
            <a href="#/perfil">Mi perfil y roles</a>
            <a href="#" onClick={e => { e.preventDefault(); setAlerts(a => !a); closeMenu(); }}>🔔 Avisos</a>
            {install.kind !== 'installed' && (
              <a href="#" onClick={e => { e.preventDefault(); if (install.kind === 'prompt') void install.run(); else setTip(install.text); closeMenu(); }}>📲 Instalar app</a>
            )}
            <a href="#/tema">Tema</a>
            <button onClick={() => void signOut()}>Salir</button>
          </div>
        </details>
      </div>
      {tip && (
        <div class="card note install-tip" role="status">
          <span>📲 {tip}</span>
          <button class="btn sm" onClick={() => setTip('')} aria-label="Cerrar">✕</button>
        </div>
      )}
      {alerts && <PushPanel owner={me.is_player === false ? 'only' : 'also'} onClose={() => setAlerts(false)} onInstall={howToInstall} />}
      {!alerts && id !== 'nuevo' && <NotifyPrompt onInstall={howToInstall} />}
      {!id ? <ComplexList me={me} />
        : id === 'nuevo' ? <ComplexWizard />
        : <ComplexPanel key={id} meId={me.id} id={id} tab={isTab(tab) ? tab : 'agenda'} />}
    </div>
  );
}
