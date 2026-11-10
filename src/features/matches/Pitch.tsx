import { displayName, type Profile } from '../../shared/model';
import { Avatar } from '../../shared/ui/Avatar';
import { Crest } from '../../shared/ui/Crest';
import { tier } from '../ranking/ranking';
import type { Placed } from './formation';
import './pitch.css';

export interface PitchPlayer { id: string; pos: Profile['pos']; ovr: number | null; profile: Profile }

/** Cancha de fútbol 5 con los jugadores ubicados como cartas de formación estilo FIFA. */
export function Pitch({ placed, href, showAlts = false, captainId }: {
  placed: Placed<PitchPlayer>[]; href?: (id: string) => string; showAlts?: boolean; captainId?: string | null;
}) {
  return (
    <div class="pitch" role="img" aria-label={'Formación: ' + placed.map(s => `${s.slot.pos} ${s.p ? displayName(s.p.profile) : 'vacío'}`).join(', ')}>
      <svg class="pitch-lines" viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden="true">
        <rect x="3" y="3" width="94" height="134" rx="1" />
        <line x1="3" y1="70" x2="97" y2="70" />
        <circle cx="50" cy="70" r="12" />
        <circle cx="50" cy="70" r="0.9" class="dot" />
        <path d="M28 3 V19 A22 10 0 0 0 72 19 V3" />
        <path d="M28 137 V121 A22 10 0 0 1 72 121 V137" />
        <circle cx="50" cy="15" r="0.9" class="dot" />
        <circle cx="50" cy="125" r="0.9" class="dot" />
      </svg>
      {placed.map(s => {
        const p = s.p;
        const card = p ? (
          <>
            <span class={`pc-card ${tier(p.ovr)}`}>
              <span class="pc-top"><b>{p.ovr ?? '—'}</b><i>{s.slot.pos}</i></span>
              <Avatar p={p.profile} size={34} zoom={false} />
              {p.profile.shirt_number && <span class="pc-num">#{p.profile.shirt_number}</span>}
              {p.id === captainId && <span class="pc-cap" title="Capitán">C</span>}
            </span>
            <span class="pc-name"><Crest team={p.profile.fav_team} size={8} /><span class="ellipsis">{displayName(p.profile)}</span></span>
          </>
        ) : (
          <>
            <span class="pc-card empty"><span class="pc-top"><i>{s.slot.pos}</i></span><span class="pc-q">?</span></span>
            <span class="pc-name">Vacante</span>
          </>
        );
        return (
          <div class="pc" style={`left:${s.slot.x}%;top:${s.slot.y}%`}>
            {p && href ? <a href={href(p.id)} class="pc-link">{card}</a> : card}
            {showAlts && s.alts.length > 0 && (
              <span class="pc-alts ellipsis" title={s.alts.map(a => displayName(a.profile)).join(', ')}>
                +{s.alts.slice(0, 2).map(a => displayName(a.profile)).join(', ')}{s.alts.length > 2 && ` y ${s.alts.length - 2}`}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
