// "De potrero a leyenda": el final de la carrera. Una sola pantalla que se va armando sola: tu escalón de Legado con su puntaje, "Jugar otra" bien a mano,
// tus números, tu camino por los clubes con escudos, la vitrina, los titulares de tu carrera y, abajo, todo el detalle.
import { useEffect, useRef } from 'preact/hooks';
import { whatsappUrl } from '../matches/share';
import { awardArt, trophyArt } from './careerTrophies';
import { AWARD_PTS, LEGACY_STEPS, RETIRE_TEXT, TROPHY_PTS } from './careerData';
import { ClubLogo, CompLogo, Flag, Shirt, TrophyIcon, clubColor } from './CareerVisuals';
import { Count, useConfetti } from './CareerMotion';
import { pl } from './careerBase';
import { dailyShareText, legacy, legacyBlurb, shareText, tally, totals, type Career } from './careerCore';
import { REC_KEYS, REC_LABEL, attemptKey, recordsOf, type AchStats, type RecKey } from './careerAchievements';
import { activeCosmetics } from './careerCosmetics';
import { DIFFS, DPOS_LABEL, fmtMult } from './careerSetup';
import { nationOf } from './careerNations';
import { Seasons } from './CareerSeasons';
import { endNear } from './careerStory';
import type { Best, SeasonLog } from './careerTypes';
import { fmtEuro } from './careerValue';
import { LEAGUES } from './careerWorld';
import { COMP_LOGO } from './careerLogos';

/** De un premio o título al logo de su competencia ("Premier League: goleador" → Premier League). */
const compOf = (name: string): string | null => {
  const base = name.includes(': ') ? name.split(': ')[0] : name.startsWith('Mejor jugador de la ') ? name.slice('Mejor jugador de la '.length) : name;
  return COMP_LOGO[base] ? base : null;
};

/** Una vitrina: cada título o premio con su dibujo, el logo de la competencia, el nombre y cuántas veces lo ganaste. Salen de a uno. */
export function TrophyShelf({ names, pts, kind }: { names: readonly string[]; pts: Record<string, number>; kind: 'trophy' | 'award' }) {
  const rows = tally(names, pts);
  if (!rows.length) return null;
  return (
    <ul class="cr-shelf">
      {rows.map(([n, k], i) => {
        const a = kind === 'trophy' ? trophyArt(n) : awardArt(n), comp = compOf(n);
        return (
          <li class={`cr-trophy ${a.tone}`} style={`--i:${Math.min(i, 14)}`}>
            <span class="cr-trophy-art">
              <TrophyIcon shape={a.shape} tone={a.tone} size={54} label={n} />
              {comp && <span class="cr-trophy-logo"><CompLogo name={comp} size={20} /></span>}
              {k > 1 && <span class="cr-trophy-n" aria-label={`${k} veces`}>×{k}</span>}
            </span>
            <b class="cr-trophy-name">{n}</b>
          </li>
        );
      })}
    </ul>
  );
}

// ---------- Tu camino por los clubes ----------

interface Stint { club: string; lg: SeasonLog['lg']; from: number; to: number; seasons: number; pj: number; g: number; a: number; cs: number; trophies: string[]; nth: number }

/** Una etapa por cada tramo seguido en un club; si volvés a un club, es otra etapa ("2.ª etapa"). */
export function stintsOf(c: Career): Stint[] {
  const out: Stint[] = [];
  for (const h of c.history) {
    const y = c.y0 + h.age - 17, last = out[out.length - 1];
    if (last && last.club === h.club) {
      last.to = y; last.seasons++; last.pj += h.pj; last.g += h.goals; last.a += h.assists; last.cs += h.cs; last.trophies.push(...h.trophies);
      if (h.lg !== 'inf') last.lg = h.lg;
    } else out.push({ club: h.club, lg: h.lg, from: y, to: y, seasons: 1, pj: h.pj, g: h.goals, a: h.assists, cs: h.cs, trophies: [...h.trophies], nth: out.filter(s => s.club === h.club).length + 1 });
  }
  return out;
}

