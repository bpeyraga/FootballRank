// El dibujo de la carta y el QR pesan: tienen que bajarse con import() recién al compartir y no entrar al chunk principal.
// ShareMyCard (lo importa el Inicio) y ShareCardBase solo pueden traer código liviano. Si alguien agrega un import estático
// a cardCanvas, qr o qrcode-generator, este test falla.
import { describe, expect, it } from 'vitest';

const SOURCES = import.meta.glob(['./*.ts', './*.tsx', '!./*.test.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const HEAVY = /(cardCanvas|\/qr$|^\.\/qr|qrcode-generator)/;

/** Imports estáticos y re-exports (los `import type` / `export type` no cuentan: no llegan al bundle). */
const staticImports = (code: string) =>
  [...code.matchAll(/^(?:import|export)\s+(?!type\b)[^;]*?from\s+['"]([^'"]+)['"]/gm)].map(m => m[1]);

describe('compartir carta: código diferido', () => {
  it('detecta imports estáticos pero no los de tipo ni los dinámicos', () => {
    const code = "import a from './x';\nimport type { T } from './cardCanvas';\nimport { b } from './y';\nconst c = import('./cardCanvas');";
    expect(staticImports(code)).toEqual(['./x', './y']);
  });
  it.each(['./ShareCardBase.tsx', './ShareMyCard.tsx', './ShareCard.tsx', './shareFile.ts', './shareText.ts', './cardLayout.ts'])(
    '%s no importa el canvas ni el QR de forma estática', file => {
      expect(SOURCES[file], file).toBeDefined();
      expect(staticImports(SOURCES[file]).filter(s => HEAVY.test(s))).toEqual([]);
    });
  it('ShareCardBase (chunk principal) solo trae shareText y shareFile: la geometría se baja junto con el dibujo', () => {
    expect(staticImports(SOURCES['./ShareCardBase.tsx']).filter(s => s.startsWith('./')).sort())
      .toEqual(['./shareFile', './shareText']);
  });
  it('el canvas se baja con import() desde ShareCardBase', () => {
    expect(SOURCES['./ShareCardBase.tsx']).toMatch(/import\('\.\/cardCanvas'\)/);
  });
  it('qrcode-generator se baja con import() desde qr.ts', () => {
    expect(staticImports(SOURCES['./qr.ts'])).toEqual([]);
    expect(SOURCES['./qr.ts']).toMatch(/import\('qrcode-generator'\)/);
  });
});
