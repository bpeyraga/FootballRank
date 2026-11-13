import { useEffect, useRef, useState } from 'preact/hooks';
import type { CardData } from './cardLayout';
import { cardFileName, shareMessage } from './shareText';
import { downloadBlob, shareBlob } from './shareFile';
import './share.css';

export type ShareCardInfo = Omit<CardData, 'community'>;

/**
 * Botón que arma la carta del jugador como imagen vertical (1080×1920, para historias) y abre el menú de compartir del
 * celular; en escritorio la descarga. La imagen se prepara de fondo para que el toque comparta enseguida (los navegadores
 * del celular exigen que compartir pase pegado al toque).
 *
 * Es liviano a propósito (lo importa el chunk principal): el dibujo (cardCanvas) y el QR se bajan con import() recién
 * cuando se prepara la imagen.
 */
export function ShareCardBase({ card, own = false, label = 'Compartir ficha', community, communityKey, loadCommunity, eager = true }: {
  card: ShareCardInfo;
  /** Es la carta de quien mira (cambia el texto con el que se comparte: "mi carta" en vez de "la carta de Juan"). */
  own?: boolean;
  label?: string;
  /** Nombre de la comunidad si ya se sabe; sin él (y sin `loadCommunity`) la imagen no lleva línea de comunidad. */
  community?: string;
  /** Identifica de qué comunidad es `loadCommunity` (para no reusar el nombre de otra). */
  communityKey?: string;
  loadCommunity?: () => Promise<string>;
  /** true: arma la imagen de fondo apenas la pantalla está tranquila. false (inicio): recién cuando el dedo o el mouse
   *  llegan al botón, para no gastar batería ni datos en cada visita a quien nunca comparte. */
  eager?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [preview, setPreview] = useState<{ url: string; blob: Blob } | null>(null);
  const loaded = useRef<{ k: string; name: string } | null>(null);
  const cache = useRef<{ key: string; promise: Promise<Blob> } | null>(null);
  const key = JSON.stringify(card) + '|' + (community ?? communityKey ?? '');

  const resolveCommunity = async (): Promise<string> => {
    if (community != null) return community;
    if (!loadCommunity) return '';
    const k = communityKey ?? '';
    // Si no se puede leer el nombre, la imagen sale igual (sin la línea de comunidad)
    if (loaded.current?.k !== k) { try { loaded.current = { k, name: await loadCommunity() }; } catch { return ''; } }
    return loaded.current.name;
  };

  const prepare = (): Promise<Blob> => {
    if (cache.current?.key === key) return cache.current.promise;
    const promise = (async () => {
      const [{ renderCardPng }, name] = await Promise.all([import('./cardCanvas'), resolveCommunity()]);
      return renderCardPng({ ...card, community: name });
    })();
    cache.current = { key, promise };
    promise.catch(() => { if (cache.current?.promise === promise) cache.current = null; });
    return promise;
  };

  // Prepara la imagen cuando no hay nada más que hacer (sin bloquear la pantalla)
  useEffect(() => {
    setMsg(null);
    if (!eager) return;
    const idle = (window as any).requestIdleCallback as undefined | ((f: () => void, o?: { timeout: number }) => number);
    const run = () => { prepare().catch(() => {}); };
    const h = idle ? idle(run, { timeout: 2500 }) : window.setTimeout(run, 800);
    return () => { if (idle) (window as any).cancelIdleCallback?.(h); else clearTimeout(h); };
  }, [key, eager]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);
  // Vista previa: Esc la cierra y el foco entra al diálogo (y vuelve al botón al cerrar)
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!preview) return;
    const before = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
    const on = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); setPreview(null); return; }
      if (e.key !== 'Tab') return;
      const items = [...(dialog.current?.querySelectorAll<HTMLElement>('button') ?? [])];
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1], at = document.activeElement;
      if (!dialog.current?.contains(at)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && at === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus(); }
    };
    addEventListener('keydown', on);
    return () => { removeEventListener('keydown', on); if (before?.isConnected) before.focus?.({ preventScroll: true }); };
  }, [!!preview]);

  const { title, text } = shareMessage(card.name, card.ovr, own);
  const file = cardFileName(card.name);

  /** Empieza a armar la imagen antes del toque (sin esperar), así compartir sale pegado al toque. */
  const warm = () => { prepare().catch(() => {}); };

  const share = async () => {
    setBusy(true); setMsg(null);
    try {
      const blob = await prepare();
      const res = await shareBlob(blob, file, title, text);
      if (res === 'downloaded') setMsg({ ok: true, text: 'Se descargó la imagen. Subila a tus historias o mandala por WhatsApp.' });
      else if (res === 'blocked') setPreview({ url: URL.createObjectURL(blob), blob });
    } catch (e: any) {
      setMsg({ ok: false, text: `No pudimos armar la imagen. ${e?.message ?? ''}`.trim() });
    } finally { setBusy(false); }
  };

  return (
    <>
      <button type="button" class="btn sm fut-share" disabled={busy} onClick={share}
        onPointerEnter={warm} onPointerDown={warm} onFocus={warm}>
        <span aria-hidden="true">📤</span> {busy ? 'Armando imagen…' : label}
      </button>
      {msg && <p class={`fut-share-msg ${msg.ok ? '' : 'err'}`} role="status">{msg.text}</p>}
      {preview && (
        <div class="sc-dialog" ref={dialog} role="dialog" aria-modal="true" aria-label="Tu carta" onClick={() => setPreview(null)}>
          <div class="sc-box" onClick={e => e.stopPropagation()}>
            <img src={preview.url} alt={`Carta de ${card.name}`} />
            <div class="sc-actions">
              <button type="button" class="btn primary"
                onClick={async () => { const r = await shareBlob(preview.blob, file, title, text); if (r !== 'blocked') setPreview(null); }}>Compartir</button>
              <button type="button" class="btn" onClick={() => downloadBlob(preview.blob, file)}>Descargar</button>
              <button type="button" class="btn" onClick={() => setPreview(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
