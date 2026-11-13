// "De potrero a leyenda": piezas de movimiento. Un contador que sube (o baja) hasta su número y un lienzo para los papelitos.
// Todo respeta "reducir movimiento": sin eso, los números aparecen ya en su valor final.
import { useEffect, useRef, useState } from 'preact/hooks';
import { confetti, reducedMotion } from './careerConfetti';

/**
 * Un número que cuenta de `from` a `to` en `dur` segundos, después de `delay`. Cada vez que cambia el entero, vuelve a "saltar" (la clase cr-tick).
 * Con `skip` (o con reducir movimiento) muestra directo el valor final.
 */
export function Count({ from = 0, to, delay = 0, dur = 0.9, skip = false, fmt, class: cls = '' }: {
  from?: number; to: number; delay?: number; dur?: number; skip?: boolean; fmt?: (n: number) => string; class?: string;
}) {
  const instant = skip || from === to || reducedMotion();
  const [v, setV] = useState(instant ? to : from);
  useEffect(() => {
    if (instant) { setV(to); return; }
    setV(from);
    let raf = 0;
    const t0 = performance.now() + delay * 1000;
    const tick = (now: number) => {
      const k = Math.min(1, Math.max(0, (now - t0) / (dur * 1000)));
      const e = 1 - (1 - k) ** 3; // sale rápido y frena al final
      setV(Math.round(from + (to - from) * e));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [from, to, delay, dur, instant]);
  const shown = fmt ? fmt(v) : String(v);
  return <span class={`cr-count ${cls}`} aria-label={fmt ? fmt(to) : String(to)}><span key={v} class="cr-tick" aria-hidden="true">{shown}</span></span>;
}

/** Un lienzo encima de la pantalla para los papelitos. Devuelve el `ref` para lanzar ráfagas con `confetti(ref.current, potencia)`. */
export function useConfetti() {
  const ref = useRef<HTMLCanvasElement>(null);
  const stops = useRef<(() => void)[]>([]);
  useEffect(() => () => { stops.current.forEach(f => f()); stops.current = []; }, []);
  return {
    ref,
    fire: (power: 1 | 2 | 3 = 1, origin?: { x: number; y: number }) => { stops.current.push(confetti(ref.current, power, origin)); },
  };
}
