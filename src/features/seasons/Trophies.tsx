import { useMemo } from 'preact/hooks';
import { AWARD_LABEL, awardValueText, trophiesOf } from './model';
import { useSeasons } from './useSeasons';
import './seasons.css';

/** Trofeos de un jugador ("🏆 Goleador · Apertura 2026"). No dibuja nada si no ganó ninguno (ni si no se pudieron cargar). */
export function PlayerTrophies({ communityId, profileId }: { communityId: string; profileId: string }) {
  const q = useSeasons(communityId);
  const list = useMemo(() => q.data ? trophiesOf(profileId, q.data.seasons, q.data.awards) : [], [q.data, profileId]);
  if (!list.length) return null;
  return (
    <div class="card sn-trophies">
      <h3 style="margin-bottom:10px">Trofeos</h3>
      <ul class="sn-tlist">
        {list.map(t => (
          <li class="sn-tcard">
            <b class="ellipsis"><span aria-hidden="true">🏆</span> {AWARD_LABEL[t.kind]} · {t.season.name}</b>
            <small>{awardValueText(t.kind, t.value)}</small>
          </li>
        ))}
      </ul>
    </div>
  );
}
