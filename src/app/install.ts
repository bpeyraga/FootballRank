import { useEffect, useState } from 'preact/hooks';

/** Evento que Chrome/Edge/Samsung disparan cuando la app se puede instalar. */
interface InstallEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> }

let deferred: InstallEvent | null = null;
const subs = new Set<() => void>();
const notify = () => subs.forEach(f => f());

if (typeof window !== 'undefined') {
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e as InstallEvent; notify(); });
  addEventListener('appinstalled', () => { deferred = null; notify(); });
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }
}

const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
const standalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
const ios = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
/** Navegadores internos (WhatsApp, Instagram, Facebook…) no dejan instalar. */
const inApp = /FBAN|FBAV|Instagram|WhatsApp|Line\/|; wv\)/i.test(ua);

export type InstallState =
  | { kind: 'installed' }
  | { kind: 'prompt'; run: () => Promise<void> }
  | { kind: 'help'; text: string };

/** Qué ofrecer: botón nativo de instalar, instrucciones, o nada si ya está instalada. */
export function useInstall(): InstallState {
  const [, tick] = useState(0);
  useEffect(() => { const f = () => tick(n => n + 1); subs.add(f); return () => { subs.delete(f); }; }, []);
  if (standalone()) return { kind: 'installed' };
  if (deferred) {
    const ev = deferred;
    return { kind: 'prompt', run: async () => { await ev.prompt(); await ev.userChoice; deferred = null; notify(); } };
  }
  if (inApp) return { kind: 'help', text: 'Abrí este link en Chrome o Safari (menú ⋮ → "Abrir en el navegador") y ahí la instalás.' };
  if (ios) return { kind: 'help', text: 'En Safari: tocá Compartir (el cuadrado con la flecha ↑) → "Agregar a inicio".' };
  return { kind: 'help', text: 'En Chrome: menú ⋮ → "Instalar app" o "Agregar a la pantalla principal".' };
}

// Al tocar un aviso con la app abierta, el service worker puede pedir que naveguemos acá.
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', e => { if (e.data?.goto) location.href = e.data.goto; });
}
