import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
if (!url || !key) throw new Error('Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY');

export const sb = createClient(url, key);

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

export async function loadMe(): Promise<Profile | null> {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data, error } = await sb.from('profiles').select('*').eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  return data;
}

/** Recorta al centro y exporta 256×256 JPEG (igual que la app v1). */
export async function cropPhoto(file: File): Promise<Blob> {
  const img = await createImageBitmap(file);
  const s = Math.min(img.width, img.height);
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  c.getContext('2d')!.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 256, 256);
  return new Promise((ok, ko) => c.toBlob(b => (b ? ok(b) : ko(new Error('crop'))), 'image/jpeg', 0.85));
}

export async function uploadPhoto(profileId: string, file: File): Promise<string> {
  const blob = await cropPhoto(file);
  const path = `${profileId}/avatar.jpg`;
  const { error } = await sb.storage.from('avatars').upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
  if (error) throw error;
  return `${sb.storage.from('avatars').getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
}
