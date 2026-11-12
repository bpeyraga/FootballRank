// El CSP de vercel.json solo deja correr los scripts en línea cuya huella (sha256) figura en script-src.
// Si alguien edita el script del tema de index.html o el de public/*.html, este test falla y dice qué huella poner;
// sin él, el navegador bloquearía el script en producción sin avisar a nadie.
import { describe, expect, it } from 'vitest';

const lf = (s: string) => s.replace(/\r\n/g, '\n'); // Vercel compila desde git (LF)
const raw = (files: Record<string, string>) => Object.entries(files).map(([p, s]) => [p, lf(s)] as const);
const PAGES = raw({
  ...import.meta.glob<string>('../index.html', { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob<string>('../public/*.html', { query: '?raw', import: 'default', eager: true }),
});
const VERCEL = import.meta.glob<string>('../vercel.json', { query: '?raw', import: 'default', eager: true })['../vercel.json'];

const csp = (): string => {
  const cfg = JSON.parse(VERCEL) as { headers: { headers: { key: string; value: string }[] }[] };
  const h = cfg.headers.flatMap(x => x.headers).find(x => x.key === 'Content-Security-Policy');
  if (!h) throw new Error('vercel.json sin Content-Security-Policy');
  return h.value;
};
const directive = (name: string) => csp().split(';').map(s => s.trim()).find(s => s.startsWith(name + ' ')) ?? '';

const sha256 = async (s: string) => {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  return `'sha256-${btoa(String.fromCharCode(...d))}'`;
};
/** Scripts en línea ejecutables (sin src y sin type de datos como application/ld+json). */
const inlineScripts = (html: string) =>
  [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)]
    .filter(m => { const t = m[1].match(/type="([^"]+)"/)?.[1]; return !t || t === 'module' || /javascript/.test(t); })
    .map(m => m[2]);

describe('CSP (vercel.json)', () => {
  it('encuentra las páginas', () => {
    expect(PAGES.map(([p]) => p)).toContain('../index.html');
    expect(PAGES.length).toBeGreaterThan(1);
  });

  it.each(PAGES)('autoriza los scripts en línea de %s', async (_page, html) => {
    const allowed = directive('script-src');
    for (const s of inlineScripts(html)) {
      const h = await sha256(s);
      expect(allowed, `agregá ${h} a script-src en vercel.json`).toContain(h);
    }
  });

  it('las páginas estáticas no usan atributos onclick/onload (el CSP los bloquea)', () => {
    for (const [, html] of PAGES) expect(html).not.toMatch(/\son[a-z]+="/);
  });

  it('permite lo que usa la app', () => {
    expect(directive('connect-src')).toContain('https://*.supabase.co');
    expect(directive('connect-src')).toContain('wss://*.supabase.co');
    expect(directive('frame-src')).toContain('https://maps.google.com');
    expect(directive('connect-src')).toContain('https://api.open-meteo.com');
    expect(directive('frame-ancestors')).toBe("frame-ancestors 'none'");
  });
});
