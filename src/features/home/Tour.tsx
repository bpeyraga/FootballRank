import { createPortal } from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
import './tour.css';
import { TOUR_STEPS, clampStep, keyAction, swipeDir } from './tourCore';

const FOCUSABLE = 'a[href],button:not([disabled]):not([tabindex="-1"])';
const N = TOUR_STEPS.length;

/**
 * Tutorial de la primera vez: tarjetas con un paso cada una. Diálogo modal accesible:
 * ← / → cambian de paso (o deslizar), Esc cierra, Tab queda adentro y al cerrar el foco vuelve a donde estaba.
 * Se baja aparte (import dinámico desde useTour): no pesa en la carga inicial.
 */
export function Tour({ onClose, onAlerts, restoreFocus }: {
  onClose: () => void;
  /** Si viene, el último paso ofrece "Activar avisos" (cierra el tutorial y abre ese panel). */
  onAlerts?: () => void;
  /** A qué elemento devolver el foco al cerrar (si no, al que lo tenía al abrir). */
  restoreFocus?: () => HTMLElement | null | undefined;
}) {
  const [i, setI] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const box = useRef<HTMLDivElement>(null);
  const primary = useRef<HTMLButtonElement>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const s = TOUR_STEPS[i];
  const last = i === N - 1;

  const move = (d: number) => {
    const to = clampStep(i, d, N);
    if (to !== i) { setDir(to > i ? 1 : -1); setI(to); }
  };
  const jump = (to: number) => { if (to !== i) { setDir(to > i ? 1 : -1); setI(to); } };

  // Al abrir: foco en "Siguiente"; al cerrar: devolverlo.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    primary.current?.focus();
    return () => {
      const back = restoreFocus?.() ?? before;
      if (back && back.isConnected) back.focus?.({ preventScroll: true });
    };
  }, []);

  // Si el botón enfocado desapareció ("Atrás" en el primer paso), el foco vuelve a "Siguiente".
  useEffect(() => {
    if (!box.current?.contains(document.activeElement)) primary.current?.focus();
  }, [i]);

  // Teclado: flechas, Esc y Tab atrapado adentro.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        const items = [...(box.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
        if (!items.length) return;
        const first = items[0], end = items[items.length - 1], at = document.activeElement;
        if (!box.current?.contains(at)) { e.preventDefault(); first.focus(); }
        else if (e.shiftKey && at === first) { e.preventDefault(); end.focus(); }
        else if (!e.shiftKey && at === end) { e.preventDefault(); first.focus(); }
        return;
      }
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const a = keyAction(e.key);
      if (!a) return;
      e.preventDefault();
      if (a === 'close') onClose(); else move(a === 'next' ? 1 : -1);
    };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, [i, onClose]);

  const onUp = (e: PointerEvent) => {
    const st = swipe.current;
    swipe.current = null;
    if (!st) return;
    const d = swipeDir(e.clientX - st.x, e.clientY - st.y);
    if (d) move(-d);
  };

  return createPortal(
    <div class="tour-bg">
      <div class="tour" ref={box} role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-text"
        onPointerDown={e => { swipe.current = { x: e.clientX, y: e.clientY }; }} onPointerUp={onUp} onPointerCancel={() => { swipe.current = null; }}>
        <div class="tour-art" aria-hidden="true">
          <svg class="tour-lines" viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice">
            <g fill="none" stroke="currentColor" stroke-width="3"><circle cx="200" cy="100" r="64" /><path d="M200 -10v220M-10 100h420" /><circle cx="200" cy="100" r="5" fill="currentColor" /></g>
          </svg>
          <span class="tour-emoji" key={i}>{s.emoji}</span>
        </div>
        <button type="button" class="tour-x" aria-label="Cerrar tutorial" onClick={onClose}>✕</button>

        <div class="tour-body" aria-live="polite" aria-atomic="true">
          <div class={`tour-slide ${dir > 0 ? 'fwd' : 'back'}`} key={i}>
            <span class="tour-kicker">Paso {i + 1} de {N}</span>
            <h2 id="tour-title">{s.title}</h2>
            <p id="tour-text">{s.text}</p>
            {s.chips && <ul class="tour-chips" aria-label="Incluye">{s.chips.map(c => <li>{c}</li>)}</ul>}
            {last && (
              <div class="tour-extra">
                {onAlerts && <button type="button" class="btn sm" onClick={() => { onClose(); onAlerts(); }}>🔔 Activar avisos</button>}
                <a class="btn sm" href="/como-se-usa.html" target="_blank" rel="noopener">📖 Guía completa</a>
              </div>
            )}
          </div>
        </div>

        <div class="tour-dots" role="group" aria-label="Pasos">
          {TOUR_STEPS.map((st, n) => (
            <button type="button" tabIndex={-1} class={n === i ? 'on' : ''} aria-label={`Ir al paso ${n + 1}: ${st.title}`} aria-current={n === i ? 'step' : undefined} onClick={() => jump(n)}><i /></button>
          ))}
        </div>

        <div class="tour-foot">
          {last ? <span /> : <button type="button" class="tour-skip" onClick={onClose}>Saltar</button>}
          <div class="tour-nav">
            {i > 0 && <button type="button" class="btn tour-back" onClick={() => move(-1)} aria-label="Paso anterior">‹ Atrás</button>}
            <button type="button" class="btn primary" ref={primary} onClick={() => (last ? onClose() : move(1))}>{last ? '¡Listo!' : 'Siguiente'}</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
