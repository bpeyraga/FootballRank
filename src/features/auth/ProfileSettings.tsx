import './settings.css';
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { go } from '../../app/router';
import { openConsent } from '../../app/consent';
import { useInstall } from '../../app/install';
import { tourRequest } from '../home/tourCore';

const Chev = () => <svg class="chev" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>;
const Ext = () => <svg class="chev" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>;

/** Una fila: link si trae `href`, botón si es una acción. `external` abre en otra pestaña. */
function Row({ ico, label, hint, href, external, onClick }: {
  ico: string; label: string; hint?: string; href?: string; external?: boolean; onClick?: () => void;
}) {
  const body = (
    <>
      <span class="st-ico" aria-hidden="true">{ico}</span>
      <span class="st-copy"><b>{label}</b>{hint && <small>{hint}</small>}</span>
      {external ? <Ext /> : <Chev />}
    </>
  );
  return (
    <li>
      {href
        ? <a class="st-row" href={href} target={external ? '_blank' : undefined} rel={external ? 'noopener' : undefined}>{body}</a>
        : <button type="button" class="st-row" onClick={onClick}>{body}</button>}
    </li>
  );
}

function Group({ id, title, children, note }: { id: string; title: string; children: ComponentChildren; note?: ComponentChildren }) {
  return (
    <section class="st-group" aria-labelledby={id}>
      <h4 id={id}>{title}</h4>
      <ul class="st-list">{children}</ul>
      {note}
    </section>
  );
}

/**
 * "Ajustes y ayuda" al pie de "Editar perfil": lo que antes estaba apiñado en el menú de la foto (tema, instalar la app,
 * tutorial, guía y legales). `player`: si juega (el tutorial es del Inicio de los jugadores; un dueño que no juega no lo ve).
 */
export function ProfileSettings({ player }: { player: boolean }) {
  const install = useInstall();
  const [tip, setTip] = useState('');

  const doInstall = () => {
    if (install.kind === 'prompt') { setTip(''); void install.run(); }
    else if (install.kind === 'help') setTip(t => (t ? '' : install.text));
  };
  // El tutorial vive en el Inicio: se anota el pedido y se vuelve; useTour lo abre al montarse
  const showTour = () => { tourRequest.ask(); go(''); };

  return (
    <section class="st-set" aria-labelledby="st-title">
      <h3 id="st-title">Ajustes y ayuda</h3>
      <div class="st-groups">
        <Group id="st-app" title="App" note={
          <div role="status">
            {tip && <p class="st-tip"><span>📲 {tip}</span><button type="button" class="btn sm" onClick={() => setTip('')} aria-label="Cerrar">✕</button></p>}
          </div>
        }>
          <Row ico="🎨" label="Tema y colores" hint="Claro, oscuro y paleta" href="#/tema" />
          {install.kind !== 'installed' && <Row ico="📲" label="Instalar app" hint="Tenela como una app en tu celular" onClick={doInstall} />}
        </Group>
        <Group id="st-help" title="Ayuda">
          {player && <Row ico="💡" label="Ver tutorial" hint="Un recorrido rápido por la app" onClick={showTour} />}
          <Row ico="📖" label="Cómo se usa" hint="La guía paso a paso (se abre aparte)" href="/como-se-usa.html" external />
        </Group>
        <Group id="st-legal" title="Legales">
          <Row ico="📄" label="Términos" hint="Condiciones de uso" href="/terminos.html" />
          <Row ico="🔒" label="Privacidad" hint="Cómo cuidamos tus datos" href="/privacidad.html" />
          <Row ico="🍪" label="Cookies" hint="Cuáles usamos y para qué" href="/cookies.html" />
          <Row ico="⚙️" label="Preferencias de cookies" hint="Cambiá lo que aceptaste" onClick={openConsent} />
        </Group>
      </div>
    </section>
  );
}
