/** Utilidades de texto compartidas. */

/** Iniciales (máx. 2) para avatares sin foto. Ignora lo que está entre paréntesis ("River (ARG)" → "R"). */
export const initials = (s: string) =>
  s.replace(/\(.*?\)/g, '').trim().split(/\s+/).slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase() || '?';

/** "jue 12 nov, 21:00": fecha y hora cortas de un partido. */
export const fmtDate = (iso: string) => new Date(iso).toLocaleString('es-AR',
  { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
