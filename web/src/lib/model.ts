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
}

export const ovr = (s: Stats) => Math.round(ATTRS.reduce((t, [k]) => t + s[k], 0) / 6);
