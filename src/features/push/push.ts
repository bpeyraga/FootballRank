import { deletePush, loadPushKinds, savePush, sendTestPush } from './api';

/** Clave pública VAPID (es pública a propósito; la privada está solo en los secretos de Supabase). */
const VAPID = 'BEvKobO6rMvQwL3lvd_QGwdYh-QrHyZT-jhsMv0LXCywqkwZszKeodqqCa-vVi3xLkls5H1oLV0ltCS6r5j1q1Q';

export type PushKind = 'match' | 'reminder' | 'teams' | 'chat' | 'weekly';
export const PUSH_KINDS: [PushKind, string][] = [
  ['match', 'Partidos (nuevos, cambios de horario o lugar, faltan jugadores)'],
  ['reminder', 'Recordatorios (hoy jugás, 1 h antes, figura, pagos)'], ['teams', 'Equipos armados'], ['chat', 'Mensajes del chat'],
  ['weekly', 'Resumen semanal (lunes)'],
];

export type PushStatus = 'unsupported' | 'ios-install' | 'denied' | 'off' | 'on';

const ua = navigator.userAgent;
const ios = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
const standalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const key = () => {
  const b = atob(VAPID.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(b, c => c.charCodeAt(0));
};
/** Registro del service worker ya activo (subscribe falla si todavía se está instalando). */
const reg = async () => {
  if (!(await navigator.serviceWorker.getRegistration())) await navigator.serviceWorker.register('/sw.js');
  return navigator.serviceWorker.ready;
};
const current = async () => (supported() ? (await reg()).pushManager.getSubscription() : null);

/** Este dispositivo tiene los avisos prendidos (lo eligió la persona): si el navegador pierde la suscripción, se rehace sola. */
const FLAG = 'fr-push-on';
const flag = (on?: boolean) => {
  try {
    if (on === undefined) return localStorage.getItem(FLAG) === '1';
    if (on) localStorage.setItem(FLAG, '1'); else localStorage.removeItem(FLAG);
  } catch { /* sin storage */ }
  return !!on;
};
const subscribe = async (r: ServiceWorkerRegistration) =>
  (await r.pushManager.getSubscription()) ?? (await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key() }));

const save = (s: PushSubscription, kinds?: PushKind[]) => {
  const j = s.toJSON();
  return savePush(s.endpoint, j.keys!.p256dh, j.keys!.auth, kinds ?? null);
};

export async function pushStatus(): Promise<PushStatus> {
  // En iPhone los avisos solo existen con la app instalada en la pantalla de inicio.
  if (ios && !standalone()) return 'ios-install';
  if (!supported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return (await current()) ? 'on' : 'off';
}

/** Pide permiso, suscribe este celular y manda un aviso de prueba. Devuelve un error legible o ''. */
export async function pushOn(): Promise<string> {
  if (await Notification.requestPermission() !== 'granted')
    return 'No diste permiso. Habilitalo en los ajustes del navegador para esta página.';
  try {
    const s = await subscribe(await reg());
    if (!(await save(s).then(() => true, () => false))) return 'No se pudo guardar. Probá de nuevo.';
    flag(true);
    // El aviso de prueba puede tardar si el servidor arranca en frío: no se espera más de 10 s.
    const sent = await Promise.race([sendTestPush(), new Promise<null>(ok => setTimeout(() => ok(null), 10_000))]);
    if (sent === 0) return 'Quedaron activados, pero el aviso de prueba no salió. Revisá que el navegador y el celular tengan permitidas las notificaciones.';
    return '';
  } catch {
    return 'Este navegador no dejó activar los avisos.';
  }
}

export async function pushOff() {
  flag(false);
  const s = await current().catch(() => null);
  if (!s) return;
  await deletePush(s.endpoint);
  await s.unsubscribe().catch(() => {});
}

/** Qué avisos tiene este celular. */
export async function pushKinds(): Promise<PushKind[]> {
  const s = await current();
  if (!s) return [];
  return ((await loadPushKinds(s.endpoint)) as PushKind[] | null) ?? PUSH_KINDS.map(k => k[0]);
}

export async function setPushKinds(kinds: PushKind[]) {
  const s = await current();
  if (s) await save(s, kinds);
}

/**
 * Al abrir la app: si este celular ya tenía avisos (o los tenía prendidos y el navegador perdió la suscripción), vuelve a guardar la suscripción a nombre de quien
 * está logueado (las suscripciones cambian solas y pueden perderse al unir perfiles).
 */
export async function pushSync() {
  try {
    if (!supported() || Notification.permission !== 'granted') return;
    const s = await current();
    if (s) { await save(s); flag(true); } // (también marca los celulares que activaron los avisos antes de que existiera la marca)
    // El navegador la perdió o la cambió (pasa en Android y al limpiar datos): si los avisos estaban prendidos, se rehace.
    else if (flag()) await save(await subscribe(await reg()));
  } catch { /* sin avisos */ }
}

/** Al cerrarse la sesión sin pasar por "Cerrar sesión" (vencida, revocada): este celular deja de recibir avisos.
 *  La fila en la base se limpia sola en el próximo envío (el servicio de push responde 410). */
export async function pushForget() {
  flag(false); // si no, el próximo en entrar a este celular (otra persona, incluso) quedaría suscripto sin haberlo pedido
  try {
    if (!supported()) return;
    const r = await navigator.serviceWorker.getRegistration();
    const s = await r?.pushManager.getSubscription();
    await s?.unsubscribe();
  } catch { /* nada */ }
}
