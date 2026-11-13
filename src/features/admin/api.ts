// Panel de la app: la única puerta a la base de esta funcionalidad.
import { sb } from '../../shared/supabase';

/** Números de la app. `forbidden`: quien pregunta no es del equipo de la app. Otros errores tiran Error. */
export async function loadAdminStats(): Promise<{ data: unknown } | { forbidden: true }> {
  const { data, error } = await sb.rpc('admin_stats');
  if (!error) return { data };
  if (error.code === '42501' || /forbidden/i.test(error.message)) return { forbidden: true };
  throw new Error(error.message);
}

/** Un error del navegador para la consola del panel (log_client_error). Nunca tira: si no se puede avisar, se pierde ese aviso y listo. */
export async function logClientError(e: { message: string; stack: string; source: string; path: string; fp: string; version: string; vid: string | null; ua: string }): Promise<void> {
  try {
    await sb.rpc('log_client_error', {
      p_message: e.message, p_stack: e.stack, p_source: e.source, p_path: e.path, p_version: e.version, p_fp: e.fp, p_vid: e.vid, p_ua: e.ua,
    });
  } catch { /* silencioso */ }
}

/** Errores agrupados de los últimos `days` días. `forbidden`: no es del equipo. `missing`: la base todavía no tiene la consola (migración sin aplicar). */
export async function loadAdminErrors(days: number): Promise<{ data: unknown } | { forbidden: true } | { missing: true }> {
  const { data, error } = await sb.rpc('admin_errors', { p_days: days });
  if (!error) return { data };
  if (error.code === '42501' || /forbidden/i.test(error.message)) return { forbidden: true };
  if (error.code === 'PGRST202' || /could not find the function|schema cache/i.test(error.message)) return { missing: true };
  throw new Error(error.message);
}
