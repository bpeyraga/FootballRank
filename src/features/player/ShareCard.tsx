import { communityName as loadCommunityName } from './api';
import { ShareCardBase, type ShareCardInfo } from './ShareCardBase';

/**
 * Botón "Compartir ficha" del perfil de un jugador dentro de una comunidad. Con `communityName` (o `communityId`, y
 * entonces lo busca) la imagen lleva el nombre de la comunidad; sin ninguno de los dos, no lleva esa línea.
 */
export function ShareCardButton({ card, communityId, communityName, own = false }:
  { card: ShareCardInfo; communityId?: string; communityName?: string; own?: boolean }) {
  return (
    <ShareCardBase card={card} own={own} community={communityName} communityKey={communityId}
      loadCommunity={communityId ? () => loadCommunityName(communityId) : undefined} />
  );
}
