// Textos y nombres de archivo de "Compartir carta". Liviano a propósito: lo importa ShareCardBase (chunk principal);
// la geometría y el dibujo (cardLayout, cardCanvas) se cargan recién al armar la imagen.

/** Dominio de la app y link que lleva la imagen (el ?ref=card permite medir cuánta gente llega desde una carta). */
export const SITE = 'elpartidito.vercel.app';
export const SHARE_URL = `https://${SITE}/?ref=card`;

/** "ficha-juan-perez.png": sin tildes ni símbolos. */
export function cardFileName(name: string): string {
  const slug = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `ficha-${slug || 'jugador'}.png`;
}

/** Texto que acompaña a la imagen al compartir: invita a armar la propia carta. */
export function shareMessage(name: string, o: number | null, own: boolean): { title: string; text: string } {
  const ovrPart = o != null ? `: OVR ${o}` : '';
  const who = own ? 'mi carta' : `la carta de ${name}`;
  return {
    title: own ? 'Mi carta en El Partidito' : `${name} en El Partidito`,
    text: `Mirá ${who} en El Partidito${ovrPart}. Armá la tuya: ${SHARE_URL}`,
  };
}
