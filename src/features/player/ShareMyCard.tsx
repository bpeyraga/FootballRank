import { useMemo } from 'preact/hooks';
import { displayName, ovr, type Profile, type Stats } from '../../shared/model';
import { ShareCardBase } from './ShareCardBase';

/**
 * "📤 Compartir mi carta": la carta propia (foto, posición, número, club y las 6 stats de tu autoevaluación) como imagen
 * para historias, con el QR para que otros armen la suya. No dice de qué comunidad es. Sin stats todavía no muestra nada.
 * Es liviano: el dibujo y el QR se bajan con import() recién al preparar la imagen.
 */
export function ShareMyCard({ me, stats }: { me: Profile; stats: Stats | null }) {
  const card = useMemo(() => ({
    name: displayName(me), pos: me.pos, ovr: stats ? ovr(stats, me.pos) : null, stats,
    photoUrl: me.photo_url, favTeam: me.fav_team, shirt: me.shirt_number, summary: [],
  }), [me.name, me.nickname, me.pos, me.photo_url, me.fav_team, me.shirt_number, stats]);
  if (!stats) return null;
  return <ShareCardBase card={card} own label="Compartir mi carta" eager={false} />;
}
