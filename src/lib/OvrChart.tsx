import { useState } from 'preact/hooks';
import { chartLayout, fmtDay, summarizeSeries, type ChartBox, type OvrPoint } from './historyCore';

const BOX: ChartBox = { width: 320, height: 150, left: 28, right: 16, top: 16, bottom: 26 };
const MAX_DOTS = 12; // con más puntos solo se marca el último
const votos = (n: number) => `${n} ${n === 1 ? 'voto' : 'votos'}`;

/** Línea de OVR por día (SVG a mano, sin librería). Pide al menos 2 puntos; el que arma la pantalla maneja 0 y 1. */
export function OvrChart({ points }: { points: OvrPoint[] }) {
  const [sel, setSel] = useState<number | null>(null);
  const s = summarizeSeries(points);
  if (!s || points.length < 2) return null;
  const L = chartLayout(points, BOX);
  const { pts } = L;
  const baseY = BOX.height - BOX.bottom, right = BOX.width - BOX.right;
  const lastI = pts.length - 1;
  const cur = pts[sel ?? lastI];
  const showDots = pts.length <= MAX_DOTS;

  // El puntero (mouse o dedo) elige el punto más cercano en X; es un extra, los valores también están en la tabla.
  const pick = (e: PointerEvent) => {
    const el = e.currentTarget as SVGSVGElement;
    const r = el.getBoundingClientRect();
    if (!r.width) return;
    const x = ((e.clientX - r.left) / r.width) * BOX.width;
    let best = 0;
    pts.forEach((q, i) => { if (Math.abs(q.x - x) < Math.abs(pts[best].x - x)) best = i; });
    setSel(best);
  };

  const label = `Evolución del OVR: ${s.first.ovr} el ${fmtDay(s.first.day)} y ${s.last.ovr} el ${fmtDay(s.last.day)}. ` +
    `Máximo ${s.max.ovr} el ${fmtDay(s.max.day)}, mínimo ${s.min.ovr} el ${fmtDay(s.min.day)}.`;
  const lastLabelY = Math.max(BOX.top - 2, pts[lastI].y - 9);

  return (
    <>
      <svg class="hi-chart" viewBox={`0 0 ${BOX.width} ${BOX.height}`} role="img" aria-label={label}
        onPointerDown={pick} onPointerMove={pick} onPointerLeave={e => { if (e.pointerType === 'mouse') setSel(null); }}>
        <title>{label}</title>
        {L.ticks.map(v => (
          <g>
            <line class="hi-grid" x1={BOX.left} x2={right} y1={L.yOf(v)} y2={L.yOf(v)} />
            <text class="hi-tick" x={BOX.left - 6} y={L.yOf(v) + 4} text-anchor="end">{v}</text>
          </g>
        ))}
        <path class="hi-area" d={`${L.line} L${pts[lastI].x},${baseY} L${pts[0].x},${baseY} Z`} />
        <path class="hi-line" d={L.line} />
        {sel != null && <line class="hi-cross" x1={cur.x} x2={cur.x} y1={BOX.top} y2={baseY} />}
        {showDots && pts.map(q => <circle class="hi-dot" cx={q.x} cy={q.y} r="4" />)}
        {!showDots && <circle class="hi-dot" cx={pts[lastI].x} cy={pts[lastI].y} r="4.5" />}
        {sel != null && sel !== lastI && <circle class="hi-dot sel" cx={cur.x} cy={cur.y} r="5" />}
        <text class="hi-val" x={pts[lastI].x} y={lastLabelY} text-anchor="end">{s.last.ovr}</text>
        <text class="hi-tick" x={BOX.left} y={BOX.height - 8} text-anchor="start">{fmtDay(s.first.day)}</text>
        <text class="hi-tick" x={right} y={BOX.height - 8} text-anchor="end">{fmtDay(s.last.day)}</text>
      </svg>
      <p class="hi-read" aria-live="polite">
        <b>{fmtDay(cur.p.day)}</b> · OVR <b>{cur.p.ovr}</b>{cur.p.n > 0 && <span class="muted"> · {votos(cur.p.n)}</span>}
      </p>
      <div class="st-grid c4">
        <div class="st-tile"><b>{s.last.ovr}</b><span>Actual</span></div>
        <div class="st-tile"><b>{s.max.ovr}</b><span>Máximo</span></div>
        <div class="st-tile"><b>{s.min.ovr}</b><span>Mínimo</span></div>
        <div class="st-tile"><b>{s.delta === 0 ? '0' : s.delta > 0 ? `+${s.delta}` : `−${-s.delta}`}</b><span>Cambio</span></div>
      </div>
      <details class="hi-vals">
        <summary>Ver valores por día</summary>
        <table class="stats">
          <thead><tr><th>Día</th><th>OVR</th><th>Votos</th></tr></thead>
          <tbody>{[...points].reverse().slice(0, 30).map(p => (
            <tr><td>{fmtDay(p.day)}</td><td>{p.ovr}</td><td>{p.n || '—'}</td></tr>
          ))}</tbody>
        </table>
        {points.length > 30 && <p class="muted st-note">Mostrando los últimos 30 días con cambios.</p>}
      </details>
    </>
  );
}
