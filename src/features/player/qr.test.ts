import { describe, expect, it } from 'vitest';
import { qrMatrix } from './qr';
import { SHARE_URL, qrGeometry } from './cardLayout';

describe('qrMatrix', () => {
  it('el link de la carta entra en un QR versión 3 (29×29), cuadrado y con los tres cuadros de posición', async () => {
    const m = await qrMatrix(SHARE_URL);
    expect(m).toHaveLength(29);
    expect(m.every(r => r.length === 29)).toBe(true);
    // Cuadro de posición: anillo oscuro de 7×7 con el centro de 3×3 oscuro y un anillo claro en el medio (esquinas sup. izq., sup. der. e inf. izq.)
    for (const [r0, c0] of [[0, 0], [0, 22], [22, 0]]) {
      for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) {
        const ring = i === 0 || i === 6 || j === 0 || j === 6;
        const core = i >= 2 && i <= 4 && j >= 2 && j <= 4;
        expect(m[r0 + i][c0 + j], `${r0 + i},${c0 + j}`).toBe(ring || core);
      }
    }
    // El separador claro de 1 módulo que rodea al cuadro de arriba a la izquierda
    for (let i = 0; i < 8; i++) { expect(m[7][i]).toBe(false); expect(m[i][7]).toBe(false); }
  });
  it('es repetible y cambia con el texto', async () => {
    expect(await qrMatrix(SHARE_URL)).toEqual(await qrMatrix(SHARE_URL));
    expect(await qrMatrix('https://elpartidito.vercel.app/?ref=otro')).not.toEqual(await qrMatrix(SHARE_URL));
  });
  it('con ese tamaño el QR dibujado entra en el bloque de abajo con módulos de píxeles enteros', async () => {
    const g = qrGeometry((await qrMatrix(SHARE_URL)).length, 262);
    expect(g.cell).toBe(7);
    expect(g.size).toBe(259);
  });
});
