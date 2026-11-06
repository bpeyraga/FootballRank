// Ranking: la única puerta a la base de esta funcionalidad. Tiran Error con el mensaje del servidor.
import { must, sb, type Profile, type Stats } from '../../shared/supabase';
import { buildRanking, type Ranked } from './ranking';

/** Miembros con su promedio de votos, autoevaluación y mi voto, ordenados por OVR. */
export async function loadRanking(communityId: string, meId: string): Promise<Ranked[]> {
  const [m, r, v] = await Promise.all([
    sb.from('memberships').select('role, profile:profiles(*)').eq('community_id', communityId),
    sb.from('community_ranking').select('*').eq('community_id', communityId),
    sb.from('stat_votes').select('*').eq('community_id', communityId).eq('voter_id', meId),
  ]);
  const members = (must(m) ?? []) as any as { role: string; profile: Profile }[];
  const base = must(await sb.from('base_stats').select('*').in('profile_id', members.map(x => x.profile.id)));
  return buildRanking(members, must(r) ?? [], must(v) ?? [], base ?? []);
}

/** Guarda (o cambia) mi voto a un compañero. */
export async function saveVote(communityId: string, meId: string, targetId: string, stats: Stats) {
  must(await sb.from('stat_votes').upsert({
    community_id: communityId, voter_id: meId, target_id: targetId, ...stats, updated_at: new Date().toISOString(),
  }));
}
