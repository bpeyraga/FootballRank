import { useEffect, useRef, useState } from 'preact/hooks';
import { communityName as loadCommunityName } from './api';
import { cardFileName } from './cardLayout';
import { downloadBlob, renderCardPng, shareBlob, type CardData } from './cardCanvas';

type Base = Omit<CardData, 'community'>;

/**
 * Botón "Compartir ficha": arma la carta del jugador como imagen vertical (1080×1920, para historias) y abre el menú de
 * compartir del celular; en escritorio la descarga. La imagen se prepara de fondo para que el toque comparta enseguida
 * (los navegadores del celular exigen que compartir pase pegado al toque).
 */
export function ShareCardButton({ card, communityId, communityName }:
  { card: Base; communityId: string; communityName?: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [preview, setPreview] = useState<{ url: string; blob: Blob } | null>(null);
  const nameRef = useRef<string | undefined>(communityName);
  const cache = useRef<{ key: string; promise: Promise<Blob> } | null>(null);
  const key = JSON.stringify(card) + '|' + (communityName ?? '');

  const prepare = (): Promise<Blob> => {
    if (cache.current?.key === key) return cache.current.promise;
    const promise = (async () => {
      let community: string = nameRef.current ?? communityName ?? '';
      if (nameRef.current == null && communityName == null) {
        community = nameRef.current = await loadCommunityName(communityId);
      }
      return renderCardPng({ ...card, community });
    })();
    cache.current = { key, promise };
    promise.catch(() => { if (cache.current?.promise === promise) cache.current = null; });
    return promise;
  };

  // Prepara la imagen cuando no hay nada más que hacer (sin bloquear la pantalla)
  useEffect(() => {
    setMsg(null);
    const idle = (window as any).requestIdleCallback as undefined | ((f: () => void, o?: { timeout: number }) => number);
    const run = () => { prepare().catch(() => {}); };
    const h = idle ? idle(run, { timeout: 2500 }) : window.setTimeout(run, 800);
    return () => { if (idle) (window as any).cancelIdleCallback?.(h); else clearTimeout(h); };
  }, [key]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  const title = `${card.name} en Ranking Fútbol`;
  const text = `Mi ficha en Ranking Fútbol: OVR ${card.ovr ?? '—'}`;
  const file = cardFileName(card.name);

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
      <button type="button" class="btn sm fut-share" disabled={busy} onClick={share}>
        <span aria-hidden="true">📤</span> {busy ? 'Armando imagen…' : 'Compartir ficha'}
      </button>
      {msg && <p class={`fut-share-msg ${msg.ok ? '' : 'err'}`} role="status">{msg.text}</p>}
      {preview && (
        <div class="sc-dialog" role="dialog" aria-modal="true" aria-label="Tu ficha" onClick={() => setPreview(null)}>
          <div class="sc-box" onClick={e => e.stopPropagation()}>
            <img src={preview.url} alt={`Ficha de ${card.name}`} />
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
