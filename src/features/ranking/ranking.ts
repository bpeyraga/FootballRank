// Ranking de la comunidad: tipos y cuentas puras. La carga está en ranking/api.ts.
import { ATTRS, ovr, type Profile, type Stats } from '../../shared/model';

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

/** Junta miembros, promedio de votos, autoevaluación y mi voto. Ordena por OVR (los sin votos al final) y nombre. */
export function buildRanking(members: { role: string; profile: Profile }[], ranking: any[], myVotes: any[], base: any[]): Ranked[] {
  const byId = <T extends Record<string, any>>(rows: T[], key: string) => new Map(rows.map(row => [row[key] as string, row]));
  const R = byId(ranking, 'profile_id'), V = byId(myVotes, 'target_id'), B = byId(base, 'profile_id');
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

/** Color de la carta según el OVR. */
export const tier = (o: number | null) => o == null ? 'none' : o >= 75 ? 'gold' : o >= 65 ? 'silver' : 'bronze';
export { ovr };
