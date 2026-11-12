// Escudo propio de la comunidad ("Crear escudo"): el diseño, sus reglas y el dibujo en SVG. Todo puro (sin DOM, sin Supabase,
// sin Preact): el SVG sale igual para el mismo diseño y se puede probar en Node. Los escudos son originales: formas, bandas y
// símbolos genéricos, nada copiado de un club.
import { initials } from '../../shared/text';
import { adminError } from './model';

// ---------- Opciones ----------

export const CREST_SHAPES = ['classic', 'rounded', 'circle', 'diamond', 'pointed', 'square'] as const;
export const CREST_PATTERNS = ['solid', 'vstripes', 'hstripes', 'diagonal', 'quarters', 'halves', 'border', 'chevron'] as const;
export const CREST_SYMBOLS = ['initials', 'ball', 'star', 'bolt', 'crown', 'year', 'none'] as const;
export type CrestShape = typeof CREST_SHAPES[number];
export type CrestPattern = typeof CREST_PATTERNS[number];
export type CrestSymbol = typeof CREST_SYMBOLS[number];

export const SHAPE_LABEL: Record<CrestShape, string> = {
  classic: 'Clásico', rounded: 'Redondeado', circle: 'Círculo', diamond: 'Rombo', pointed: 'Con punta', square: 'Cuadrado',
};
export const PATTERN_LABEL: Record<CrestPattern, string> = {
  solid: 'Liso', vstripes: 'Franjas', hstripes: 'Rayas', diagonal: 'Banda', quarters: 'Cuartelado', halves: 'Mitades', border: 'Ribete', chevron: 'Chevrón',
};
export const SYMBOL_LABEL: Record<CrestSymbol, string> = {
  initials: 'Iniciales', ball: 'Pelota', star: 'Estrella', bolt: 'Rayo', crown: 'Corona', year: 'Año', none: 'Ninguno',
};

/** Colores sugeridos (además del selector libre). */
export const CREST_PALETTE: { name: string; hex: string }[] = [
  { name: 'Verde', hex: '#1b8a4b' }, { name: 'Verde oscuro', hex: '#0f5a30' }, { name: 'Celeste', hex: '#74acdf' },
  { name: 'Azul', hex: '#1f4fb3' }, { name: 'Azul marino', hex: '#0e2a5c' }, { name: 'Rojo', hex: '#d62f2f' },
  { name: 'Bordó', hex: '#7b1630' }, { name: 'Naranja', hex: '#f07f13' }, { name: 'Amarillo', hex: '#f6c90e' },
  { name: 'Dorado', hex: '#c9a227' }, { name: 'Violeta', hex: '#6a2c91' }, { name: 'Rosa', hex: '#e8528f' },
  { name: 'Gris', hex: '#8b949e' }, { name: 'Negro', hex: '#171a1c' },
  { name: 'Blanco', hex: '#ffffff' },
];

export const MAX_INITIALS = 4;
export const MAX_RIBBON = 14;
export const MAX_STARS = 5;
export const MIN_YEAR = 1850;
export const MAX_YEAR = 2100;
/** Tamaño del dibujo (proporción del escudo); el PNG se arma sobre esta base. */
export const CREST_W = 200;
export const CREST_H = 224;

export interface CrestDesign {
  v: 1;
  shape: CrestShape;
  pattern: CrestPattern;
  symbol: CrestSymbol;
  /** Color principal (el fondo), secundario (el dibujo) y de detalle (borde, símbolo y cinta); null = automático. */
  c1: string;
  c2: string;
  c3: string | null;
  initials: string;
  ribbon: string;
  /** Año de fundación (se ve arriba o, con el símbolo "Año", en el centro). */
  year: number | null;
  stars: number;
}

// ---------- Color ----------

const HEX = /^#[0-9a-f]{6}$/i;
const asHex = (v: unknown): string | null => (typeof v === 'string' && HEX.test(v.trim()) ? v.trim().toLowerCase() : null);

