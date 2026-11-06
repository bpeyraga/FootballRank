import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
if (!url || !key) throw new Error('Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY');

export const sb = createClient(url, key);

/**
 * Para la capa de datos (features/<x>/api.ts): devuelve `data` o tira un Error con el mensaje de Supabase.
 * Las pantallas atrapan el error y lo traducen (cada funcionalidad tiene su traductor de mensajes).
 */
export function must<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data;
}

/** Tope de filas por request de PostgREST. */
const PAGE = 1000;
/** Trae todas las páginas de una consulta (el orden tiene que ser estable). */
export async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const data = must(await page(from, from + PAGE - 1));
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

// Constantes y tipos viven en model.ts (sin dependencias); se re-exportan acá para no cambiar los imports existentes.
export * from './model';
