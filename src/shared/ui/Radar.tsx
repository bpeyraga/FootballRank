import { ATTRS, type Stats } from '../supabase';

/** Eje extra (stat de la casa). `compare` es su valor en la segunda capa; si falta, se usa `value`. */
export interface RadarExtra { label: string; value: number; compare?: number | null; code?: string | null }

/** Mayúsculas, sin tildes (la Ñ se mantiene), solo letras y números. */
export const plain = (s: string) => s.toLocaleUpperCase('es').normalize('NFD')
  .replace(/Ñ/g, 'Ñ').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9Ñ]/g, '');

/**
 * Códigos de 3 letras estilo FIFA para las stats de la casa, sin repetir entre sí ni con los base.
 * "Morfón" → MOR; si choca, prueba primera letra + consonantes ("Mortero" → MRT), y si no, número.
 */
export function houseCodes(labels: string[], preferred: (string | null | undefined)[] = []): string[] {
  const used = new Set<string>(ATTRS.map(([, l]) => l));
  // Primero reservo los códigos elegidos a mano (si son válidos y no chocan)
  const fixed = labels.map((_, i) => {
    const c = preferred[i] ? plain(preferred[i]!) : '';
    if (c.length >= 2 && c.length <= 3 && !used.has(c)) { used.add(c); return c; }
    return null;
  });
  return labels.map((label, i) => {
    if (fixed[i]) return fixed[i]!;
    const w = plain(label) || 'X';
    const cons = w[0] + w.slice(1).replace(/[AEIOU]/g, '');
    const cands = [w.slice(0, 3), cons.slice(0, 3), w[0] + w.slice(-2)].filter(c => c.length === 3);
    let code = cands.find(c => !used.has(c));
    for (let i = 2; !code; i++) { const c = w.slice(0, 2) + i; if (!used.has(c)) code = c; }
    used.add(code);
    return code;
  });
}

/**
 * Radar de los 6 atributos más ejes extra opcionales (stats de la casa).
 * `compare` dibuja una segunda capa (autoevaluación).
 */
export function Radar({ stats, compare, extra = [] }: { stats: Stats; compare?: Stats | null; extra?: RadarExtra[] }) {
  const codes = houseCodes(extra.map(e => e.label), extra.map(e => e.code));
  const axes = [
    ...ATTRS.map(([k, l, full]) => ({ label: l, full, value: stats[k], cmp: compare?.[k] ?? null, house: false })),
    ...extra.map((e, i) => ({ label: codes[i], full: e.label, value: e.value, cmp: e.compare ?? e.value, house: true })),
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
    <>
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
    {extra.length > 0 && (
      <p class="radar-key">
        {extra.map((e, i) => <span><b>{codes[i]}</b> {e.label}</span>)}
      </p>
    )}
    </>
  );
}
