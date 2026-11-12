// Tipos y constantes puros (sin Supabase), para poder usarlos en tests sin variables de entorno.
export const ATTRS = [
  ['rit', 'RIT', 'Ritmo'], ['tir', 'TIR', 'Tiro'], ['pas', 'PAS', 'Pase'],
  ['reg', 'REG', 'Regate'], ['def', 'DEF', 'Defensa'], ['fis', 'FIS', 'Físico'],
] as const;
export type AttrKey = typeof ATTRS[number][0];
/**
 * Los seis atributos y, aparte, `arq`: habilidad como arquero (1-99). Es opcional (null/ausente = sin calificar) y no
 * entra en el OVR; lo usan el armado de equipos y la formación para elegir quién ataja.
 */
export type Stats = Record<AttrKey, number> & { arq?: number | null };
/** Etiquetas del atributo de arquero (va aparte de ATTRS). */
export const GK_ATTR = ['arq', 'ARQ', 'Arquero'] as const;
export const POS = ['ARQ', 'DEF', 'MED', 'DEL'] as const;
export type Pos = typeof POS[number];

export interface Profile {
  id: string; user_id: string | null; name: string; pos: Pos;
  photo_url: string | null; onboarded: boolean;
  nickname: string | null; shirt_number: number | null; fav_team: string | null;
  /** Roles (migración de complejos). Opcionales: sin la migración o en datos de prueba no vienen; ausente = jugador que ya eligió. */
  is_player?: boolean; is_owner?: boolean; role_chosen?: boolean;
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

/**
 * Cuánto pesa cada atributo (en %) según la posición. Cada fila suma 100. El arquero usa el 🧤 (`arq`).
 * La misma tabla está en la función pos_ovr() de la base (migración 20261114000000_ovr_by_position.sql): si se cambia acá, cambiarla allá.
 */
export const POS_WEIGHTS: Record<Pos, Partial<Record<AttrKey | 'arq', number>>> = {
  DEL: { rit: 20, tir: 30, pas: 15, reg: 20, def: 5, fis: 10 },
  MED: { rit: 15, tir: 15, pas: 30, reg: 20, def: 10, fis: 10 },
  DEF: { rit: 15, tir: 5, pas: 15, reg: 5, def: 35, fis: 25 },
  ARQ: { rit: 5, pas: 10, def: 10, fis: 15, arq: 60 },
};

/** Promedio simple de los seis atributos (el OVR de antes; también el del arquero que nadie calificó atajando). */
const plainOvr = (s: Stats) => Math.round(ATTRS.reduce((t, [k]) => t + s[k], 0) / 6);

/**
 * OVR según la posición: cada atributo pesa según POS_WEIGHTS. Para ARQ sin 🧤 calificado, el promedio simple.
 * Sin `pos`, el promedio simple.
 */
export function ovr(s: Stats, pos?: Pos): number {
  if (!pos || (pos === 'ARQ' && s.arq == null)) return plainOvr(s);
  const w = POS_WEIGHTS[pos];
  let t = 0;
  for (const k in w) t += (w[k as AttrKey | 'arq'] ?? 0) * ((k === 'arq' ? s.arq : s[k as AttrKey]) ?? 0);
  return Math.round(t / 100);
}

/** El OVR en cada una de las cuatro posiciones (ARQ: null si nadie lo calificó atajando). */
export const posOvrs = (s: Stats): Record<Pos, number | null> => ({
  ARQ: s.arq == null ? null : ovr(s, 'ARQ'), DEF: ovr(s, 'DEF'), MED: ovr(s, 'MED'), DEL: ovr(s, 'DEL'),
});

/** Tono (0-359) estable a partir de un id, para colores de nombres y escudos. */
export const hue = (id: string) => { let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
