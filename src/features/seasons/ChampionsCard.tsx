import { useMemo } from 'preact/hooks';
import { displayName } from '../../shared/supabase';
import { Avatar } from '../../shared/ui/Avatar';
import type { Ranked } from '../ranking/ranking';
import {
  AWARD_ICON, AWARD_LABEL, awardValueText, championsBySeason, seasonSpan, type SeasonsData,
} from './model';
import './seasons.css';

const FACES = 5;

/**
 * Vitrina de campeones: cada temporada cerrada con goleador, asistidor, figura, más presente y fair play.
 * Plegada muestra la última temporada con las caras de sus campeones. No dibuja nada si todavía no se cerró ninguna.
 */
export function ChampionsCard({ data, rows, slug }: { data: SeasonsData; rows: Ranked[]; slug: string }) {
  const list = useMemo(() => championsBySeason(data.seasons, data.awards), [data]);
  const people = useMemo(() => new Map(rows.map(r => [r.profile.id, r.profile])), [rows]);
  if (!list.length) return null;

  const latest = list[0];
  const faceIds = [...new Set(latest.champions.flatMap(c => c.winners))].filter(id => people.has(id)).slice(0, FACES);
  const nameOf = (id: string) => { const p = people.get(id); return p ? displayName(p) : 'Ex miembro'; };

  return (
    <details class="card sn-champs">
      <summary>
        <span class="sn-cup" aria-hidden="true">🏆</span>
        <span class="sn-sum">
          <b>Campeones</b>
          <small class="muted ellipsis">{latest.season.name}</small>
        </span>
        <span class="sn-faces" aria-hidden="true">{faceIds.map(id => <Avatar p={people.get(id)!} size={28} />)}</span>
        <span class="sn-chev" aria-hidden="true" />
      </summary>
      {list.map(sc => (
        <section class="sn-season">
          <h4 class="sn-season-h"><span class="ellipsis">{sc.season.name}</span><small class="muted">{seasonSpan(sc.season)}</small></h4>
          {sc.champions.length === 0 && <p class="muted sn-none">No hubo partidos jugados en esas fechas, así que no hubo campeones.</p>}
          {sc.champions.map(c => (
            <div class="sn-aw">
              <span class="sn-ico" aria-hidden="true">{AWARD_ICON[c.kind]}</span>
              <div class="sn-aw-main">
                <div class="sn-aw-label">{AWARD_LABEL[c.kind]}</div>
                <div class="sn-winners">
                  {[...c.winners].sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'es')).map(id => {
                    const p = people.get(id);
                    const who = <><Avatar p={p ?? { name: '?', photo_url: null }} size={28} /><span class="ellipsis">{nameOf(id)}</span></>;
                    return p ? <a class="sn-win" href={`#/c/${slug}/p/${id}`}>{who}</a> : <span class="sn-win">{who}</span>;
                  })}
                </div>
              </div>
              <span class="sn-val muted">{awardValueText(c.kind, c.value)}</span>
            </div>
          ))}
        </section>
      ))}
    </details>
  );
}
