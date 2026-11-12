// Del diseño del escudo a una imagen: el SVG (crestCore) se dibuja en un canvas. Necesita el navegador (Image y canvas).
import { CREST_H, CREST_W, crestDataUrl, type CrestDesign } from './crestCore';

const toBlob = (c: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((ok, ko) => c.toBlob(b => (b ? ok(b) : ko(new Error('No se pudo armar la imagen del escudo'))), type, quality));

/** Carga el SVG del escudo (como data: URL, que el CSP deja en img-src) a un tamaño dado. */
function loadCrest(design: CrestDesign, width: number): Promise<HTMLImageElement> {
  return new Promise((ok, ko) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => ko(new Error('No se pudo dibujar el escudo'));
    img.src = crestDataUrl(design, width);
  });
}

/** Dibuja el escudo centrado en un lienzo cuadrado de `side` px, ocupando `fill` (0 a 1) del lado. */
async function paint(design: CrestDesign, side: number, fill: number, background?: string) {
  const h = Math.round(side * fill), w = Math.round((h * CREST_W) / CREST_H);
  const img = await loadCrest(design, w);
  const c = document.createElement('canvas');
  c.width = c.height = side;
  const g = c.getContext('2d');
  if (!g) throw new Error('No se pudo armar la imagen del escudo');
  if (background) { g.fillStyle = background; g.fillRect(0, 0, side, side); }
  g.drawImage(img, Math.round((side - w) / 2), Math.round((side - h) / 2), w, h);
  return c;
}

/** El escudo como PNG transparente de 512×512 (el escudo ocupa todo el alto). */
export async function crestPng(design: CrestDesign): Promise<Blob> {
  return toBlob(await paint(design, 512, 1), 'image/png');
}

/**
 * Plan B si la base todavía no acepta escudos diseñados: un JPEG cuadrado de 320 px con el escudo sobre el color de fondo
 * (el JPEG no tiene transparencia). Va dentro de la forma de siempre, igual que una imagen subida.
 */
export async function crestJpeg(design: CrestDesign, background: string): Promise<Blob> {
  return toBlob(await paint(design, 320, 0.8, background), 'image/jpeg', 0.92);
}
