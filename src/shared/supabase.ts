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

// Constantes y tipos viven en model.ts (sin dependencias); se re-exportan acá para no cambiar los imports existentes.
export * from './model';
