import { useEffect, useState } from 'preact/hooks';
import './offline.css';

/** ¿Hay conexión? Sigue los eventos online/offline del navegador (arranca con el estado actual). */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);
  useEffect(() => {
    const up = () => setOnline(true), down = () => setOnline(false);
    addEventListener('online', up);
    addEventListener('offline', down);
    setOnline(navigator.onLine !== false);
    return () => { removeEventListener('online', up); removeEventListener('offline', down); };
  }, []);
  return online;
}

/** Aviso fijo arriba mientras no hay internet: lo que se ve es la copia guardada (service worker), y votar o anotarse no anda. */
export function OfflineBanner() {
  if (useOnline()) return null;
  return (
    <div class="offline-bar" role="status">
      <span class="offline-dot" aria-hidden="true" />
      <span>Sin conexión: estás viendo lo último que cargaste. Para anotarte o votar necesitás internet.</span>
    </div>
  );
}
