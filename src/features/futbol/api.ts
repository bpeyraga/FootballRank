// Fútbol argentino: los datos se piden a la Edge Function `futbol` (que cachea 12 min).
import { sb } from '../../shared/supabase';

export type FutKind = 'table' | 'fixtures' | 'news' | 'team';
/** Respuesta de la función: los datos, cuándo se trajeron y si son viejos (la fuente falló y se sirve lo último). */
export interface Reply<T> { data: T; fetched_at: string; stale: boolean }

/** `force`: saltear la caché del servidor. Tira Error si no hay datos. */
export async function fetchFutbol<T>(kind: FutKind, team: string | null, force: boolean): Promise<Reply<T>> {
  const { data, error } = await sb.functions.invoke('futbol', { body: { kind, team, force } });
  if (error || !data || data.error) throw error ?? new Error(String(data?.error ?? 'sin datos'));
  return data as Reply<T>;
}
