import { ATTRS, type Stats } from './supabase';

/** Eje extra (stat de la casa). `compare` es su valor en la segunda capa; si falta, se usa `value`. */
export interface RadarExtra { label: string; value: number; compare?: number | null }

const short = (s: string, n = 9) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

/**
 * Radar de los 6 atributos más ejes extra opcionales (stats de la casa).
 * `compare` dibuja una segunda capa (autoevaluación).
 */
export function Radar({ stats, compare, extra = [] }: { stats: Stats; compare?: Stats | null; extra?: RadarExtra[] }) {
  const axes = [
    ...ATTRS.map(([k, l, full]) => ({ label: l, full, value: stats[k], cmp: compare?.[k] ?? null, house: false })),
    ...extra.map(e => ({ label: short(e.label), full: e.label, value: e.value, cmp: e.compare ?? e.value, house: true })),
  ];
  const n = axes.length;
  const R = 100, C = 130;
  const xy = (i: number, v: number): [number, number] => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n, r = (R * v) / 99;
    return [C + r * Math.cos(a), C + r * Math.sin(a)];
  };
  const pts = (f: (i: number) => number) => axes.map((_, i) => xy(i, f(i)).map(x => x.toFixed(1)).join(',')).join(' ');
  return (
    // viewBox más ancho que el radar para que las etiquetas laterales no se corten
    <svg class="radar" viewBox="-40 0 340 260" role="img"
      aria-label={axes.map(a => `${a.full} ${a.value}`).join(', ')}>
      {[33, 66, 99].map(v => <polygon class="grid" points={pts(() => v)} />)}
      {axes.map((_, i) => { const [x, y] = xy(i, 99); return <line class="grid" x1={C} y1={C} x2={x} y2={y} />; })}
      {compare && <polygon class="shape alt" points={pts(i => axes[i].cmp ?? axes[i].value)} />}
      <polygon class="shape" points={pts(i => axes[i].value)} />
      {axes.map((a, i) => {
        const [x, y] = xy(i, 116);
        const anchor = x > C + 8 ? 'start' : x < C - 8 ? 'end' : 'middle';
        return (
          <text x={x} y={y} text-anchor={anchor} dominant-baseline="middle" class={a.house ? 'house' : ''}>
            <title>{a.full} {a.value}</title>{a.label} {a.value}
          </text>
        );
      })}
    </svg>
  );
}