/** La línea de tu carrera: un nodo por club, con su escudo, los años y lo que ganaste ahí. Cada uno aparece después del anterior. */
function Path({ c, keeper }: { c: Career; keeper: boolean }) {
  const stints = stintsOf(c);
  return (
    <ol class="cr-path" aria-label="Tus clubes">
      {stints.map((s, i) => {
        const tint = clubColor(s.club), L = LEAGUES[s.lg], t = tally(s.trophies, TROPHY_PTS);
        return (
          <li class="cr-pnode" style={`--i:${Math.min(i, 20)}${tint ? `;--tint:${tint}` : ''}`}>
            <span class="cr-pn-crest"><ClubLogo name={s.club} size={52} /></span>
            <div class="cr-pn-body">
              <b class="cr-pn-name">{s.club}{s.nth > 1 ? <small> · {s.nth}.ª etapa</small> : null}</b>
              <span class="cr-pn-meta"><CompLogo name={L.name} size={13} /> {s.from === s.to ? s.from : `${s.from}–${s.to}`} · {pl(s.seasons, 'temp.', 'temp.')}</span>
              <span class="cr-pn-nums"><b>{s.pj}</b> PJ · <b>{s.g}</b> G{keeper ? <> · <b>{s.cs}</b> VI</> : <> · <b>{s.a}</b> A</>}</span>
              {t.length > 0 && (
                <span class="cr-pn-cups">{t.slice(0, 5).map(([n, k]) => { const a = trophyArt(n); return <span title={n}><TrophyIcon shape={a.shape} tone={a.tone} size={22} />{k > 1 ? <em>×{k}</em> : null}</span>; })}</span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ---------- La Selección ----------

/** De "Mundial · Campeón" a nombre y resultado; agrupa por torneo: cuántos jugó (los que clasificó) y cuántos ganó. */
function tourneys(c: Career): { name: string; played: number; won: number }[] {
  const m = new Map<string, { name: string; played: number; won: number }>();
  for (const h of c.history) for (const t of h.tours) {
    const [name, res = ''] = t.split(' · ');
    if (res === 'No clasificó') continue;
    const e = m.get(name) ?? { name, played: 0, won: 0 };
    e.played++; if (res === 'Campeón') e.won++;
    m.set(name, e);
  }
  return [...m.values()].sort((a, b) => b.won - a.won || b.played - a.played);
}

function NationalCard({ c }: { c: Career }) {
  const t = totals(c), n = nationOf(c.nat), tours = tourneys(c);
  return (
    <section class="cr-card2 cr-nat-card">
      <h2 class="cr-h"><Flag nat={c.nat} size={22} /> {n.team.replace(/^la /, 'La ')}</h2>
      {t.caps === 0 && <p class="muted cr-empty">Nunca te convocaron. Queda para la próxima.</p>}
      {t.caps > 0 && (
        <dl class="cr-cc-nums big">
          <div><dt>Partidos</dt><dd>{t.caps}</dd></div>
          <div><dt>Goles</dt><dd>{t.capGoals}</dd></div>
          <div><dt>Asist.</dt><dd>{t.capAssists}</dd></div>
        </dl>
      )}
      {tours.length > 0 && (
        <ul class="cr-tours" aria-label="Torneos">
          {tours.map(x => (
            <li><CompLogo name={x.name} size={22} /><span><b>{x.name}</b><small class="muted">{pl(x.played, 'vez', 'veces')} · {x.won > 0 ? pl(x.won, 'título', 'títulos') : 'sin título'}</small></span></li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------- Récords y titulares ----------

const recText = (k: RecKey, v: number) => (k === 'val' ? fmtEuro(v) : String(v));

/** Los récords personales: los que esta carrera rompió, con "¡Nuevo récord!" y lo que valía el anterior. */
export function RecordsBlock({ c, ach }: { c: Career; ach: AchStats }) {
  const now = recordsOf(c), lr = ach.lastRec && ach.lastRec.seed === attemptKey(c) ? ach.lastRec : null;
  return (
    <section class="cr-card2 cr-recs" aria-label="Récords">
      <h2 class="cr-h">Récords</h2>
      <ul class="cr-rec-list">
        {REC_KEYS.map(k => {
          const broke = !!lr?.ks.includes(k);
          return (
            <li class={broke ? 'new' : ''}>
              <span class="cr-rec-k">{REC_LABEL[k]}</span>
              <b>{recText(k, ach.rec[k])}</b>
              {broke ? <em>¡Nuevo récord!{lr?.old[k] ? <small> (antes {recText(k, lr.old[k]!)})</small> : null}</em> : <small class="muted">esta carrera: {recText(k, now[k])}</small>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Los tres titulares más grandes de tu carrera, en orden cronológico. */
function bigHeads(c: Career): SeasonLog[] {
  const score = (h: SeasonLog) => h.trophies.length * 4 + h.awards.length * 3 + h.miles.length * 3 + (h.injury === 'grave' ? 2 : 0) + (h.promo ? 2 : 0) + (h.risk ? 1 : 0) + h.goals / 20;
  return c.history.filter(h => h.head).sort((a, b) => score(b) - score(a)).slice(0, 3).sort((a, b) => a.n - b.n);
}

/** La pantalla final de la carrera. */
export function End({ c, ach, best, onAgain, onChange, onAch }: { c: Career; ach: AchStats; best: Best | null; onAgain: () => void; onChange: () => void; onAch: () => void }) {
  const l = legacy(c), t = totals(c), n = nationOf(c.nat), keeper = c.pos === 'ARQ' || c.pos === 'DEF';
  const cos = activeCosmetics(ach.unlocked);
  const lr = ach.lastRec && ach.lastRec.seed === attemptKey(c) ? ach.lastRec : null;
  const last = c.history[c.history.length - 1];
  const record = !!best && best.seed === c.seed && best.score === l.score;
  const near = endNear(l.score, l.index, t.peak, ach.rec.score > l.score ? ach.rec.score : null);
  const cf = useConfetti();
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
    scrollTo({ top: 0 });
    const id = setTimeout(() => { if (l.index >= 2) cf.fire(l.index >= 4 ? 3 : l.index >= 3 ? 2 : 1, { x: 0.5, y: 0.4 }); }, 900);
    return () => clearTimeout(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const share = () => {
    const url = `${location.origin}/#/juegos/carrera`;
    const text = c.daily ? dailyShareText(c, url) : shareText(c, url);
    if (navigator.share) navigator.share({ text }).catch(() => {});
    else window.open(whatsappUrl(text), '_blank', 'noopener');
  };
  const D = DIFFS[c.diff];
  const heads = bigHeads(c);
  const trophies = c.history.flatMap(h => h.trophies), awards = c.history.flatMap(h => h.awards);
  const actions = (
    <div class="cr-actions">
      <button type="button" class="btn primary cr-big cr-again" onClick={onAgain}>Jugar otra carrera <span aria-hidden="true">▶</span></button>
      <button type="button" class="btn cr-share" onClick={share}>📤 {c.daily ? 'Compartir el desafío' : 'Compartir'}</button>
      <button type="button" class="cr-link" onClick={onChange}>Cambiar de jugador</button>
    </div>
  );

  return (
    <div class="cr-end">
      <section class={`cr-fin lv${l.index}`} aria-labelledby="cr-title">
        <canvas class="cr-confetti" ref={cf.ref} aria-hidden="true" />
        <span class="cr-rays" aria-hidden="true" />
        <span class="cr-kicker cr-kicker-light cr-a" style="--d:0s">TU CARRERA TERMINÓ{c.retire ? ` · ${RETIRE_TEXT[c.retire].toUpperCase()}` : ''}</span>
        <div class="cr-fin-shirt cr-drop" style="--d:.1s"><Shirt nat={c.nat} surname={c.surname} num={c.num} size={96} trim={cos.trim} /></div>
        <p class="cr-fin-who cr-a" style="--d:.3s"><Flag nat={c.nat} size={16} /> {c.surname} #{c.num} · {DPOS_LABEL[c.dpos]} · {pl(t.seasons, 'temporada', 'temporadas')}</p>
        <h1 id="cr-title" ref={ref} tabIndex={-1} class="cr-tier cr-stamp2" style="--d:.55s">{l.label}</h1>
        <p class="cr-score cr-a" style="--d:.9s"><Count to={l.score} delay={0.9} dur={1.2} /><span>pts de Legado</span></p>
        <div class="cr-ladder cr-a" style="--d:1s" role="img" aria-label={`Escalón ${l.index + 1} de ${LEGACY_STEPS.length}`}>
          {LEGACY_STEPS.map((_, i) => <i class={i <= l.index ? 'on' : ''} style={`--i:${i}`} />)}
        </div>
        <p class="cr-blurb cr-a" style="--d:1.2s">{legacyBlurb(l.index)}</p>
        {(record || (lr && lr.ks.length > 0) || c.daily || l.mult !== 1) && (
          <p class="cr-rchips cr-a" style="--d:1.35s">
            {record && <span class="cr-record">🏅 ¡Tu mejor carrera!</span>}
            {lr && lr.ks.length > 0 && <span class="cr-record">📈 ¡Récord: {lr.ks.map(k => REC_LABEL[k].toLowerCase()).join(', ')}!</span>}
            {c.daily && <span class="cr-record">📆 Desafío del día</span>}
            {l.mult !== 1 && <span class="cr-record dim">{D.name} {fmtMult(l.mult)}</span>}
          </p>
        )}
        {near && <p class="cr-near cr-a" style="--d:1.5s">😬 {near}</p>}
      </section>

      {actions}

      <dl class="cr-kn">
        <div style="--i:0"><dt>OVR máximo</dt><dd><Count to={t.peak} delay={0.5} dur={0.9} /></dd></div>
        <div style="--i:1"><dt>Títulos</dt><dd><Count to={t.trophies} delay={0.6} dur={0.9} /></dd></div>
        <div style="--i:2"><dt>{keeper ? 'Vallas inv.' : 'Goles'}</dt><dd><Count to={keeper ? t.cs : t.goals} delay={0.7} dur={1} /></dd></div>
        <div style="--i:3"><dt>Partidos</dt><dd><Count to={t.pj} delay={0.8} dur={1} /></dd></div>
        <div style="--i:4"><dt>Premios</dt><dd><Count to={t.awards} delay={0.9} dur={0.8} /></dd></div>
        <div style="--i:5"><dt>Valor máx.</dt><dd class="sm">{fmtEuro(t.peakVal)}</dd></div>
      </dl>

      {heads.length > 0 && (
        <section class="cr-sec2" aria-label="Titulares de tu carrera">
          <h2 class="cr-h2">📰 Titulares de tu carrera</h2>
          <ul class="cr-heads">
            {heads.map((h, i) => <li style={`--i:${i}`}><ClubLogo name={h.club} size={30} /><span><small>{h.age} años · {h.club}</small><b>{h.head}</b></span></li>)}
          </ul>
        </section>
      )}

      <section class="cr-sec2" aria-label="Tus clubes">
        <h2 class="cr-h2">Tu camino</h2>
        <Path c={c} keeper={keeper} />
      </section>

      {(trophies.length > 0 || awards.length > 0) && (
        <section class="cr-sec2 cr-cab" aria-label="Vitrina">
          <h2 class="cr-h2">🏆 Tu vitrina</h2>
          {trophies.length > 0 && <TrophyShelf names={trophies} pts={TROPHY_PTS} kind="trophy" />}
          {awards.length > 0 && <><h3 class="cr-h3">Premios</h3><TrophyShelf names={awards} pts={AWARD_PTS} kind="award" /></>}
        </section>
      )}

      <div class="cr-two">
        {t.caps > 0 || n.team ? <NationalCard c={c} /> : null}
        <RecordsBlock c={c} ach={ach} />
      </div>

      {actions}
      <p class="cr-fin-links"><button type="button" class="cr-link" onClick={onAch}>🏅 Ver mis logros</button>{last ? <span class="muted"> · OVR final {last.ovr}</span> : null}</p>

      <details class="cr-all">
        <summary>📋 Temporada por temporada</summary>
        <Seasons c={c} />
      </details>
    </div>
  );
}
