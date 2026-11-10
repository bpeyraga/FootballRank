import { useCallback, useEffect, useState } from 'preact/hooks';
import { tourGate } from './tourCore';

type TourView = typeof import('./Tour').Tour;
let loaded: TourView | null = null;
/** Baja el tutorial aparte; si falla (sin conexión) no pasa nada: es un extra, nunca tiene que romper el Home. */
const load = () => import('./Tour').then(m => (loaded = m.Tour), () => null);

/** Pausa antes de mostrarlo solo, para que se vea primero el Home. */
const AUTO_DELAY_MS = 700;

/**
 * Tutorial del Home: se muestra solo la primera vez en el dispositivo (clave fr-tour-v1) y se puede volver a abrir con show().
 * `View` es el componente mientras está abierto (null si no); `close` lo cierra.
 */
export function useTour() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!tourGate.due()) return;
    let alive = true;
    const t = setTimeout(async () => {
      const v = await load();
      if (!alive || !v || !tourGate.due()) return;
      tourGate.mark();
      setOpen(true);
    }, AUTO_DELAY_MS);
    return () => { alive = false; clearTimeout(t); };
  }, []);

  const show = useCallback(async () => { if (await load()) setOpen(true); }, []);
  const close = useCallback(() => setOpen(false), []);
  return { View: open ? loaded : null, show, close };
}