/** HSL (grados, %, %) a "#rrggbb". */
export function hslHex(h: number, s: number, l: number): string {
  const hh = ((h % 360) + 360) % 360, ss = s / 100, ll = l / 100;
  const a = ss * Math.min(ll, 1 - ll);
  const f = (n: number) => {
    const k = (n + hh / 30) % 12;
    return ll - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  return '#' + [f(0), f(8), f(4)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}

/** Luminosidad percibida de un "#rrggbb" (0 a 1). */
export function lum(hex: string): number {
  const n = parseInt(hex.slice(1, 7), 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

const DARK = '#14201a';
/** Tinta que se lee sobre ese color: casi negro sobre claros, blanco sobre oscuros. */
export const ink = (hex: string) => (lum(hex) > 0.6 ? DARK : '#ffffff');

// ---------- Textos ----------

const first = (s: string, n: number) => Array.from(s).slice(0, n).join('');

/** Iniciales: solo letras y números, en mayúscula, hasta MAX_INITIALS. */
export const cleanInitials = (v: unknown) =>
  first(String(typeof v === 'string' ? v : '').toUpperCase().replace(/[^\p{L}\p{N}]/gu, ''), MAX_INITIALS);

/**
 * Texto de la cinta: letras, números, espacio y . - & ' ! en mayúscula, hasta MAX_RIBBON.
 * Con `trim` false conserva los espacios del borde (para escribir en el campo sin que se coma el espacio).
 */
export function cleanRibbon(v: unknown, trim = true) {
  let s = String(typeof v === 'string' ? v : '').toUpperCase().replace(/[^\p{L}\p{N} .\-&'!]/gu, '').replace(/ {2,}/g, ' ');
  if (trim) s = s.trim(); else s = s.replace(/^ /, '');
  return first(s, MAX_RIBBON);
}

/** Año válido (clavado entre MIN_YEAR y MAX_YEAR) o null. */
function cleanYear(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(MAX_YEAR, Math.max(MIN_YEAR, n)) : null;
}

const pick = <T extends string>(list: readonly T[], v: unknown, fb: T): T => (list.includes(v as T) ? (v as T) : fb);

// ---------- Diseño ----------

/** Diseño de arranque de una comunidad: los colores salen de su tono y las iniciales de su nombre. */
export function defaultCrest(name: string, hue: number): CrestDesign {
  const ini = cleanInitials(initials(name)) || 'FC';
  return {
    v: 1, shape: 'classic', pattern: 'vstripes', symbol: 'initials',
    c1: hslHex(hue, 55, 38), c2: '#ffffff', c3: null,
    initials: ini, ribbon: '', year: null, stars: 0,
  };
}

const BASE = defaultCrest('FC', 140);

/**
 * Deja un diseño siempre válido: lo que no sea de la lista o no sea un color #rrggbb vuelve al `fallback`;
 * los textos se limpian, las estrellas y el año se acotan. Lo que llega de la base o del formulario pasa por acá.
 */
export function validateCrest(input: unknown, fallback: CrestDesign = BASE): CrestDesign {
  const i = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const stars = Math.round(Number(i.stars));
  return {
    v: 1,
    shape: pick(CREST_SHAPES, i.shape, fallback.shape),
    pattern: pick(CREST_PATTERNS, i.pattern, fallback.pattern),
    symbol: pick(CREST_SYMBOLS, i.symbol, fallback.symbol),
    c1: asHex(i.c1) ?? fallback.c1,
    c2: asHex(i.c2) ?? fallback.c2,
    c3: i.c3 === null || i.c3 === undefined ? null : asHex(i.c3) ?? fallback.c3,
    initials: typeof i.initials === 'string' ? cleanInitials(i.initials) : fallback.initials,
    ribbon: typeof i.ribbon === 'string' ? cleanRibbon(i.ribbon) : fallback.ribbon,
    year: 'year' in i ? cleanYear(i.year) : fallback.year,
    stars: Number.isFinite(stars) ? Math.min(MAX_STARS, Math.max(0, stars)) : fallback.stars,
  };
}

export { isCrestUrl } from './crestUrl';

/** Traduce los errores de guardar el escudo. */
export function crestError(m: string) {
  if (m.includes('bad_crest') || m.includes('bad_photo')) return 'No se pudo guardar el escudo: la imagen o el diseño no son válidos.';
  return adminError(m);
}

/** "Sorprendeme": forma, colores, dibujo y símbolo al azar; conserva lo escrito (iniciales, cinta, año y estrellas). `rand` da [0, 1). */
export function randomCrest(rand: () => number, base: CrestDesign): CrestDesign {
  const one = <T>(a: readonly T[]): T => a[Math.min(a.length - 1, Math.floor(rand() * a.length))];
  const c1 = one(CREST_PALETTE).hex;
  const apart = CREST_PALETTE.filter(p => p.hex !== c1 && Math.abs(lum(p.hex) - lum(c1)) >= 0.22);
  const c2 = (apart.length ? one(apart) : { hex: lum(c1) > 0.5 ? '#171a1c' : '#ffffff' }).hex;
  const third = CREST_PALETTE.filter(p => p.hex !== c1);
  const symbols = CREST_SYMBOLS.filter(s => s !== 'year' || base.year !== null);
  return validateCrest({
    ...base,
    shape: one(CREST_SHAPES), pattern: one(CREST_PATTERNS), symbol: one(symbols),
    c1, c2, c3: rand() < 0.5 ? null : one(third).hex,
  }, base);
}

// ---------- SVG ----------

const f = (x: number) => String(Math.round(x * 10) / 10);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** Contorno de cada forma (en un lienzo de 200×224), centro donde va el símbolo, escala del símbolo y alto del año. */
const SHAPES: Record<CrestShape, { d: string; cy: number; k: number; yy: number }> = {
  classic: { d: 'M24 34H176V120C176 168 140 196 100 214C60 196 24 168 24 120Z', cy: 108, k: 1, yy: 58 },
  rounded: { d: 'M100 34C150 34 176 76 176 124C176 176 144 204 100 214C56 204 24 176 24 124C24 76 50 34 100 34Z', cy: 110, k: 1, yy: 62 },
  circle: { d: 'M18 116A82 82 0 1 0 182 116A82 82 0 1 0 18 116Z', cy: 110, k: 1, yy: 56 },
  diamond: { d: 'M100 30L178 122L100 214L22 122Z', cy: 114, k: 0.8, yy: 70 },
  pointed: { d: 'M24 54Q64 54 100 30Q136 54 176 54V122C176 168 140 196 100 214C60 196 24 168 24 122Z', cy: 112, k: 1, yy: 64 },
  square: { d: 'M46 34H154L176 56V188L154 210H46L24 188V56Z', cy: 112, k: 1, yy: 58 },
};

/** Ancho aproximado de un texto en mayúscula (en "em"): para fijarle el largo y que se vea igual con cualquier tipografía. */
const NARROW: Record<string, number> = { I: 0.34, J: 0.55, 1: 0.5, ' ': 0.3, '.': 0.3, '-': 0.4, "'": 0.25, '!': 0.33, M: 0.92, W: 0.98, '&': 0.8 };
const em = (s: string) => Array.from(s).reduce((a, c) => a + (NARROW[c] ?? 0.68), 0);

const FONT = 'font-family="Arial,Helvetica,sans-serif" font-weight="800"';

/** Un texto con largo fijo (textLength) y contorno detrás. `y` es el centro vertical. */
function label(s: string, x: number, y: number, fs: number, fill: string, halo: string, sw: number) {
  const w = em(s) * fs;
  return `<text x="${f(x)}" y="${f(y + fs * 0.36)}" text-anchor="middle" ${FONT} font-size="${f(fs)}" textLength="${f(w)}" lengthAdjust="spacingAndGlyphs" fill="${fill}" stroke="${halo}" stroke-width="${sw}" stroke-linejoin="round" paint-order="stroke">${esc(s)}</text>`;
}

const starPts = (r1: number, r2: number) =>
  Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? r2 : r1;
    return `${f(r * Math.cos(a))},${f(r * Math.sin(a))}`;
  }).join(' ');

/** Dibujo del patrón sobre el fondo c1 (se recorta con la forma). */
function pattern(p: CrestPattern, c2: string, d: string): string {
  switch (p) {
    case 'vstripes': return `<rect x="46" y="0" width="36" height="224" fill="${c2}"/><rect x="118" y="0" width="36" height="224" fill="${c2}"/>`;
    case 'hstripes': return `<rect x="0" y="70" width="200" height="36" fill="${c2}"/><rect x="0" y="142" width="200" height="36" fill="${c2}"/>`;
    case 'diagonal': return `<rect x="-30" y="100" width="260" height="44" fill="${c2}" transform="rotate(35 100 122)"/>`;
    case 'quarters': return `<rect x="0" y="0" width="100" height="122" fill="${c2}"/><rect x="100" y="122" width="100" height="102" fill="${c2}"/>`;
    case 'halves': return `<rect x="100" y="0" width="100" height="224" fill="${c2}"/>`;
    case 'border': return `<path d="${d}" fill="none" stroke="${c2}" stroke-width="28" stroke-linejoin="round"/>`;
    case 'chevron': return `<path d="M0 166L100 96L200 166V210L100 140L0 210Z" fill="${c2}"/>`;
    default: return '';
  }
}

/** El símbolo del centro, dibujado alrededor de (0,0) en un cuadro de unos 70×70. */
function symbol(c: CrestDesign, detail: string, halo: string): string {
  const style = `fill="${detail}" stroke="${halo}" stroke-width="6" stroke-linejoin="round" paint-order="stroke"`;
  switch (c.symbol) {
    case 'initials': {
      if (!c.initials) return '';
      const n = Array.from(c.initials).length;
      const fs = Math.min([0, 60, 50, 40, 32][n] ?? 32, 96 / em(c.initials));
      return label(c.initials, 0, 0, fs, detail, halo, 6);
    }
    case 'ball': {
      const pent = Array.from({ length: 5 }, (_, i) => {
        const a = (-Math.PI / 2) + (i * 2 * Math.PI) / 5;
        return [12 * Math.cos(a), 12 * Math.sin(a), 30 * Math.cos(a), 30 * Math.sin(a)];
      });
      return `<circle r="30" fill="#ffffff" stroke="${DARK}" stroke-width="3.5"/>`
        + pent.map(([x1, y1, x2, y2]) => `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${DARK}" stroke-width="2.5"/>`).join('')
        + `<polygon points="${pent.map(p => `${f(p[0])},${f(p[1])}`).join(' ')}" fill="${DARK}" stroke="${DARK}" stroke-width="2" stroke-linejoin="round"/>`;
    }
    case 'star': return `<polygon points="${starPts(36, 15)}" ${style}/>`;
    case 'bolt': return `<polygon points="10,-40 -22,6 -4,6 -12,40 24,-8 4,-8" ${style}/>`;
    case 'crown':
      return `<path d="M-34 22L-40 -16L-18 2L0 -26L18 2L40 -16L34 22Z" ${style}/>`
        + `<rect x="-34" y="26" width="68" height="9" rx="2" ${style}/>`;
    case 'year': {
      if (c.year === null) return '';
      return `<path d="M-30 -32H30V6C30 22 16 32 0 38C-16 32 -30 22 -30 6Z" ${style}/>${label(String(c.year), 0, -9, 16, ink(detail), detail, 0)}`;
    }
    default: return '';
  }
}

/**
 * El escudo como SVG (texto). Mismo diseño, mismo resultado. Pasa siempre por validateCrest: aunque el diseño venga de
 * afuera, los textos y colores no pueden meter nada raro en el SVG. `width` es el ancho en píxeles (el alto sigue la proporción).
 */
export function crestSvg(design: CrestDesign, width = CREST_W): string {
  const c = validateCrest(design);
  const S = SHAPES[c.shape];
  const detail = c.c3 ?? ink(c.c1);
  const halo = ink(detail);
  const w = Math.max(16, Math.round(width)), h = Math.round((w * CREST_H) / CREST_W);

  let out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CREST_W} ${CREST_H}" width="${w}" height="${h}" role="img" aria-label="Escudo">`;
  out += `<defs><clipPath id="k"><path d="${S.d}"/></clipPath></defs>`;
  // contorno oscuro de afuera (se ve sobre cualquier fondo), fondo + patrón recortados, y el aro de detalle
  out += `<path d="${S.d}" fill="none" stroke="${DARK}" stroke-opacity=".55" stroke-width="12" stroke-linejoin="round"/>`;
  out += `<g clip-path="url(#k)"><rect x="0" y="0" width="${CREST_W}" height="${CREST_H}" fill="${c.c1}"/>${pattern(c.pattern, c.c2, S.d)}</g>`;
  out += `<path d="${S.d}" fill="none" stroke="${detail}" stroke-width="6" stroke-linejoin="round"/>`;

  if (c.year !== null && c.symbol !== 'year') out += label(String(c.year), 100, S.yy, 13, detail, halo, 5);

  const sym = symbol(c, detail, halo);
  if (sym) out += `<g transform="translate(100 ${S.cy}) scale(${S.k})">${sym}</g>`;

  if (c.ribbon) {
    const rf = Math.max(10, Math.min(19, 150 / em(c.ribbon)));
    const ribbonInk = ink(detail);
    out += `<path d="M6 150H194L184 167L194 184H6L16 167Z" fill="${detail}" stroke="${ribbonInk}" stroke-width="2.5" stroke-linejoin="round"/>`;
    out += label(c.ribbon, 100, 167, rf, ribbonInk, detail, 0);
  }

  if (c.stars > 0) {
    const fill = c.c3 ?? '#f5c518', edge = ink(fill), pts = starPts(9.5, 4.1);
    for (let i = 0; i < c.stars; i++) {
      const x = 100 + (i - (c.stars - 1) / 2) * 22;
      out += `<polygon points="${pts}" transform="translate(${f(x)} 15)" fill="${fill}" stroke="${edge}" stroke-width="1.4" stroke-linejoin="round"/>`;
    }
  }
  return out + '</svg>';
}

/** El SVG como data: URL (para un <img> o para dibujarlo en un canvas; el CSP deja `data:` en img-src). */
export const crestDataUrl = (design: CrestDesign, width = CREST_W) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(crestSvg(design, width))}`;
