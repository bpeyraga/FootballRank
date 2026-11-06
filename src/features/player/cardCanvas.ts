// Dibuja la ficha del jugador (formato historia 1080×1920) con Canvas 2D y la comparte o descarga. Sin librerías.
import { ATTRS, type Stats } from '../../shared/model';
import { CREST, KITS } from '../../shared/teams';
import { SHAPES } from '../../shared/ui/Crest';
import {
  STORY_H, STORY_W, TIER_COLORS, cardInner, cardTier, cardFileName, ellipsize, fitFontPx, initialOf, shieldPoints,
  splitRow, storyLayout, type Measure, type Rect, type SummaryTile,
} from './cardLayout';

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

const DISPLAY = '"Barlow Condensed","Arial Narrow",Impact,sans-serif';
const BODY = '"Barlow",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
export const SITE = 'futbol-rank.vercel.app';

type Ctx = CanvasRenderingContext2D;
const font = (px: number, weight = 700, family = DISPLAY) => `${weight} ${px}px ${family}`;

/** Espera a que estén las fuentes de la app (con tope: si no llegan se usa la alternativa). */
async function loadFonts() {
  try {
    await Promise.race([
      Promise.all([document.fonts.load(font(100, 700)), document.fonts.load(font(100, 600, BODY)), document.fonts.load(font(100, 500, BODY))]),
      new Promise(r => setTimeout(r, 2500)),
    ]);
  } catch { /* sin fuentes propias: sigue con las del sistema */ }
}

/** Foto con CORS (Supabase Storage lo permite). Devuelve null si falla o tarda: se usa la inicial. */
export function loadImage(url: string | null, timeoutMs = 8000): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  return new Promise(resolve => {
    const img = new Image();
    let done = false;
    const end = (v: HTMLImageElement | null) => { if (!done) { done = true; clearTimeout(t); resolve(v); } };
    const t = setTimeout(() => end(null), timeoutMs);
    img.crossOrigin = 'anonymous';
    img.onload = () => end(img.naturalWidth ? img : null);
    img.onerror = () => end(null);
    // Parámetro propio: evita que el navegador reuse la copia cacheada del <img> sin CORS (taint del canvas).
    img.src = /^https?:/i.test(url) ? url + (url.includes('?') ? '&' : '?') + 'cors=1' : url;
  });
}

function shieldPath(ctx: Ctx, c: Rect) {
  const [first, ...rest] = shieldPoints(c);
  ctx.beginPath();
  ctx.moveTo(first[0], first[1]);
  for (const [x, y] of rest) ctx.lineTo(x, y);
  ctx.closePath();
}

function roundRectPath(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function spaced(ctx: Ctx, px: number) {
  if ('letterSpacing' in ctx) (ctx as any).letterSpacing = `${px}px`;
}

function background(ctx: Ctx, glow: string) {
  const g = ctx.createLinearGradient(0, 0, 0, STORY_H);
  g.addColorStop(0, '#0c1913'); g.addColorStop(0.5, '#123322'); g.addColorStop(1, '#0a1510');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, STORY_W, STORY_H);
  // Franjas de pasto
  ctx.fillStyle = 'rgba(255,255,255,.028)';
  for (let y = 0; y < STORY_H; y += 240) ctx.fillRect(0, y, STORY_W, 120);
  // Líneas de la cancha
  ctx.strokeStyle = 'rgba(255,255,255,.07)';
  ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(STORY_W / 2, STORY_H / 2, 250, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, STORY_H / 2); ctx.lineTo(STORY_W, STORY_H / 2); ctx.stroke();
  ctx.strokeRect(220, -6, STORY_W - 440, 300);
  ctx.strokeRect(220, STORY_H - 294, STORY_W - 440, 300);
  // Resplandor del color de la carta
  const r = ctx.createRadialGradient(STORY_W / 2, 900, 80, STORY_W / 2, 900, 760);
  r.addColorStop(0, glow); r.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = r;
  ctx.fillRect(0, 0, STORY_W, STORY_H);
}

