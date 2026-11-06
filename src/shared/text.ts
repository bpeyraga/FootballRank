/** Utilidades de texto compartidas. */

/** Iniciales (máx. 2) para avatares sin foto. Ignora lo que está entre paréntesis ("River (ARG)" → "R"). */
export const initials = (s: string) =>
  s.replace(/\(.*?\)/g, '').trim().split(/\s+/).slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase() || '?';
