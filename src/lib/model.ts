// Tipos y constantes puros (sin Supabase), para poder usarlos en tests sin variables de entorno.
export const ATTRS = [
  ['rit', 'RIT', 'Ritmo'], ['tir', 'TIR', 'Tiro'], ['pas', 'PAS', 'Pase'],
  ['reg', 'REG', 'Regate'], ['def', 'DEF', 'Defensa'], ['fis', 'FIS', 'Físico'],
] as const;
export type AttrKey = typeof ATTRS[number][0];
export type Stats = Record<AttrKey, number>;
export const POS = ['ARQ', 'DEF', 'MED', 'DEL'] as const;
export type Pos = typeof POS[number];

export interface Profile {
  id: string; user_id: string | null; name: string; pos: Pos;
  photo_url: string | null; onboarded: boolean;
  nickname: string | null; shirt_number: number | null; fav_team: string | null;
}

/** Nombre a mostrar: el apodo si tiene, si no el nombre. */
export const displayName = (p: { name: string; nickname?: string | null }) => p.nickname?.trim() || p.name;
/** "DEL · #10" (sin número si no eligió). */
export const posLine = (p: Pick<Profile, 'pos' | 'shirt_number'>) => p.shirt_number ? `${p.pos} · #${p.shirt_number}` : p.pos;

/** "DEL · #10 · River Plate": posición, número y equipo (lo que haya). */
export const infoLine = (p: Pick<Profile, 'pos' | 'shirt_number' | 'fav_team'>) =>
  [p.pos, p.shirt_number ? `#${p.shirt_number}` : null, p.fav_team].filter(Boolean).join(' · ');

/** Cuántos hinchas tiene cada equipo (de más a menos) y cuántos no eligieron. */
export function teamTally(ps: Pick<Profile, 'fav_team'>[]) {
  const m = new Map<string, number>();
  let none = 0;
  for (const p of ps) { const t = p.fav_team?.trim(); if (t) m.set(t, (m.get(t) ?? 0) + 1); else none++; }
  const teams = [...m].map(([team, n]) => ({ team, n })).sort((a, b) => b.n - a.n || a.team.localeCompare(b.team));
  return { teams, none };
}

export const ovr = (s: Stats) => Math.round(ATTRS.reduce((t, [k]) => t + s[k], 0) / 6);

/** Tono (0-359) estable a partir de un id, para colores de nombres y escudos. */
export const hue = (id: string) => { let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
