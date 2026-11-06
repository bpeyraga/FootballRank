// Perfil del jugador: acceso a la base de lo propio de esta pantalla (historial de partidos, suspensiones y nombre
// de la comunidad para la tarjeta). Las stats de la casa están en stats/api.ts. Tiran Error con el mensaje del servidor.
import { must, sb } from '../../shared/supabase';
import { playedHistory, type Played, type SuspensionRow } from './model';

/** Partidos jugados en la comunidad, con resultado y la nota promedio que le pusieron sus compañeros. */
export async function loadPlayed(pid: string, communityId: string): Promise<Played[]> {
  const signups = (must(await sb.from('match_signups')
    .select('team, absent, match:matches!inner(id,title,starts_at,status,score_a,score_b,community_id)')
    .eq('profile_id', pid).eq('status', 'in')
    .eq('match.community_id', communityId).eq('match.status', 'played')) ?? []) as any[];
  const ids = signups.map(x => x.match.id);
  const scores = ids.length
    ? (must(await sb.from('match_scores').select('match_id,avg_score,n').eq('profile_id', pid).in('match_id', ids)) ?? []) as any[]
    : [];
  return playedHistory(signups, scores);
}

/** Todas las suspensiones del jugador en la comunidad (activas o no; el filtro está en model.ts). */
export async function loadSuspensions(pid: string, communityId: string): Promise<SuspensionRow[]> {
  return (must(await sb.from('suspensions').select('id, reason, match:matches(title,starts_at,status)')
    .eq('community_id', communityId).eq('profile_id', pid)) ?? []) as unknown as SuspensionRow[];
}

/** Nombre de la comunidad (para la tarjeta para compartir). '' si no se pudo. */
export async function communityName(id: string): Promise<string> {
  const { data } = await sb.from('communities').select('name').eq('id', id).maybeSingle();
  return (data?.name as string | undefined) ?? '';
}
