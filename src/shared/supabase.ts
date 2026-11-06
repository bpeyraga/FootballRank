import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
if (!url || !key) throw new Error('Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY');

export const sb = createClient(url, key);

/**
 * Para la capa de datos (features/<x>/api.ts): devuelve `data` o tira un Error con el mensaje de Supabase.
 * Las pantallas atrapan el error y lo traducen (cada funcionalidad tiene su traductor de mensajes).
 */
export function must<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data;
}

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

/** Foto grupal: achica a 1600 px del lado más largo (sin recortar) y la sube como JPEG. */
export async function uploadCommunityPhoto(communityId: string, file: File): Promise<string> {
  const img = await createImageBitmap(file);
  const k = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise<Blob>((ok, ko) => c.toBlob(b => (b ? ok(b) : ko(new Error('No se pudo procesar la foto'))), 'image/jpeg', 0.85));
  const path = `${communityId}/${crypto.randomUUID()}.jpg`;
  const { error } = await sb.storage.from('communities').upload(path, blob, { contentType: 'image/jpeg' });
  if (error) throw error;
  return sb.storage.from('communities').getPublicUrl(path).data.publicUrl;
}
