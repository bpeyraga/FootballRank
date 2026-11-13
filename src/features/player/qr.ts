// Matriz de módulos de un código QR. La librería se baja recién al armar la imagen (import dinámico): no entra al chunk principal.

/** `true` = módulo oscuro. Corrección de errores M (15 %); la versión (tamaño) se elige sola según el largo del texto. */
export async function qrMatrix(text: string): Promise<boolean[][]> {
  const mod: any = await import('qrcode-generator');
  const make = mod.default ?? mod;
  const qr = make(0, 'M');
  qr.addData(text);
  qr.make();
  const n: number = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => !!qr.isDark(r, c)));
}
