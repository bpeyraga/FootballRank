import { ATTRS, ovr, sb, type Profile, type Stats } from '../../shared/supabase';

export interface Ranked {
  profile: Profile;
  role: string;
  votes: Stats | null;   // promedio de la comunidad
  nVotes: number;
  base: Stats | null;    // autoevaluación
  mine: Stats | null;    // mi voto
  ovr: number | null;    // de los votos; null si nadie lo votó
}

const pick = (r: any): Stats => Object.fromEntries(ATTRS.map(([k]) => [k, r[k]])) as Stats;

/** Junta miembros, promedio de votos, autoevaluación y mi voto para una comunidad. */
export async function loadRanking(communityId: string, meId: string): Promise<Ranked[]> {
  const [m, r, v] = await Promise.all([
    sb.from('memberships').select('role, profile:profiles(*)').eq('community_id', communityId),
    sb.from('community_ranking').select('*').eq('community_id', communityId),
    sb.from('stat_votes').select('*').eq('community_id', communityId).eq('voter_id', meId),
  ]);
  const err = m.error || r.error || v.error;
  if (err) throw err;
  const members = (m.data ?? []) as any as { role: string; profile: Profile }[];
  const b = await sb.from('base_stats').select('*').in('profile_id', members.map(x => x.profile.id));
  if (b.error) throw b.error;

  const byId = <T extends Record<string, any>>(rows: T[] | null, key: string) =>
    new Map((rows ?? []).map(row => [row[key] as string, row]));
  const R = byId(r.data, 'profile_id'), V = byId(v.data, 'target_id'), B = byId(b.data, 'profile_id');

  return members.map(({ role, profile }) => {
    const rr = R.get(profile.id);
    return {
      profile, role,
      votes: rr ? pick(rr) : null,
      nVotes: rr ? rr.n_votes : 0,
      base: B.has(profile.id) ? pick(B.get(profile.id)) : null,
      mine: V.has(profile.id) ? pick(V.get(profile.id)) : null,
      ovr: rr ? rr.ovr : null,
    };
  }).sort((a, b) => (b.ovr ?? -1) - (a.ovr ?? -1) || a.profile.name.localeCompare(b.profile.name));
}

export const tier = (o: number | null) => o == null ? 'none' : o >= 75 ? 'gold' : o >= 65 ? 'silver' : 'bronze';
export { ovr };
