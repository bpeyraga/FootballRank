import { KITS } from './teams';

// Tema visual: modo (auto/claro/oscuro) y paleta. Se guarda en este dispositivo.
// index.html lo aplica antes de cargar la app (sin parpadeo) leyendo la misma clave.
export type Mode = 'auto' | 'light' | 'dark';
export type Palette = 'cancha' | 'noche' | 'pasion' | 'violeta' | 'dorado' | 'celeste' | 'club';
export interface Theme { mode: Mode; palette: Palette; club?: ClubVars | null; boot?: Boot }
interface ClubVars { c: string; fg: string; d: string; dfg: string; soft?: string; dsoft?: string }
/** Lo que index.html aplica antes de cargar la app: atributos y variables ya resueltos (sin lógica duplicada). */
interface Boot { theme: string | null; palette: string | null; vars: Record<string, string> }

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
/** Contraste WCAG entre dos colores (1 a 21). */
const lin = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const rl = (hex: string) => { const [r, g, b] = rgb(hex).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a: string, b: string) => { const [x, y] = [rl(a), rl(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const fgFor = (hex: string) => (contrast(hex, '#111111') >= contrast(hex, '#ffffff') ? '#111111' : '#ffffff');
// Fondos/superficies de la paleta base (cancha), sobre los que se usa el color del club.
const BG_LIGHT = '#f1f6f2', BG_DARK = '#0e1712', SURF_LIGHT = '#fbfdfb', SURF_DARK = '#15211a';

/** Acento a partir de los colores del club: el primero que no sea casi blanco (si no, el color de la sigla). */
export function clubVars(team: string | null | undefined): ClubVars | null {
  const k = team ? KITS[team] : undefined;
  if (!k) return null;
  let c = [...k.c, k.t].find(x => lum(x) < 0.85) ?? '#1f8a4c';
  // Se usa como color de texto/links: oscurecer hasta que se lea sobre el fondo claro (contraste 4.5:1)
  for (let i = 0; i < 20 && contrast(c, BG_LIGHT) < 4.5; i++) c = mix(c, 0, 0.12);
  let d = c;
  // En oscuro, aclarar hasta que resalte sobre el fondo oscuro
  for (let i = 0; i < 20 && (lum(d) < 0.55 || contrast(d, BG_DARK) < 4.5); i++) d = mix(d, 255, 0.2);
  // Versión suave ya mezclada (sin color-mix, que no anda en navegadores viejos)
  return { c, fg: fgFor(c), d, dfg: fgFor(d), soft: mixWith(c, SURF_LIGHT, 0.82), dsoft: mixWith(d, SURF_DARK, 0.82) };
}

/** Mezcla `a` hacia el color `b` en proporción k (0 = a, 1 = b). */
const mixWith = (a: string, b: string, k: number) => {
  const A = rgb(a), B = rgb(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, '0')).join('');
};

export function loadTheme(): Theme {
  try {
    const t = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (t && typeof t === 'object') return { mode: t.mode ?? 'auto', palette: t.palette ?? 'cancha', club: t.club ?? null, boot: t.boot };
  } catch { /* sin storage */ }
  return { mode: 'auto', palette: 'cancha' };
}

const CLUB_VARS = ['--club', '--club-fg', '--club-d', '--club-d-fg', '--club-soft', '--club-d-soft'];

/** Atributos y variables que corresponden a un tema (una sola fuente: la usa la app y se guarda para index.html). */
export function bootOf(t: Theme): Boot {
  const usesClub = t.palette === 'club' && !!t.club;
  const vars: Record<string, string> = {};
  if (usesClub) {
    const c = t.club!;
    Object.assign(vars, { '--club': c.c, '--club-fg': c.fg, '--club-d': c.d, '--club-d-fg': c.dfg });
    // Temas guardados antes de existir soft/dsoft: se recalculan acá
    vars['--club-soft'] = c.soft ?? mixWith(c.c, SURF_LIGHT, 0.82);
    vars['--club-d-soft'] = c.dsoft ?? mixWith(c.d, SURF_DARK, 0.82);
  }
  return {
    theme: t.mode === 'auto' ? null : t.mode,
    palette: t.palette === 'cancha' || (t.palette === 'club' && !usesClub) ? null : t.palette,
    vars,
  };
}

/** Color de la barra del celular para cada esquema (claro/oscuro), leído del CSS real del tema. */
function syncThemeColor(t: Theme) {
  const el = document.documentElement;
  const prev = el.getAttribute('data-theme');
  const headFor = (scheme: 'light' | 'dark') => {
    el.setAttribute('data-theme', scheme);
    return getComputedStyle(el).getPropertyValue('--head').trim();
  };
  const light = headFor('light'), dark = headFor('dark');
  if (prev) el.setAttribute('data-theme', prev); else el.removeAttribute('data-theme');
  // Con modo forzado, las dos etiquetas llevan el mismo color; en automático cada una el suyo.
  const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  metas.forEach(m => {
    const isDark = (m.media || '').includes('dark');
    m.content = t.mode === 'light' ? light : t.mode === 'dark' ? dark : isDark ? dark : light;
  });
}

export function applyTheme(t: Theme) {
  const el = document.documentElement;
  const b = bootOf(t);
  if (b.theme) el.setAttribute('data-theme', b.theme); else el.removeAttribute('data-theme');
  if (b.palette) el.setAttribute('data-palette', b.palette); else el.removeAttribute('data-palette');
  for (const k of CLUB_VARS) if (b.vars[k]) el.style.setProperty(k, b.vars[k]); else el.style.removeProperty(k);
  syncThemeColor(t);
}

export function saveTheme(t: Theme) {
  const full = { ...t, boot: bootOf(t) };
  try { localStorage.setItem(KEY, JSON.stringify(full)); } catch { /* sin storage: vale para esta sesión */ }
  applyTheme(full);
}
