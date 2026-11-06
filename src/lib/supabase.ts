import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
if (!url || !key) throw new Error('Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY');

export const sb = createClient(url, key);

// Constantes y tipos viven en model.ts (sin dependencias); se re-exportan acá para no cambiar los imports existentes.
export * from './model';
import type { Profile } from './model';

export async function loadMe(): Promise<Profile | null> {
  // getSession lee la sesión guardada (sin ir a la red): un corte de conexión no te "desloguea".
  const { data: { session } } = await sb.auth.getSession();
  const user = session?.user;
  if (!user) return null;
  const { data, error } = await sb.from('profiles').select('*').eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  // Con sesión pero sin perfil (usuario creado antes del trigger): no mostrar el login en loop.
  if (!data) throw new Error('No encontramos tu perfil de jugador. Salí y volvé a entrar; si sigue pasando, avisale al admin.');
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
