// Aviso de cookies: aparece la primera vez en cada navegador (y cuando se cambia la versión del aviso o se toca
// "Preferencias de cookies"). La elección se guarda en una cookie propia y queda registrada en la base (track.ts).
import { useEffect, useRef, useState } from 'preact/hooks';
import { getConsent, isConsentSyncing, onConsentChange, onConsentSyncDone, onOpenConsent, setConsent } from './consent';
import type { ConsentChoice } from './consentCore';

export function ConsentBanner() {
  // "/#cookies" (link de la política de cookies) abre el aviso aunque ya haya elegido, y se saca el #cookies de la URL.
  const [open, setOpen] = useState(() => (!getConsent() && !isConsentSyncing()) || location.hash === '#cookies');
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (location.hash === '#cookies') try { history.replaceState(null, '', location.pathname + location.search); } catch { /* nada */ }
    // Abierto desde "Preferencias de cookies": el foco pasa al aviso (queda al final del documento y, si no, con teclado
    // o lector de pantalla no se lo encuentra).
    const off1 = onOpenConsent(() => {
      setOpen(true);
      setTimeout(() => box.current?.querySelector<HTMLButtonElement>('button.primary')?.focus(), 0);
    });
    // Si en otra pestaña ya eligió, este aviso sobra.
    const off2 = onConsentChange(c => { if (c) setOpen(false); });
    // Con sesión guardada se esperó a la cuenta: si no trajo ninguna elección, recién ahí corresponde preguntar.
    const off3 = onConsentSyncDone(() => { if (!getConsent()) setOpen(true); });
    return () => { off1(); off2(); off3(); };
  }, []);
  // Mientras está abierto, la página deja lugar abajo: si no, el aviso tapa lo último (el botón de guardar, los links del pie).
  useEffect(() => {
    const el = box.current;
    if (!open || !el) return;
    const b = document.body;
    const set = () => b.style.setProperty('--consent-h', `${el.offsetHeight}px`);
    set();
    b.classList.add('consent-open');
    addEventListener('resize', set);
    return () => { removeEventListener('resize', set); b.classList.remove('consent-open'); b.style.removeProperty('--consent-h'); };
  }, [open]);
  if (!open) return null;
  const choose = (c: ConsentChoice) => { setConsent(c); setOpen(false); };
  const current = getConsent()?.choice;
  // Con una elección ya hecha (aviso reabierto) se puede cerrar con Escape sin cambiarla.
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && current) setOpen(false); };
  return (
    <div class="consent" role="dialog" aria-label="Aviso de cookies" ref={box} onKeyDown={onKey}>
      <div class="consent-in">
        <p>
          <b>🍪 Cookies y almacenamiento.</b> Usamos una cookie propia y el almacenamiento de tu navegador para que la app
          funcione (tu sesión, el tema, tus preferencias) y, si aceptás, para contar visitas de forma anónima.
          No usamos cookies de publicidad ni para seguirte en otros sitios.{' '}
          <a href="/cookies.html">Política de cookies</a>
        </p>
        <div class="consent-btns">
          <button type="button" class={`btn${current === 'necessary' ? ' primary' : ''}`} onClick={() => choose('necessary')}>Solo necesarias</button>
          <button type="button" class={`btn${current === 'necessary' ? '' : ' primary'}`} onClick={() => choose('all')}>Aceptar todo</button>
        </div>
      </div>
    </div>
  );
}
