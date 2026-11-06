import { displayName } from '../../shared/model';
import { Avatar } from '../../shared/ui/Avatar';
import type { Achievement } from '../stats/achievements';
import type { Attendance, Presence } from '../stats/playCore';
import type { DuoRow, Duos } from '../stats/duos';
import { DUO_MIN_GAMES } from '../stats/duos';
import type { Ranked } from '../ranking/ranking';

const fmtShort = (ms: number) => new Date(ms).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }).replace('.', '');

const PRES: Record<Presence, string> = { played: 'Jugó', absent: 'Ausente', missed: 'No se anotó' };
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Logros e insignias: primero los desbloqueados (el más nuevo arriba), después los que faltan con su avance. */
export function AchievementsCard({ list }: { list: Achievement[] | null }) {
  if (!list) return null;
  const got = list.filter(a => a.unlocked).length;
  return (
    <div class="card">
      <div class="row" style="justify-content:space-between;margin-bottom:10px">
        <h3>Logros</h3>
        <span class="muted"><b class="ach-count">{got}</b> de {list.length}</span>
      </div>
      <ul class="ach-grid">
        {list.map(a => (
          <li class={`ach ${a.unlocked ? 'on' : 'off'}`}
            aria-label={`${a.name}: ${a.unlocked ? 'desbloqueado' : `${a.have} de ${a.goal}`}`}>
            <span class="ach-ico" aria-hidden="true">{a.emoji}</span>
            <div class="ach-body">
              <b class="ach-name">{a.name}{a.times != null && <span class="ach-x"> ×{a.times}</span>}</b>
              <span class="ach-desc">{a.desc}</span>
              {a.unlocked
                ? (a.at != null && <span class="ach-meta">{fmtShort(a.at)}</span>)
                : <span class="ach-prog" title={`${a.have} de ${a.goal}`}>
                    <i style={`width:${Math.round((a.have / a.goal) * 100)}%`} />
                    <em>{a.have}/{a.goal}</em>
                  </span>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Presentismo: % de partidos de la comunidad que jugó desde que se sumó, racha y faltas. */
export function PresenceCard({ att, susp }: { att: Attendance | null; susp: { served: number; active: number } | null }) {
  if (!att) return null;
  const suspLine = susp && (susp.served > 0 || susp.active > 0)
    ? [susp.served > 0 ? plural(susp.served, 'suspensión cumplida', 'suspensiones cumplidas') : null,
       susp.active > 0 ? 'una pendiente (ver aviso)' : null].filter(Boolean).join(' · ')
    : '';
  return (
    <div class="card">
      <div class="row" style="justify-content:space-between;margin-bottom:10px">
        <h3>Presentismo</h3>
        {att.pct != null && <b class="pres-pct">{att.pct}%</b>}
      </div>
      {att.total === 0
        ? <p class="muted">Todavía no hay partidos jugados en la comunidad.</p>
        : <>
          <div class="pres-bar" role="img"
            aria-label={`Últimos ${att.recent.length} partidos: ${att.recent.map(p => PRES[p]).join(', ')}`}>
            {att.recent.map(p => <i class={`pres-dot ${p}`} title={PRES[p]} />)}
          </div>
          <p class="muted pres-legend">
            <i class="pres-dot played" /> jugó <i class="pres-dot absent" /> ausente <i class="pres-dot missed" /> no se anotó
            {att.recent.length < att.total && <> · últimos {att.recent.length}</>}
          </p>
          <div class="st-grid c3">
            <div class="st-tile"><b>{att.played}<small>/{att.total}</small></b><span>Jugó</span></div>
            <div class="st-tile"><b>{att.streak}</b><span>{att.streak === 1 ? 'Seguido' : 'Seguidos'}</span></div>
            <div class="st-tile"><b>{att.absences}</b><span>{att.absences === 1 ? 'Falta' : 'Faltas'}</span></div>
          </div>
          <p class="muted st-note">
            Cuenta los partidos jugados de la comunidad desde que se sumó. Una falta es anotarse y no presentarse; bajarse a tiempo no cuenta.
          </p>
          {suspLine && <p class="pres-susp">🚫 {suspLine}</p>}
        </>}
    </div>
  );
}

function DuoList({ rows, byId, slug, hit, none }:
  { rows: DuoRow[]; byId: Map<string, Ranked>; slug: string; hit: 'wins' | 'losses'; none: string }) {
  const list = rows.filter(r => byId.has(r.id));
  if (!list.length) return <p class="muted duo-none">{none}</p>;
  return (
    <div>
      {list.map(r => {
        const p = byId.get(r.id)!.profile;
        return (
          <a class="row rank-row duo-row" href={`#/c/${slug}/p/${r.id}`}>
            <Avatar p={p} size={36} />
            <div style="flex:1;min-width:0">
              <div class="ellipsis">{displayName(p)}</div>
              <div class="muted" style="font-size:.85rem">
                {hit === 'wins' ? plural(r.wins, 'victoria', 'victorias') : plural(r.losses, 'derrota', 'derrotas')} en {plural(r.games, 'partido', 'partidos')}
                {r.draws > 0 && ` · ${plural(r.draws, 'empate', 'empates')}`}
              </div>
            </div>
            <span class={`duo-pct ${hit === 'wins' ? 'good' : 'bad'}`}>{r.pct}%</span>
          </a>
        );
      })}
    </div>
  );
}

/** Con quién gana más y contra quién pierde más (en segunda persona si es tu propio perfil). */
export function DuosCard({ duos, rows, slug, mine }: { duos: Duos | null; rows: Ranked[]; slug: string; mine: boolean }) {
  if (!duos) return null;
  const byId = new Map(rows.map(r => [r.profile.id, r]));
  return (
    <div class="card duos">
      <h3 style="margin-bottom:4px">Duplas</h3>
      <p class="muted st-note" style="margin:0 0 6px">Solo partidos con equipos y resultado, con al menos {DUO_MIN_GAMES} en común.</p>
      <h4 class="duo-h">{mine ? 'Con quién ganás más' : 'Con quién gana más'}</h4>
      <DuoList rows={duos.mates} byId={byId} slug={slug} hit="wins"
        none={`Todavía no hay compañeros con los que ${mine ? 'hayas' : 'haya'} jugado 2 partidos o más y ganado alguno.`} />
      <h4 class="duo-h">{mine ? 'Contra quién perdés más' : 'Contra quién pierde más'}</h4>
      <DuoList rows={duos.rivals} byId={byId} slug={slug} hit="losses"
        none={`Todavía no hay rivales que ${mine ? 'te' : 'le'} hayan ganado en 2 partidos o más.`} />
    </div>
  );
}
