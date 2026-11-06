// Regla de capas: solo los api.ts de cada funcionalidad hablan con Supabase. Pantallas, hooks y lógica usan esas funciones.
// Excepciones: shared/supabase.ts (el cliente) y app/track.ts (métricas de uso, arrancan antes que todo).
import { describe, expect, it } from 'vitest';

const SOURCES = import.meta.glob(['./**/*.ts', './**/*.tsx', '!./**/*.test.ts', '!./**/*.test.tsx'],
  { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const ALLOWED = new Set(['./shared/supabase.ts', './app/track.ts']);
const USES_SB = /\bsb\s*[.(]|import\s*\{[^}]*\bsb\b[^}]*\}\s*from/;

describe('arquitectura', () => {
  it('revisa todo el código', () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(80);
    expect(USES_SB.test(SOURCES['./shared/supabase.ts'] + "\nimport { sb } from 'x'")).toBe(true);
  });
  it('solo los api.ts usan el cliente de Supabase', () => {
    const offenders = Object.entries(SOURCES)
      .filter(([path]) => !path.endsWith('/api.ts') && !ALLOWED.has(path))
      .filter(([, code]) => USES_SB.test(code))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});
