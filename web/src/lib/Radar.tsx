import { ATTRS, type Stats } from './supabase';

/** Radar hexagonal de los 6 atributos; `compare` dibuja una segunda capa. */
export function Radar({ stats, compare }: { stats: Stats; compare?: Stats | null }) {
  const R = 100, C = 130;
  const xy = (i: number, v: number): [number, number] => {
    const a = -Math.PI / 2 + (i * Math.PI) / 3, r = (R * v) / 99;
    return [C + r * Math.cos(a), C + r * Math.sin(a)];
  };
  const pts = (f: (i: number) => number) => ATTRS.map((_, i) => xy(i, f(i)).map(n => n.toFixed(1)).join(',')).join(' ');
  const poly = (s: Stats) => pts(i => s[ATTRS[i][0]]);
  return (
    <svg class="radar" viewBox="0 0 260 260" role="img"
      aria-label={ATTRS.map(([k, , full]) => `${full} ${stats[k]}`).join(', ')}>
      {[33, 66, 99].map(v => <polygon class="grid" points={pts(() => v)} />)}
      {ATTRS.map((_, i) => { const [x, y] = xy(i, 99); return <line class="grid" x1={C} y1={C} x2={x} y2={y} />; })}
      {compare && <polygon class="shape alt" points={poly(compare)} />}
      <polygon class="shape" points={poly(stats)} />
      {ATTRS.map(([k, l], i) => {
        const [x, y] = xy(i, 118);
        return <text x={x} y={y} text-anchor="middle" dominant-baseline="middle">{l} {stats[k]}</text>;
      })}
    </svg>
  );
}
