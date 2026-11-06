// Geometría y textos de la ficha para compartir (1080×1920). Funciones puras: el dibujo está en cardCanvas.ts.
import { ATTRS, type AttrKey } from './model';

export const STORY_W = 1080;
export const STORY_H = 1920;

export interface Rect { x: number; y: number; w: number; h: number }
/** Ancho en píxeles de un texto con la fuente ya fijada en el contexto (ctx.measureText) a `px` de tamaño. */
export type Measure = (text: string, px: number) => number;

/** Misma proporción que la carta de la app (.futcard: 196×280). */
export const CARD_RATIO = 280 / 196;

export type CardTier = 'gold' | 'silver' | 'bronze' | 'none';
export const cardTier = (o: number | null): CardTier => o == null ? 'none' : o >= 75 ? 'gold' : o >= 65 ? 'silver' : 'bronze';

/** Colores de la carta (los del tema claro de la app). */
export const TIER_COLORS: Record<CardTier, { from: string; to: string; ink: string }> = {
  gold: { from: '#f8e394', to: '#d9aa2e', ink: '#3b2b00' },
  silver: { from: '#f0f3f5', to: '#b8c2ca', ink: '#1e2a32' },
  bronze: { from: '#ebcfae', to: '#c99a68', ink: '#3a2410' },
  none: { from: '#f4f8f5', to: '#dfe9e1', ink: '#12241a' },
};

/** Marco general de la historia. */
export function storyLayout() {
  const w = 800;
  const h = Math.round(w * CARD_RATIO);
  const card: Rect = { x: (STORY_W - w) / 2, y: 330, w, h };
  return {
    card,
    brandY: 150,
    communityY: 250,
    summary: { y: card.y + h + 64, h: 176 } as { y: number; h: number },
    footerY: 1834,
  };
}

/** Contorno de escudo de la carta (mismo polígono que el clip-path del CSS). */
export function shieldPoints(c: Rect): [number, number][] {
  return [
    [c.x + c.w / 2, c.y], [c.x + c.w, c.y + c.h * 0.05], [c.x + c.w, c.y + c.h * 0.85],
    [c.x + c.w / 2, c.y + c.h], [c.x, c.y + c.h * 0.85], [c.x, c.y + c.h * 0.05],
  ];
}

/** Posiciones de cada elemento dentro de la carta (todo en proporción a su tamaño). */
export function cardInner(c: Rect) {
  const { x, y, w, h } = c;
  const stats = ATTRS.map(([k], i) => ({
    key: k as AttrKey,
    // Dos columnas, de a pares: RIT TIR / PAS REG / DEF FIS (igual que la carta de la app)
    valueRight: x + w * (i % 2 === 0 ? 0.295 : 0.655),
    labelLeft: x + w * (i % 2 === 0 ? 0.32 : 0.68),
    baseline: y + h * (0.665 + Math.floor(i / 2) * 0.062),
  }));
  return {
    ovr: { cx: x + w * 0.2, baseline: y + h * 0.2, px: Math.round(w * 0.2) },
    pos: { cx: x + w * 0.2, baseline: y + h * 0.27, px: Math.round(w * 0.085) },
    crest: { cx: x + w * 0.2, top: y + h * 0.29, w: Math.round(w * 0.085) },
    shirt: { cx: x + w * 0.2, px: Math.round(w * 0.06) },
    photo: { cx: x + w * 0.62, cy: y + h * 0.3, r: Math.round(w * 0.21) },
    name: { cx: x + w / 2, baseline: y + h * 0.56, maxW: Math.round(w * 0.78), startPx: Math.round(w * 0.108), minPx: Math.round(w * 0.05) },
    statPx: Math.round(w * 0.082),
    stats,
  };
}

/** Reparte `n` casilleros iguales en una fila de ancho `w` empezando en `x`. */
export function splitRow(x: number, w: number, n: number, gap: number): { x: number; w: number }[] {
  if (n <= 0) return [];
  const cell = (w - gap * (n - 1)) / n;
  return Array.from({ length: n }, (_, i) => ({ x: x + i * (cell + gap), w: cell }));
}

/** Achica el tamaño de letra (de a 2 px) hasta que el texto entre en `maxW`; nunca baja de `minPx`. */
export function fitFontPx(measure: Measure, text: string, maxW: number, startPx: number, minPx: number): number {
  let px = startPx;
  while (px > minPx && measure(text, px) > maxW) px -= 2;
  return Math.max(minPx, px);
}

/** Recorta con "…" para que entre en `maxW` (si ya entra, lo devuelve igual). */
export function ellipsize(measure: Measure, text: string, px: number, maxW: number): string {
  if (measure(text, px) <= maxW) return text;
  let s = text.trimEnd();
  while (s.length > 1 && measure(s + '…', px) > maxW) s = s.slice(0, -1).trimEnd();
  return s + '…';
}

/** Primera letra en mayúscula para la foto vacía ("?" si no hay nombre). */
export const initialOf = (name: string) => name.trim().charAt(0).toUpperCase() || '?';

/** "ficha-juan-perez.png": sin tildes ni símbolos. */
export function cardFileName(name: string): string {
  const slug = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `ficha-${slug || 'jugador'}.png`;
}

export interface SummaryTile { label: string; value: string }
/** Textos de las casillas de abajo (solo las que tienen dato): PJ, goles, asistencias y, de cuarta, figura (si lo fue) o presentismo. */
export function summaryTiles(i: { pj?: number | null; goals?: number | null; assists?: number | null; presence?: number | null; mvps?: number | null }): SummaryTile[] {
  const t: SummaryTile[] = [];
  if (i.pj != null) t.push({ label: 'PARTIDOS', value: String(i.pj) });
  if (i.goals != null) t.push({ label: 'GOLES', value: String(i.goals) });
  if (i.assists != null) t.push({ label: 'ASISTENCIAS', value: String(i.assists) });
  if (i.mvps != null && i.mvps > 0) t.push({ label: 'FIGURA', value: String(i.mvps) });
  else if (i.presence != null) t.push({ label: 'PRESENTISMO', value: `${i.presence}%` });
  return t;
}
