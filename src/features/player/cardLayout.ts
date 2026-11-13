// Geometría y textos de la ficha para compartir (1080×1920). Funciones puras: el dibujo está en cardCanvas.ts.
// Es solo geometría y texto (sin canvas ni QR); se carga junto con el dibujo, al armar la imagen.
import { ATTRS, type AttrKey, type Stats } from '../../shared/model';

// Textos y link: viven en shareText.ts (liviano) y se reexportan acá.
export { SHARE_URL, SITE, cardFileName, shareMessage } from './shareText';

export const STORY_W = 1080;
export const STORY_H = 1920;

export interface Rect { x: number; y: number; w: number; h: number }
/** Ancho en píxeles de un texto con la fuente ya fijada en el contexto (ctx.measureText) a `px` de tamaño. */
export type Measure = (text: string, px: number) => number;

export interface SummaryTile { label: string; value: string }

/** Todo lo que necesita la imagen. `community` vacío = sin línea de comunidad. */
export interface CardData {
  name: string;
  pos: string;
  ovr: number | null;
  stats: Stats | null;
  photoUrl: string | null;
  favTeam: string | null;
  shirt: number | null;
  community: string;
  summary: SummaryTile[];
}

/** Misma proporción que la carta de la app (.futcard: 196×280). */
export const CARD_RATIO = 280 / 196;

export type CardTier = 'gold' | 'silver' | 'bronze' | 'none';
export const cardTier = (o: number | null): CardTier => o == null ? 'none' : o >= 75 ? 'gold' : o >= 65 ? 'silver' : 'bronze';

/** Colores de la carta (los del tema claro de la app). `deep` = tono oscuro para bordes y sombras; `glow` = "r,g,b" del resplandor. */
export const TIER_COLORS: Record<CardTier, { from: string; to: string; ink: string; deep: string; glow: string }> = {
  gold: { from: '#f8e394', to: '#d9aa2e', ink: '#3b2b00', deep: '#8a6410', glow: '236,190,72' },
  silver: { from: '#f0f3f5', to: '#b8c2ca', ink: '#1e2a32', deep: '#66737d', glow: '190,206,220' },
  bronze: { from: '#ebcfae', to: '#c99a68', ink: '#3a2410', deep: '#7d5430', glow: '214,152,98' },
  none: { from: '#f4f8f5', to: '#dfe9e1', ink: '#12241a', deep: '#5a7364', glow: '95,208,138' },
};

/** Zonas de la historia: cabecera, carta (con casillas de resumen si hay) y bloque de invitación abajo. */
export function storyLayout(hasSummary = false) {
  // Abajo se deja margen: las historias de Instagram/WhatsApp tapan la franja de respuesta.
  const cta: Rect = { x: 60, y: 1430, w: 960, h: 332 };
  const top = 262, gap = 62;
  const bottom = cta.y - gap;
  const sum = hasSummary ? { h: 100, gap: 30 } : { h: 0, gap: 0 };
  let w = Math.min(800, Math.floor((bottom - top - sum.h - sum.gap) / CARD_RATIO));
  w -= w % 2; // par: la carta queda centrada en píxeles enteros
  const h = Math.round(w * CARD_RATIO);
  const y = top + Math.round((bottom - top - (h + sum.gap + sum.h)) / 2);
  const card: Rect = { x: (STORY_W - w) / 2, y, w, h };
  return {
    card,
    brandY: 132,
    communityY: 206,
    summary: { y: y + h + sum.gap, h: sum.h } as { y: number; h: number },
    cta,
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
    baseline: y + h * (0.695 + Math.floor(i / 2) * 0.064),
  }));
  const statPx = Math.round(w * 0.088);
  return {
    ovr: { cx: x + w * 0.2, baseline: y + h * 0.2, px: Math.round(w * 0.2) },
    pos: { cx: x + w * 0.2, baseline: y + h * 0.27, px: Math.round(w * 0.085) },
    crest: { cx: x + w * 0.2, top: y + h * 0.29, w: Math.round(w * 0.085) },
    shirt: { cx: x + w * 0.2, px: Math.round(w * 0.06) },
    photo: { cx: x + w * 0.62, cy: y + h * 0.31, r: Math.round(w * 0.23) },
    name: { cx: x + w / 2, baseline: y + h * 0.58, maxW: Math.round(w * 0.78), startPx: Math.round(w * 0.108), minPx: Math.round(w * 0.05) },
    statPx,
    stats,
    /** Línea vertical entre las dos columnas de stats. */
    divider: { x: x + w * 0.5, y1: stats[0].baseline - statPx * 0.82, y2: stats[4].baseline + statPx * 0.12 },
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

/** Parte un texto en líneas de hasta `maxW` (por palabras, como mucho `maxLines`); si sobra, la última termina en "…". */
export function wrapLines(measure: Measure, text: string, px: number, maxW: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (let i = 0; i < words.length; i++) {
    const next = cur ? `${cur} ${words[i]}` : words[i];
    if (!cur || measure(next, px) <= maxW) { cur = next; continue; }
    if (lines.length === maxLines - 1) { cur = [cur, ...words.slice(i)].join(' '); break; }
    lines.push(cur); cur = words[i];
  }
  if (cur) lines.push(cur);
  return lines.map((l, i) => i === lines.length - 1 ? ellipsize(measure, l, px, maxW) : l);
}

/** Primera letra en mayúscula para la foto vacía ("?" si no hay nombre). */
export const initialOf = (name: string) => name.trim().charAt(0).toUpperCase() || '?';

/**
 * Tamaño del QR: cada módulo es un número entero de píxeles (bordes nítidos, escanea mejor) y rodea al código una zona
 * de silencio de `quiet` módulos (el estándar pide 4). `size` incluye esa zona.
 */
export function qrGeometry(modules: number, maxPx: number, quiet = 4) {
  const cell = Math.max(1, Math.floor(maxPx / (modules + quiet * 2)));
  return { cell, quiet, inner: cell * modules, size: cell * (modules + quiet * 2) };
}

/** Bloque de invitación de abajo: logo, textos, link y el QR con su leyenda. */
export function ctaLayout(cta: Rect, qrSize: number) {
  const textX = cta.x + 44;
  const qrY = cta.y + Math.round((cta.h - (qrSize + 40)) / 2);
  const qr: Rect = { x: cta.x + cta.w - 30 - qrSize, y: qrY, w: qrSize, h: qrSize };
  return {
    qr,
    captionY: qr.y + qrSize + 34,
    text: { x: textX, maxW: qr.x - 36 - textX },
    logo: { x: textX, y: cta.y + 32, size: 76 },
    wordmarkBaseline: cta.y + 32 + 56,
    headlineY: cta.y + 182,
    subY: cta.y + 228,
    pill: { x: textX, y: cta.y + 254, h: 52 },
  };
}

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
