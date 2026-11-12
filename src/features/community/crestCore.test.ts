import { describe, expect, it } from 'vitest';
import {
  CREST_PALETTE, CREST_PATTERNS, CREST_SHAPES, CREST_SYMBOLS, crestDataUrl, crestError, crestSvg, defaultCrest, hslHex, ink,
  isCrestUrl, cleanInitials, cleanRibbon, randomCrest, validateCrest, type CrestDesign,
} from './crestCore';

/** Chequeo mínimo de que el SVG está bien formado: etiquetas balanceadas y comillas de atributos cerradas. */
function wellFormed(svg: string) {
  expect(svg.startsWith('<svg ')).toBe(true);
  expect(svg.endsWith('</svg>')).toBe(true);
  const stack: string[] = [];
  for (const m of svg.matchAll(/<(\/?)([a-zA-Z]+)((?:[^>"]|"[^"]*")*?)(\/?)>/g)) {
    const [, close, tag, , self] = m;
    if (self) continue;
    if (close) expect(stack.pop()).toBe(tag); else stack.push(tag);
  }
  expect(stack).toEqual([]);
  // sin "<" ni comillas sueltas fuera de las etiquetas
  const text = svg.replace(/<[^>]*>/g, '');
  expect(text).not.toMatch(/[<">]/);
}

const base = defaultCrest('Los Pibes', 140);

describe('defaultCrest', () => {
  it('toma las iniciales del nombre y el color del tono', () => {
    const d = defaultCrest('Los Pibes', 140);
    expect(d.initials).toBe('LP');
    expect(d.c1).toMatch(/^#[0-9a-f]{6}$/);
    expect(d.c1).toBe(hslHex(140, 55, 38));
    expect(d.shape).toBe('classic');
    expect(d.stars).toBe(0);
    expect(d.year).toBeNull();
  });
  it('cambia de color con el tono y no se rompe con nombres raros', () => {
    expect(defaultCrest('A', 0).c1).not.toBe(defaultCrest('A', 200).c1);
    expect(defaultCrest('(((', 10).initials).toBe('FC');
    expect(defaultCrest('River (ARG)', 10).initials).toBe('R');
  });
});

describe('hslHex / ink', () => {
  it('convierte colores conocidos', () => {
    expect(hslHex(0, 100, 50)).toBe('#ff0000');
    expect(hslHex(120, 100, 50)).toBe('#00ff00');
    expect(hslHex(240, 100, 50)).toBe('#0000ff');
    expect(hslHex(-120, 100, 50)).toBe('#0000ff');
    expect(hslHex(0, 0, 100)).toBe('#ffffff');
  });
  it('elige tinta clara sobre oscuro y oscura sobre claro', () => {
    expect(ink('#0e2a5c')).toBe('#ffffff');
    expect(ink('#ffffff')).not.toBe('#ffffff');
    expect(ink('#f6c90e')).not.toBe('#ffffff');
  });
});

describe('validateCrest', () => {
  it('acepta un diseño válido tal cual', () => {
    const d: CrestDesign = { v: 1, shape: 'circle', pattern: 'chevron', symbol: 'crown', c1: '#112233', c2: '#aabbcc', c3: '#ff0000', initials: 'AB', ribbon: 'LOS PIBES', year: 2020, stars: 3 };
    expect(validateCrest(d, base)).toEqual(d);
  });
  it('vuelve al fallback con opciones o colores inválidos', () => {
    const d = validateCrest({ shape: 'hexagon', pattern: 7, symbol: null, c1: 'red', c2: 'javascript:alert(1)', c3: 'url(#x)' }, base);
    expect(d.shape).toBe(base.shape);
    expect(d.pattern).toBe(base.pattern);
    expect(d.symbol).toBe(base.symbol);
    expect(d.c1).toBe(base.c1);
    expect(d.c2).toBe(base.c2);
    expect(d.c3).toBe(base.c3);
  });
  it('acota estrellas y año', () => {
    expect(validateCrest({ stars: 99 }, base).stars).toBe(5);
    expect(validateCrest({ stars: -3 }, base).stars).toBe(0);
    expect(validateCrest({ stars: 2.6 }, base).stars).toBe(3);
    expect(validateCrest({ stars: 'x' }, { ...base, stars: 1 }).stars).toBe(1);
    expect(validateCrest({ year: 1700 }, base).year).toBe(1850);
    expect(validateCrest({ year: 5000 }, base).year).toBe(2100);
    expect(validateCrest({ year: 'abc' }, base).year).toBeNull();
    expect(validateCrest({ year: '' }, { ...base, year: 2001 }).year).toBeNull();
    expect(validateCrest({}, { ...base, year: 2001 }).year).toBe(2001);
  });
  it('limpia y acota los textos', () => {
    expect(cleanInitials('abcdefg')).toBe('ABCD');
    expect(cleanInitials('a b-c')).toBe('ABC');
    expect(cleanInitials('ñu')).toBe('ÑU');
    expect(cleanRibbon('  los   pibes  ')).toBe('LOS PIBES');
    expect(cleanRibbon('los pibes ', false)).toBe('LOS PIBES ');
    expect(cleanRibbon('x'.repeat(40)).length).toBe(14);
    expect(cleanRibbon('<b>hola</b>')).toBe('BHOLAB');
    expect(validateCrest({ initials: 'abcdefg', ribbon: 'a'.repeat(30) }, base)).toMatchObject({ initials: 'ABCD', ribbon: 'A'.repeat(14) });
  });
  it('no se rompe con basura', () => {
    for (const x of [null, undefined, 3, 'x', [], () => 1]) {
      expect(validateCrest(x, base)).toEqual(base);
    }
  });
  it('un diseño de la base con cualquier cosa adentro queda válido', () => {
    const d = validateCrest({ shape: 'square', c1: '#ABCDEF', stars: '4', year: '1999', ribbon: 'club' }, base);
    expect(d).toMatchObject({ shape: 'square', c1: '#abcdef', stars: 4, year: 1999, ribbon: 'CLUB' });
  });
});

describe('crestSvg', () => {
  it('da un SVG bien formado y siempre igual para el mismo diseño', () => {
    const a = crestSvg(base), b = crestSvg({ ...base });
    expect(a).toBe(b);
    wellFormed(a);
    expect(a).toContain('viewBox="0 0 200 224"');
    expect(a).toContain(base.c1);
  });
  it('anda con todas las combinaciones de forma, patrón y símbolo', () => {
    for (const shape of CREST_SHAPES) for (const pattern of CREST_PATTERNS) for (const symbol of CREST_SYMBOLS) {
      const svg = crestSvg({ ...base, shape, pattern, symbol, year: 2024, ribbon: 'Club & Co.', stars: 5, c3: '#c9a227' });
      wellFormed(svg);
    }
  });
  it('dibuja cinta, año y estrellas solo cuando están', () => {
    const plain = crestSvg(base);
    expect(plain).not.toContain('<text x="100" y="172');
    const full = crestSvg({ ...base, ribbon: 'LOS PIBES', year: 2020, stars: 3 });
    expect(full).toContain('LOS PIBES');
    expect(full).toContain('2020');
    expect(full.match(/<polygon points="[^"]*" transform="translate/g)?.length).toBe(3);
    expect(plain.match(/transform="translate\([\d. -]+ 15\)"/g)).toBeNull();
  });
  it('el símbolo "Año" necesita año y no lo repite arriba', () => {
    const sin = crestSvg({ ...base, symbol: 'year', year: null });
    expect(sin).not.toContain('<text');
    const con = crestSvg({ ...base, symbol: 'year', year: 2019 });
    expect(con.match(/2019/g)?.length).toBe(1);
  });
  it('las iniciales vacías o "ninguno" no dibujan símbolo', () => {
    expect(crestSvg({ ...base, symbol: 'initials', initials: '' })).not.toContain('<text');
    expect(crestSvg({ ...base, symbol: 'none' })).not.toContain('<text');
    expect(crestSvg(base)).toContain('>LP</text>');
  });
  it('escapa los textos: no se puede inyectar nada', () => {
    const evil = '"><script>alert(1)</script><svg onload=alert(1)>';
    const svg = crestSvg({ ...base, initials: evil, ribbon: evil, c1: evil, c2: evil, c3: evil, shape: evil as any, year: evil as any });
    wellFormed(svg);
    expect(svg).not.toMatch(/<script/i);
    expect(svg).not.toMatch(/onload/i);
    expect(svg.match(/<svg /g)?.length).toBe(1);
    // el "&" de la cinta sale escapado
    expect(crestSvg({ ...base, ribbon: 'A & B' })).toContain('A &amp; B');
    expect(crestSvg({ ...base, ribbon: "O'NEIL" })).toContain('O&apos;NEIL');
  });
  it('el ancho pedido fija el tamaño y respeta la proporción', () => {
    const svg = crestSvg(base, 457);
    expect(svg).toContain('width="457" height="512"');
  });
  it('el texto largo cabe: el largo del texto queda acotado', () => {
    const svg = crestSvg({ ...base, ribbon: 'WWWWWWWWWWWWWW' });
    const len = Number(svg.match(/textLength="([\d.]+)"[^>]*>WWWWWWWWWWWWWW/)?.[1]);
    expect(len).toBeGreaterThan(0);
    expect(len).toBeLessThanOrEqual(151);
  });
  it('la data URL se puede usar en un <img>', () => {
    const url = crestDataUrl(base);
    expect(url.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    expect(decodeURIComponent(url.split(',').slice(1).join(','))).toBe(crestSvg(base));
  });
});

describe('randomCrest', () => {
  const seeded = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  it('da diseños válidos, con colores distintos, y es repetible con la misma semilla', () => {
    for (let s = 1; s <= 60; s++) {
      const d = randomCrest(seeded(s), { ...base, ribbon: 'AMIGOS', stars: 2 });
      expect(validateCrest(d, base)).toEqual(d);
      expect(d.c1).not.toBe(d.c2);
      expect(CREST_PALETTE.some(p => p.hex === d.c1)).toBe(true);
      expect(d.ribbon).toBe('AMIGOS');
      expect(d.stars).toBe(2);
      expect(d.symbol).not.toBe('year');
      wellFormed(crestSvg(d));
    }
    expect(randomCrest(seeded(7), base)).toEqual(randomCrest(seeded(7), base));
  });
  it('con año cargado puede elegir el símbolo "Año"', () => {
    const seen = new Set<string>();
    for (let s = 1; s <= 300; s++) seen.add(randomCrest(seeded(s), { ...base, year: 2020 }).symbol);
    expect(seen.has('year')).toBe(true);
  });
  it('aguanta un azar en los bordes (0 y casi 1)', () => {
    expect(() => randomCrest(() => 0, base)).not.toThrow();
    expect(() => randomCrest(() => 0.999999, base)).not.toThrow();
  });
});

describe('isCrestUrl / crestError', () => {
  const root = 'https://x.supabase.co/storage/v1/object/public/communities/11111111-1111-1111-1111-111111111111';
  it('reconoce el PNG de un escudo diseñado y no la foto subida', () => {
    expect(isCrestUrl(`${root}/crest-3f2a9c1e-1234-4abc-9def-0123456789ab.png`)).toBe(true);
    expect(isCrestUrl(`${root}/crest-3f2a9c1e-1234-4abc-9def-0123456789ab.png?v=2`)).toBe(true);
    expect(isCrestUrl(`${root}/logo-3f2a9c1e-1234-4abc-9def-0123456789ab.jpg`)).toBe(false);
    expect(isCrestUrl(null)).toBe(false);
    expect(isCrestUrl('')).toBe(false);
    expect(isCrestUrl(undefined)).toBe(false);
  });
  it('traduce los errores', () => {
    expect(crestError('bad_crest')).toMatch(/no se pudo guardar/i);
    expect(crestError('forbidden')).toMatch(/permiso/);
    expect(crestError('algo raro')).toBe('algo raro');
  });
});
