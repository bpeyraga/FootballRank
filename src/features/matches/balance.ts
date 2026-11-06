import { POS, type Pos, type Stats } from '../../shared/model';

export interface BPlayer { id: string; pos: Pos; ovr: number; attrs: Stats }
export interface Split<T> { cost: number; A: T[]; B: T[] }

/**
 * Port de balance() de la v1 (index.html). Devuelve las 5 mejores particiones.
 * n ≤ 22: enumeración completa (jugador 0 fijo en A); n > 22: 300 arranques + hill-climbing.
 * Costo: OVR (×3), atributos, arqueros repartidos y posiciones.
 */
export function balance<T extends BPlayer>(players: T[]): Split<T>[] {
  const n = players.length;
  if (n < 2) return [];
  const V = players.map(p => {
    const a = p.attrs;
    const v = [p.ovr, a.rit, a.tir, a.pas, a.reg, a.def, a.fis, 0, 0, 0, 0];
    v[7 + POS.indexOf(p.pos)] = 1;
    return v;
  });
  const T = new Array(11).fill(0);
  V.forEach(v => v.forEach((x, k) => { T[k] += x; }));
  const sizes = n % 2 ? [n >> 1, (n >> 1) + 1] : [n / 2];

  function cost(a: number[], na: number) {
    const nb = n - na, h = n / 2, odd = na !== nb;
    const fA = odd ? h / na : 1, fB = odd ? h / nb : 1;
    let c = 3 * Math.abs(a[0] * fA - (T[0] - a[0]) * fB);
    for (let k = 1; k <= 6; k++) c += Math.abs(a[k] * fA - (T[k] - a[k]) * fB) / 6;
    const arqA = a[7], arqB = T[7] - a[7];
    if (T[7] >= 2) { if (arqA === 0 || arqB === 0) c += 1000; c += Math.abs(arqA - arqB) * 200; }
    c += 15 * (Math.abs(a[8] - (T[8] - a[8])) + Math.abs(a[9] - (T[9] - a[9])) + Math.abs(a[10] - (T[10] - a[10])));
    return c;
  }

  const top: { c: number; key: string; A: number[] }[] = [];
  const ok = (c: number) => top.length < 5 || c < top[top.length - 1].c;
  const add = (c: number, key: string, A: number[]) => {
    if (top.some(t => t.key === key)) return;
    top.push({ c, key, A }); top.sort((x, y) => x.c - y.c); if (top.length > 5) top.pop();
  };
  const canon = (A: number[]) => {
    if (!A.includes(0)) { const s = new Set(A); A = []; for (let i = 0; i < n; i++) if (!s.has(i)) A.push(i); }
    return A.slice().sort((x, y) => x - y);
  };

  if (n <= 22) {
    for (const size of sizes) {
      const a = V[0].slice();
      const rec = (i: number, cnt: number, mask: number) => {
        if (cnt === size) {
          const c = cost(a, size);
          if (ok(c)) { const A: number[] = []; for (let j = 0; j < n; j++) if ((mask >> j) & 1) A.push(j); add(c, String(mask), A); }
          return;
        }
        if (n - i < size - cnt) return;
        for (let k = 0; k < 11; k++) a[k] += V[i][k];
        rec(i + 1, cnt + 1, mask | (1 << i));
        for (let k = 0; k < 11; k++) a[k] -= V[i][k];
        rec(i + 1, cnt, mask);
      };
      rec(1, 1, 1);
    }
  } else {
    for (let s = 0; s < 300; s++) {
      const idx = [...Array(n).keys()];
      for (let i = n - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [idx[i], idx[j]] = [idx[j], idx[i]]; }
      const size = sizes[(Math.random() * sizes.length) | 0];
      const A = idx.slice(0, size), B = idx.slice(size);
      const a = new Array(11).fill(0);
      A.forEach(i => { for (let k = 0; k < 11; k++) a[k] += V[i][k]; });
      let cur = cost(a, size);
      if (ok(cur)) { const cA = canon(A); add(cur, cA.join(','), cA); }
      let improved = true;
      while (improved) {
        improved = false;
        for (let x = 0; x < size; x++) {
          for (let y = 0; y < B.length; y++) {
            const vx = V[A[x]], vy = V[B[y]];
            for (let k = 0; k < 11; k++) a[k] += vy[k] - vx[k];
            const c = cost(a, size);
            if (ok(c)) { const A2 = A.slice(); A2[x] = B[y]; const cA = canon(A2); add(c, cA.join(','), cA); }
            if (c < cur - 1e-9) { const t = A[x]; A[x] = B[y]; B[y] = t; cur = c; improved = true; }
            else for (let k = 0; k < 11; k++) a[k] -= vy[k] - vx[k];
          }
        }
      }
    }
  }

  return top.map(t => {
    const s = new Set(t.A);
    return { cost: t.c, A: t.A.map(i => players[i]), B: players.filter((_, i) => !s.has(i)) };
  });
}
