// Compartir o descargar un archivo de imagen. Sin dependencias: es liviano y va en el chunk principal, así el toque
// en "Compartir" no espera ninguna descarga de código (los navegadores del celular exigen compartir pegado al toque).

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