function ball(ctx: Ctx, cx: number, cy: number, r: number) {
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#12241a';
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    const x = cx + Math.cos(a) * r * 0.42, y = cy + Math.sin(a) * r * 0.42;
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#12241a'; ctx.lineWidth = r * 0.1;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
}

const light = (hex: string) => {
  const n = parseInt(hex.slice(1, 7), 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 > 0.6;
};

/** Escudito del club (mismo dibujo que <Crest>) en un lienzo de 24×28 escalado a `w` de ancho. */
export function drawCrest(ctx: Ctx, team: string | null, left: number, top: number, w: number) {
  const k = team ? KITS[team] : undefined;
  if (!k) return;
  const d = CREST[team!] ?? {};
  const outline = new Path2D(SHAPES[d.f ?? 'shield']);
  const [c0, c1 = c0, c2] = k.c;
  ctx.save();
  ctx.translate(left, top);
  ctx.scale(w / 24, w / 24);
  ctx.save();
  ctx.clip(outline);
  const rect = (x: number, y: number, rw: number, rh: number, fill: string | CanvasGradient) => { ctx.fillStyle = fill; ctx.fillRect(x, y, rw, rh); };
  const poly = (pts: [number, number][], fill: string) => {
    ctx.fillStyle = fill; ctx.beginPath();
    pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.closePath(); ctx.fill();
  };
  switch (k.p) {
    case 'stripes': { const cols = c2 ? [c0, c1, c2] : [c0, c1]; for (let i = 0; i < 6; i++) rect(i * 4, 0, 4, 28, cols[i % cols.length]); break; }
    case 'hband': rect(0, 0, 24, 28, c0); rect(0, 10.5, 24, 6.5, c1); break;
    case 'sash': rect(0, 0, 24, 28, c0); poly([[-1, 5], [5, -1], [27, 21], [21, 27]], c1); break;
    case 'halves': rect(0, 0, 12, 28, c0); rect(12, 0, 12, 28, c1); break;
    case 'vee': rect(0, 0, 24, 28, c0); poly([[2, 2], [6.5, 2], [12, 12], [17.5, 2], [22, 2], [12, 19]], c1); break;
    default: rect(0, 0, 24, 28, c0);
  }
  const gloss = ctx.createLinearGradient(0, 0, 0, 28);
  gloss.addColorStop(0, 'rgba(255,255,255,.28)'); gloss.addColorStop(0.45, 'rgba(255,255,255,0)'); gloss.addColorStop(1, 'rgba(0,0,0,.18)');
  rect(0, 0, 24, 28, gloss);
  const letters = d.l ?? k.s;
  const ty = k.p === 'hband' ? 15.6 : 18.5;
  const fs = letters.length >= 5 ? 4.2 : letters.length === 4 ? 5 : 6;
  const busy = k.p === 'stripes' || k.p === 'halves' || k.p === 'sash' || k.p === 'vee';
  if (busy) {
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    roundRectPath(ctx, 3.5, ty - fs * 0.86, 17, fs + 1.1, 1.2); ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = k.p === 'hband' ? (light(c1) ? '#1d1d1d' : '#ffffff') : busy ? '#ffffff' : k.t;
  ctx.font = `700 ${fs}px ${DISPLAY}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(letters, 12, ty);
  ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = d.b ? 2.4 : 1; ctx.stroke(outline);
  if (d.b) { ctx.strokeStyle = d.b; ctx.lineWidth = 1.3; ctx.stroke(outline); }
  ctx.restore();
}

function drawPhoto(ctx: Ctx, img: HTMLImageElement | null, name: string, p: { cx: number; cy: number; r: number }, ink: string) {
  ctx.save();
  ctx.beginPath(); ctx.arc(p.cx, p.cy, p.r, 0, Math.PI * 2); ctx.clip();
  if (img) {
    const s = Math.min(img.naturalWidth, img.naturalHeight);
    ctx.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, p.cx - p.r, p.cy - p.r, p.r * 2, p.r * 2);
  } else {
    ctx.fillStyle = '#dcefe2'; ctx.fillRect(p.cx - p.r, p.cy - p.r, p.r * 2, p.r * 2);
    ctx.fillStyle = ink; ctx.font = font(Math.round(p.r * 1.1)); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(initialOf(name), p.cx, p.cy + p.r * 0.06);
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 10;
  ctx.beginPath(); ctx.arc(p.cx, p.cy, p.r, 0, Math.PI * 2); ctx.stroke();
}

/** Arma la imagen y la devuelve como PNG. */
export async function renderCardPng(d: CardData): Promise<Blob> {
  const [img] = await Promise.all([loadImage(d.photoUrl), loadFonts()]);
  const canvas = document.createElement('canvas');
  canvas.width = STORY_W; canvas.height = STORY_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  const L = storyLayout();
  const tier = cardTier(d.ovr);
  const col = TIER_COLORS[tier];
  const measureWith = (family: string, weight = 700): Measure => (t, px) => { ctx.font = font(px, weight, family); return ctx.measureText(t).width; };
  const measure = measureWith(DISPLAY);

  background(ctx, tier === 'gold' ? 'rgba(217,170,46,.30)' : tier === 'silver' ? 'rgba(184,194,202,.26)' : tier === 'bronze' ? 'rgba(201,154,104,.26)' : 'rgba(95,208,138,.2)');
  ctx.textBaseline = 'alphabetic';

  // Marca y comunidad
  const brand = 'RANKING FÚTBOL';
  ctx.fillStyle = '#e6f0e9'; ctx.font = font(64); spaced(ctx, 6);
  const bw = ctx.measureText(brand).width, ballD = 60, gap = 22;
  const bx = (STORY_W - (ballD + gap + bw)) / 2;
  ball(ctx, bx + ballD / 2, L.brandY - 22, ballD / 2);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#e6f0e9'; ctx.font = font(64); spaced(ctx, 6);
  ctx.fillText(brand, bx + ballD + gap, L.brandY);
  spaced(ctx, 0);
  ctx.textAlign = 'center';
  if (d.community) {
    ctx.fillStyle = '#5fd08a';
    const cpx = fitFontPx(measureWith(BODY, 600), d.community, 860, 48, 28);
    ctx.font = font(cpx, 600, BODY);
    ctx.fillText(ellipsize(measureWith(BODY, 600), d.community, cpx, 860), STORY_W / 2, L.communityY);
  }

  // Carta
  const c = L.card;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 70; ctx.shadowOffsetY = 28;
  shieldPath(ctx, c);
  const g = ctx.createLinearGradient(c.x, c.y, c.x + c.w, c.y + c.h);
  g.addColorStop(0, col.from); g.addColorStop(1, col.to);
  ctx.fillStyle = g; ctx.fill();
  ctx.restore();
  ctx.save();
  shieldPath(ctx, c); ctx.clip();
  const shine = ctx.createLinearGradient(c.x, c.y, c.x + c.w * 0.9, c.y + c.h * 0.6);
  shine.addColorStop(0, 'rgba(255,255,255,.42)'); shine.addColorStop(0.5, 'rgba(255,255,255,0)'); shine.addColorStop(1, 'rgba(0,0,0,.08)');
  ctx.fillStyle = shine; ctx.fillRect(c.x, c.y, c.w, c.h);
  ctx.restore();
  shieldPath(ctx, c);
  ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 8; ctx.stroke();

  const I = cardInner(c);
  ctx.fillStyle = col.ink; ctx.textAlign = 'center';
  ctx.font = font(I.ovr.px); ctx.fillText(d.ovr == null ? '—' : String(d.ovr), I.ovr.cx, I.ovr.baseline);
  ctx.font = font(I.pos.px, 600); spaced(ctx, 3); ctx.fillText(d.pos, I.pos.cx, I.pos.baseline); spaced(ctx, 0);
  drawCrest(ctx, d.favTeam, I.crest.cx - I.crest.w / 2, I.crest.top, I.crest.w);
  if (d.shirt) {
    const crestH = KITS[d.favTeam ?? ''] ? I.crest.w * 28 / 24 + 22 : 0;
    ctx.font = font(I.shirt.px);
    const label = String(d.shirt);
    const tw = ctx.measureText(label).width, pad = 12;
    const bx = I.shirt.cx - tw / 2 - pad, by = I.crest.top + crestH, bh = I.shirt.px + pad;
    roundRectPath(ctx, bx, by, tw + pad * 2, bh, 8);
    ctx.strokeStyle = col.ink; ctx.lineWidth = 4; ctx.stroke();
    ctx.fillStyle = col.ink; ctx.fillText(label, I.shirt.cx, by + I.shirt.px * 0.88 + pad / 2 - 2);
  }
  drawPhoto(ctx, img, d.name, I.photo, col.ink);

  // Nombre
  const name = d.name.toUpperCase();
  const npx = fitFontPx(measure, name, I.name.maxW, I.name.startPx, I.name.minPx);
  const shown = ellipsize(measure, name, npx, I.name.maxW);
  ctx.fillStyle = col.ink; ctx.font = font(npx); spaced(ctx, 2);
  ctx.fillText(shown, I.name.cx, I.name.baseline);
  const nw = ctx.measureText(shown).width;
  spaced(ctx, 0);
  ctx.fillRect(I.name.cx - nw / 2, I.name.baseline + 14, nw, 4);

  // Las 6 stats
  ATTRS.forEach(([k, label], i) => {
    const s = I.stats[i];
    ctx.textAlign = 'right'; ctx.font = font(I.statPx, 700);
    ctx.fillText(d.stats ? String(d.stats[k]) : '—', s.valueRight, s.baseline);
    ctx.textAlign = 'left'; ctx.font = font(I.statPx, 600);
    ctx.fillText(label, s.labelLeft, s.baseline);
  });

  // Casillas de resumen
  if (d.summary.length) {
    const cells = splitRow(c.x, c.w, d.summary.length, 18);
    d.summary.forEach((t, i) => {
      const x = cells[i].x, w = cells[i].w, y = L.summary.y, h = L.summary.h;
      roundRectPath(ctx, x, y, w, h, 28);
      ctx.fillStyle = 'rgba(255,255,255,.09)'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = 3; ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff'; ctx.font = font(96); ctx.fillText(t.value, x + w / 2, y + 100);
      ctx.fillStyle = '#93a89b';
      const lp = fitFontPx(measureWith(BODY, 600), t.label, w - 16, 28, 18);
      ctx.font = font(lp, 600, BODY); spaced(ctx, 2);
      ctx.fillText(t.label, x + w / 2, y + 150);
      spaced(ctx, 0);
    });
  }

  // Pie
  ctx.textAlign = 'center';
  ctx.fillStyle = '#93a89b'; ctx.font = font(36, 500, BODY);
  ctx.fillText(`Armá el ranking de tu comunidad en ${SITE}`, STORY_W / 2, L.footerY);

  return new Promise((ok, ko) => canvas.toBlob(b => (b ? ok(b) : ko(new Error('png'))), 'image/png'));
}

export type ShareResult = 'shared' | 'cancelled' | 'downloaded' | 'blocked';

/** Descarga el archivo (en escritorio, o donde no se pueden compartir archivos). */
export function downloadBlob(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

/**
 * Abre el menú de compartir del sistema con la imagen (WhatsApp, Instagram...) si el navegador lo permite; si no, la descarga.
 * 'blocked' = el navegador pidió un toque nuevo (pasó demasiado tiempo desde el click): hay que reintentar desde un botón.
 */
export async function shareBlob(blob: Blob, filename: string, title: string, text: string): Promise<ShareResult> {
  const file = new File([blob], filename, { type: 'image/png' });
  if (typeof navigator.canShare === 'function' && typeof navigator.share === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title, text });
      return 'shared';
    } catch (e: any) {
      if (e?.name === 'AbortError') return 'cancelled';
      if (e?.name === 'NotAllowedError') return 'blocked';
      // Cualquier otro error: cae a la descarga
    }
  }
  downloadBlob(blob, filename);
  return 'downloaded';
}

export { cardFileName };
