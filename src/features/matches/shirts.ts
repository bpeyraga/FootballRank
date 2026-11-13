// Colores de camiseta de los equipos del partido. Puro (sin Supabase ni Preact).
// La lista de claves tiene que coincidir con el check de la migración 20261115100000_team_shirts.sql.

export interface Shirt { key: string; label: string; color: string }

/** Los colores para elegir (blanco y negro siempre primero) y, al final, "indistinto". */
export const SHIRTS: Shirt[] = [
  { key: 'blanco', label: 'Blanca', color: '#ffffff' },
  { key: 'negro', label: 'Negra', color: '#1d1d1f' },
  { key: 'rojo', label: 'Roja', color: '#d32f2f' },
  { key: 'azul', label: 'Azul', color: '#1e4fd8' },
  { key: 'celeste', label: 'Celeste', color: '#6cb4ee' },
  { key: 'verde', label: 'Verde', color: '#2e8b3e' },
  { key: 'amarillo', label: 'Amarilla', color: '#f6c400' },
  { key: 'naranja', label: 'Naranja', color: '#f57c00' },
  { key: 'violeta', label: 'Violeta', color: '#7b3fb5' },
  { key: 'bordo', label: 'Bordó', color: '#7a1f2b' },
  { key: 'gris', label: 'Gris', color: '#8a8f98' },
  { key: 'rosa', label: 'Rosa', color: '#e85d9a' },
];
export const ANY_SHIRT = 'any';

/** El color de una clave (undefined si no hay o es "indistinto"). */
export const shirtOf = (key: string | null | undefined): Shirt | undefined => SHIRTS.find(s => s.key === key);

/** "Camiseta blanca", "Color indistinto" o "Sin elegir". */
export function shirtLabel(key: string | null | undefined): string {
  if (key === ANY_SHIRT) return 'Color indistinto';
  const s = shirtOf(key);
  return s ? `Camiseta ${s.label.toLowerCase()}` : 'Sin elegir';
}

/** ¿Los dos equipos eligieron el mismo color? ("indistinto" no choca con nada). */
export const shirtsClash = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a !== ANY_SHIRT && a === b;
