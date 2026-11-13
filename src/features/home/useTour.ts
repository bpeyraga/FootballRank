import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { markTourSeen } from '../auth/api';
import { tourGate, tourRequest, tourSyncAction } from './tourCore';

type TourView = typeof import('./Tour').Tour;
let loaded: TourView | null = null;
/** Baja el tutorial aparte; si falla (sin conexión) no pasa nada: es un extra, nunca tiene que romper el Home. */
const load = () => import('./Tour').then(m => (loaded = m.Tour), () => null);

/** Pausa antes de mostrarlo solo, para que se vea primero el Home. */
const AUTO_DELAY_MS = 700;

/**
 * Tutorial del Home: se muestra solo la primera vez de la cuenta (no en cada dispositivo) y se puede volver a abrir con show().
 * "Ya lo vio" se recuerda en el dispositivo (clave fr-tour-v1) y en la cuenta (`seenAt` = profiles.tour_seen_at; undefined si
 * la base todavía no tiene la columna). Si la cuenta lo tiene y el dispositivo no, se marca acá en silencio; si el dispositivo
 * lo tiene y la cuenta no (ya lo vio antes de que existiera esto), se le avisa a la cuenta una vez.
 * También se abre si otra pantalla lo pidió con tourRequest.ask() y volvió al Home (el "Ver tutorial" de Ajustes en el perfil).
 * `View` es el componente mientras está abierto (null si no); `close` lo cierra.
 */
export function useTour(seenAt?: string | null) {
  const [open, setOpen] = useState(false);
  const serverSeen = seenAt === undefined ? undefined : !!seenAt;
  const told = useRef(false);
  /** Le avisa a la cuenta, una sola vez por carga (sin esperar ni romper nada si falla). */
  const tellAccount = useCallback(() => {
    if (serverSeen !== false || told.current) return;
    told.current = true;
    void markTourSeen();
  }, [serverSeen]);

  useEffect(() => {
    let alive = true;
    const sync = tourSyncAction(tourGate.local(), serverSeen);
    if (sync === 'setLocal') tourGate.mark();
    else if (sync === 'backfill') tellAccount();
    // Pedido a mano: se abre ya (sin la espera ni la marca de "primera vez") y no se suma el automático
    if (tourRequest.take()) {
      load().then(v => { if (alive && v) setOpen(true); });
      return () => { alive = false; };
    }
    if (!tourGate.due(serverSeen)) return;
    const t = setTimeout(async () => {
      const v = await load();
      if (!alive || !v || !tourGate.due(serverSeen)) return;
      tourGate.mark();
      tellAccount();
      setOpen(true);
    }, AUTO_DELAY_MS);
    return () => { alive = false; clearTimeout(t); };
  }, []);

  const show = useCallback(async () => { if (await load()) setOpen(true); }, []);
  // Al cerrarlo (sea cual sea cómo se abrió) queda como visto también en la cuenta
  const close = useCallback(() => { setOpen(false); tellAccount(); }, [tellAccount]);
  return { View: open ? loaded : null, show, close };
}
