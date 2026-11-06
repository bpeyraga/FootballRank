import { createPortal } from 'preact/compat';
import { useEffect } from 'preact/hooks';
import type { ComponentChildren } from 'preact';

/** Hoja de abajo en el celu / ventana centrada en la compu (mismas clases que PollSheet). Se cierra con Escape o tocando afuera. */
export function Sheet({ title, onClose, busy = false, children }: {
  title: string; onClose: () => void; busy?: boolean; children: ComponentChildren;
}) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, [busy, onClose]);
  // En el <body>: tapa también la barra de pestañas.
  return createPortal(
    <div class="sheet-bg" onClick={() => !busy && onClose()}>
      <div class="sheet pl-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
        <div class="sheet-head">
          <h3>{title}</h3>
          <button type="button" class="icon-btn" aria-label="Cerrar" disabled={busy} onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
