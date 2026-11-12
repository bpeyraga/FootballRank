// Generador pseudoaleatorio con semilla (mulberry32). Mismo estado → misma secuencia, en cualquier navegador.

/** Mezcla un seed cualquiera en un estado inicial bien repartido (semillas consecutivas no se parecen). */
export function seedState(seed: number): number {
  let h = (Math.floor(Number.isFinite(seed) ? seed : 0) ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

export class Rng {
  /** Estado de 32 bits: es lo único que hay que guardar para seguir la misma secuencia. */
  s: number;
  constructor(state: number) { this.s = state >>> 0; }

  /** Número en [0, 1). */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  chance(p: number): boolean { return this.next() < p; }
  range(a: number, b: number): number { return a + (b - a) * this.next(); }
  /** Entero entre a y b, ambos incluidos. */
  int(a: number, b: number): number { return a + Math.floor(this.next() * (b - a + 1)); }
  pick<T>(xs: readonly T[]): T { return xs[Math.floor(this.next() * xs.length)]; }
  /** Normal (Box-Muller). */
  normal(mean = 0, sd = 1): number {
    const u = Math.max(this.next(), 1e-12), v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  /** Poisson (Knuth): para cantidades chicas como goles. */
  poisson(lambda: number): number {
    if (!(lambda > 0)) return 0;
    const limit = Math.exp(-Math.min(lambda, 600));
    let k = 0, p = 1;
    do { k++; p *= this.next(); } while (p > limit && k < 400);
    return k - 1;
  }
  /** Cantidad de éxitos en n intentos con probabilidad p. */
  binomial(n: number, p: number): number {
    let k = 0;
    for (let i = 0; i < n; i++) if (this.next() < p) k++;
    return k;
  }
  /** Elige con pesos (los de peso 0 o negativo no salen). Devuelve undefined si no hay ninguno. */
  weighted<T>(items: readonly (readonly [T, number])[]): T | undefined {
    const total = items.reduce((t, [, w]) => t + Math.max(0, w), 0);
    if (!(total > 0)) return undefined;
    let x = this.next() * total;
    for (const [it, w] of items) { x -= Math.max(0, w); if (x < 0) return it; }
    return items[items.length - 1][0];
  }
}
