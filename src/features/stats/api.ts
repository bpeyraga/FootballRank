// Estadísticas: acceso a la base. Por ahora, las stats de la casa ("Morfón 90"), que usan el perfil y la pantalla de votar.
// Tiran Error con el mensaje del servidor.
import { must, sb } from '../../shared/supabase';
import type { CustomRow } from './customStats';

const COLS = 'id,label,value,created_by,hidden,code';

/** Las stats de la casa de un jugador, en el orden en que se crearon. */
export async function loadCustom(communityId: string, pid: string): Promise<CustomRow[]> {
  return (must(await sb.from('custom_stats').select(COLS)
    .eq('community_id', communityId).eq('target_id', pid).order('created_at')) ?? []) as CustomRow[];
}

export interface NewCustom { communityId: string; targetId: string; meId: string; label: string; value: number; code?: string | null }
export async function addCustom(v: NewCustom) {
  must(await sb.from('custom_stats').insert({
    community_id: v.communityId, target_id: v.targetId, created_by: v.meId, label: v.label, value: v.value, hidden: false,
    ...(v.code !== undefined ? { code: v.code } : {}),
  }));
}
export async function updateCustom(id: string, patch: Partial<Pick<CustomRow, 'label' | 'value' | 'code' | 'hidden'>>) {
  must(await sb.from('custom_stats').update(patch).eq('id', id));
}
export async function deleteCustom(id: string) {
  must(await sb.from('custom_stats').delete().eq('id', id));
}
