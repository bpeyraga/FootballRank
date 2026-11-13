// "De potrero a leyenda": la lluvia de papelitos dorados para los títulos y los premios. Un canvas chico, sin librerías: se dibuja un rato y se apaga solo.
// Respeta "reducir movimiento" (no dibuja nada). No toca el estado del juego.

const COLORS = ['#f4bd2c', '#ffe9a3', '#ffffff', '#5fd08a', '#ff9d2e', '#c8870f'];

interface P { x: number; y: number; vx: number; vy: number; w: number; h: number; r: number; vr: number; c: string; life: number }

export const reducedMotion = (): boolean => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Los papelitos que se lanzan en una ráfaga: más para los títulos grandes. */
export const burstSize = (power: 1 | 2 | 3): number => (power === 3 ? 170 : power === 2 ? 110 : 60);

/**
 * Tira una ráfaga de papelitos desde abajo del centro hacia arriba. `power` 1 (copa chica) a 3 (Mundial, Balón de Oro).
 * Devuelve una función que la corta. Usa un solo requestAnimationFrame por ráfaga y se apaga cuando no queda nada en el aire.
 */
export function confetti(canvas: HTMLCanvasElement | null, power: 1 | 2 | 3 = 1, origin: { x: number; y: number } = { x: 0.5, y: 0.78 }): () => void {
  if (!canvas || reducedMotion()) return () => {};
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = canvas.clientWidth, H = canvas.clientHeight;
  if (!W || !H) return () => {};
  if (canvas.width !== Math.round(W * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const n = burstSize(power);
  const ps: P[] = Array.from({ length: n }, () => {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * (power === 3 ? 2.2 : 1.6);
    const v = (power === 3 ? 13 : 10) * (0.55 + Math.random() * 0.7);
    return {
      x: origin.x * W, y: origin.y * H, vx: Math.cos(a) * v, vy: Math.sin(a) * v * (H / 700 + 0.4), w: 5 + Math.random() * 5, h: 3 + Math.random() * 4,
      r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.4, c: COLORS[Math.floor(Math.random() * COLORS.length)], life: 1,
    };
  });
  let raf = 0, stopped = false;
  const tick = () => {
    ctx.clearRect(0, 0, W, H);
    let alive = 0;
    for (const p of ps) {
      p.vy += 0.34; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life -= 0.0075;
      if (p.life <= 0 || p.y > H + 20) continue;
      alive++;
      ctx.save();
      ctx.globalAlpha = Math.min(1, p.life * 2);
      ctx.translate(p.x, p.y); ctx.rotate(p.r);
      ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (alive && !stopped) raf = requestAnimationFrame(tick); else ctx.clearRect(0, 0, W, H);
  };
  raf = requestAnimationFrame(tick);
  return () => { stopped = true; cancelAnimationFrame(raf); ctx.clearRect(0, 0, W, H); };
}
