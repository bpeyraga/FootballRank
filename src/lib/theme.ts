import { KITS } from './teams';

// Tema visual: modo (auto/claro/oscuro) y paleta. Se guarda en este dispositivo.
// index.html lo aplica antes de cargar la app (sin parpadeo) leyendo la misma clave.
export type Mode = 'auto' | 'light' | 'dark';
export type Palette = 'cancha' | 'noche' | 'pasion' | 'violeta' | 'dorado' | 'celeste' | 'club';
export interface Theme { mode: Mode; palette: Palette; club?: ClubVars | null }
interface ClubVars { c: string; fg: string; d: string; dfg: string }

export const KEY = 'fr-theme';

/** Colores de muestra (claro) para las tarjetas de elección. */
export const PALETTES: { id: Palette; name: string; desc: string; sw: string[] }[] = [
  { id: 'cancha', name: 'Cancha', desc: 'El verde de siempre', sw: ['#f1f6f2', '#1f8a4c', '#dcefe2', '#12241a'] },
  { id: 'noche', name: 'Noche de copa', desc: 'Azul de partido nocturno', sw: ['#eef3fa', '#1d5fd1', '#dbe7fb', '#0f1d33'] },
  { id: 'pasion', name: 'Pasión', desc: 'Rojo para los que dejan todo', sw: ['#faf1f1', '#c62828', '#f8dcdc', '#2a1214'] },
  { id: 'violeta', name: 'Violeta', desc: 'Para salir del molde', sw: ['#f4f1fa', '#6d3fd1', '#e6dcfa', '#1f1633'] },
  { id: 'dorado', name: 'Dorado', desc: 'Negro y oro, de campeón', sw: ['#f7f4ec', '#9a7000', '#f3e7c2', '#0d0c0a'] },
  { id: 'celeste', name: 'Albiceleste', desc: 'Celeste y blanco, de Selección', sw: ['#eef7fc', '#1479b3', '#d6ecf8', '#0e2433'] },
];

const rgb = (hex: string) => { const n = parseInt(hex.slice(1, 7), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const lum = (hex: string) => { const [r, g, b] = rgb(hex); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
const mix = (hex: string, to: number, k: number) =>
  '#' + rgb(hex).map(v => Math.round(v + (to - v) * k).toString(16).padStart(2, '0')).join('');
const fgFor = (hex: string) => (lum(hex) > 0.5 ? '#111111' : '#ffffff');

/** Acento a partir de los colores del club: el primero que no sea casi blanco (si no, el color de la sigla). */
export function clubVars(team: string | null | undefined): ClubVars | null {
  const k = team ? KITS[team] : undefined;
  if (!k) return null;
  let c = [...k.c, k.t].find(x => lum(x) < 0.85) ?? '#1f8a4c';
  if (lum(c) > 0.7) c = mix(c, 0, 0.35);           // amarillos muy claros: más oscuros para que se lean en claro
  let d = c;
  while (lum(d) < 0.55) d = mix(d, 255, 0.25);      // en oscuro, más claro para que resalte
  return { c, fg: fgFor(c), d, dfg: fgFor(d) };
}

export function loadTheme(): Theme {
  try {
    const t = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (t && typeof t === 'object') return { mode: t.mode ?? 'auto', palette: t.palette ?? 'cancha', club: t.club ?? null };
  } catch { /* sin storage */ }
  return { mode: 'auto', palette: 'cancha' };
}

export function applyTheme(t: Theme) {
  const el = document.documentElement;
  if (t.mode === 'auto') el.removeAttribute('data-theme'); else el.setAttribute('data-theme', t.mode);
  if (t.palette === 'cancha' || (t.palette === 'club' && !t.club)) el.removeAttribute('data-palette');
  else el.setAttribute('data-palette', t.palette);
  for (const [k, v] of Object.entries({ '--club': t.club?.c, '--club-fg': t.club?.fg, '--club-d': t.club?.d, '--club-d-fg': t.club?.dfg }))
    if (v) el.style.setProperty(k, v); else el.style.removeProperty(k);
  // Barra del navegador/celular con el color del fondo
  requestAnimationFrame(() => {
    const head = getComputedStyle(el).getPropertyValue('--head').trim();
    document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute('content', head));
  });
}

export function saveTheme(t: Theme) {
  try { localStorage.setItem(KEY, JSON.stringify(t)); } catch { /* sin storage: vale para esta sesión */ }
  applyTheme(t);
}
