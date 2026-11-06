// Panel de la app: la única puerta a la base de esta funcionalidad.
import { sb } from '../../shared/supabase';

/** Números de la app. `forbidden`: quien pregunta no es del equipo de la app. Otros errores tiran Error. */
export async function loadAdminStats(): Promise<{ data: unknown } | { forbidden: true }> {
  const { data, error } = await sb.rpc('admin_stats');
  if (!error) return { data };
  if (error.code === '42501' || /forbidden/i.test(error.message)) return { forbidden: true };
  throw new Error(error.message);
}
