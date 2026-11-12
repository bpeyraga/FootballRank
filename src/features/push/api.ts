// Avisos al celular: la parte de la base (las suscripciones y el aviso de prueba). La parte del navegador está en push.ts.
import { must, sb } from '../../shared/supabase';

/** Guarda la suscripción de este dispositivo a nombre de quien está logueado. Sin `kinds`, conserva los que tenía. */
export async function savePush(endpoint: string, p256dh: string, auth: string, kinds: string[] | null) {
  must(await sb.rpc('save_push', { p_endpoint: endpoint, p_p256dh: p256dh, p_auth: auth, p_kinds: kinds }));
}

export async function deletePush(endpoint: string) {
  must(await sb.from('push_subscriptions').delete().eq('endpoint', endpoint));
}

/** Qué avisos tiene esa suscripción (null si no está guardada o no se pudo leer). */
export async function loadPushKinds(endpoint: string): Promise<string[] | null> {
  const { data } = await sb.from('push_subscriptions').select('kinds').eq('endpoint', endpoint).maybeSingle();
  return (data?.kinds as string[] | undefined) ?? null;
}

/** Pide al servidor un aviso de prueba. Devuelve a cuántos dispositivos salió, o null si no se pudo saber (error de red). */
export async function sendTestPush(): Promise<number | null> {
  try {
    const { data, error } = await sb.functions.invoke('push', { body: { type: 'test' } });
    if (error) return null;
    const n = Number((data as { sent?: unknown } | null)?.sent);
    return Number.isFinite(n) ? n : null;
  } catch { return null; }
}
