// "De potrero a leyenda": el final de la carrera. Primero un momento de cierre (con "Ver resumen" y "Volver a jugar"); después el resumen:
// tu ficha, la Selección, los premios, la vitrina y una tarjeta por cada club donde jugaste.
import { useEffect, useRef } from 'preact/hooks';
import { whatsappUrl } from '../matches/share';
import { awardArt, isTrophyName, trophyArt } from './careerTrophies';
import { AWARD_PTS, TROPHY_PTS } from './careerData';
import { Chips, ClubLogo, CompLogo, Flag, Shirt, TrophyIcon, clubColor } from './CareerVisuals';
import { pl } from './careerBase';
import { cardTier, dailyShareText, legacyBlurb, shareText, tally, totals, type Career, type Legacy, type SeasonLog } from './careerCore';
import { REC_KEYS, REC_LABEL, attemptKey, recordsOf, type AchStats, type RecKey } from './careerAchievements';
import { activeCosmetics } from './careerCosmetics';
import { DIFFS, DPOS_LABEL, FOOTS, fmtMult } from './careerSetup';
import { nationOf } from './careerNations';
import { Seasons } from './CareerSeasons';
import type { Best, RetireWhy } from './careerTypes';
import { fmtEuro } from './careerValue';
import { LEAGUES } from './careerWorld';
import { COMP_LOGO } from './careerLogos';

export const RETIRE_TEXT: Record<RetireWhy, string> = {
  elegido: 'Elegiste colgar los botines en el momento justo.',
  edad: 'Llegaste a los 40: es hora de colgar los botines.',
  fisico: 'El cuerpo dijo basta: ya no te daba para seguir.',
};

/** Al foco del título al cambiar de pantalla (lectores de pantalla y teclado). Una sola vez: si fuera un ref en función nuevo en cada render, cada aviso de logro que aparece o se va le robaría el foco a lo que el jugador estaba tocando. */
function useFocusOnMount() {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => { ref.current?.focus({ preventScroll: true }); }, []);
  return ref;
}

/** De un premio o título al logo de su competencia ("Premier League: goleador" → Premier League). */
const compOf = (name: string): string | null => {
  const base = name.includes(': ') ? name.split(': ')[0] : name.startsWith('Mejor jugador de la ') ? name.slice('Mejor jugador de la '.length) : name;
  return COMP_LOGO[base] ? base : null;
};

/** Una vitrina: cada título o premio con su dibujo, el logo de la competencia, el nombre y cuántas veces lo ganaste. */
export function TrophyShelf({ names, pts, kind }: { names: readonly string[]; pts: Record<string, number>; kind: 'trophy' | 'award' }) {
  const rows = tally(names, pts);
  if (!rows.length) return null;
  return (
    <ul class="cr-shelf">
      {rows.map(([n, k]) => {
        const a = kind === 'trophy' ? trophyArt(n) : awardArt(n), comp = compOf(n);
        return (
          <li class={`cr-trophy ${a.tone}`}>
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

/** Tu vitrina de títulos y premios; con `fold`, plegable (para verla durante la carrera). */
export function Vitrina({ c, fold = false }: { c: Career; fold?: boolean }) {
  const trophies = c.history.flatMap(h => h.trophies), awards = c.history.flatMap(h => h.awards);
  const body = (
    <>
      {trophies.length > 0 && <><h3 class="cr-h3">Títulos</h3><TrophyShelf names={trophies} pts={TROPHY_PTS} kind="trophy" /></>}
      {awards.length > 0 && <><h3 class="cr-h3">Premios</h3><TrophyShelf names={awards} pts={AWARD_PTS} kind="award" /></>}
      {!trophies.length && !awards.length && <p class="muted cr-empty">Todavía no ganaste nada. Hay una vitrina vacía esperando.</p>}
    </>
  );
  if (!fold) return <section class="card cr-vit"><h2 class="cr-h">Vitrina</h2>{body}</section>;
  return (
    <details class="card cr-vit cr-vit-fold">
      <summary><span aria-hidden="true">🏆</span> Vitrina <span class="muted">({pl(trophies.length, 'título', 'títulos')}{awards.length ? ` · ${pl(awards.length, 'premio', 'premios')}` : ''})</span></summary>
      {body}
    </details>
  );
}

// ---------- Etapas en los clubes ----------

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

function ClubCard({ s, keeper }: { s: Stint; keeper: boolean }) {
  const tint = clubColor(s.club), L = LEAGUES[s.lg];
  const t = tally(s.trophies, TROPHY_PTS);
  return (
    <li class="cr-club-card" style={tint ? `--tint:${tint}` : undefined}>
      <div class="cr-cc-top">
        <ClubLogo name={s.club} size={56} />
        <div class="cr-cc-name">
          <b>{s.club}{s.nth > 1 ? <small class="cr-nth"> · {s.nth}.ª etapa</small> : null}</b>
          <span class="muted"><CompLogo name={L.name} size={15} /> {L.name}</span>
          <span class="muted cr-cc-years">{s.from === s.to ? s.from : `${s.from}–${s.to}`} · {pl(s.seasons, 'temporada', 'temporadas')}</span>
        </div>
      </div>
      <dl class="cr-cc-nums">
        <div><dt>PJ</dt><dd>{s.pj}</dd></div>
        <div><dt>G</dt><dd>{s.g}</dd></div>
        <div><dt>A</dt><dd>{s.a}</dd></div>
        {keeper && <div><dt>VI</dt><dd>{s.cs}</dd></div>}
      </dl>
      {t.length > 0 && (
        <ul class="cr-cc-trophies" aria-label="Títulos en este club">
          {t.map(([n, k]) => { const a = trophyArt(n); return <li><TrophyIcon shape={a.shape} tone={a.tone} size={24} /> <span>{n}{k > 1 ? ` ×${k}` : ''}</span></li>; })}
        </ul>
      )}
    </li>
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
    <section class="card cr-nat-card">
      <h2 class="cr-h"><Flag nat={c.nat} size={22} /> {n.team.replace(/^la /, 'La ')}</h2>
      {t.caps === 0 && <p class="muted cr-empty">Nunca te convocaron. Queda para la próxima.</p>}
      {t.caps > 0 && (
        <dl class="cr-cc-nums big">
          <div><dt>Partidos</dt><dd>{t.caps}</dd></div>
          <div><dt>Goles</dt><dd>{t.capGoals}</dd></div>
          <div><dt>Asistencias</dt><dd>{t.capAssists}</dd></div>
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

// ---------- Las dos pantallas ----------

const recText = (k: RecKey, v: number) => (k === 'val' ? fmtEuro(v) : String(v));

/** Los récords personales: los que esta carrera rompió, con "¡Nuevo récord!" y lo que valía el anterior. */
export function RecordsBlock({ c, ach }: { c: Career; ach: AchStats }) {
  const now = recordsOf(c), lr = ach.lastRec && ach.lastRec.seed === attemptKey(c) ? ach.lastRec : null;
  return (
    <section class="card cr-recs" aria-label="Récords">
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

/** El momento de cierre: tu línea final y los caminos (otra carrera en un toque, el resumen o cambiar de jugador). */
export function Closing({ c, l, ach, onSummary, onAgain, onChange }: { c: Career; l: Legacy; ach: AchStats; onSummary: () => void; onAgain: () => void; onChange: () => void }) {
  const ref = useFocusOnMount();
  const cos = activeCosmetics(ach.unlocked);
  const lr = ach.lastRec && ach.lastRec.seed === attemptKey(c) ? ach.lastRec : null;
  return (
    <div class="cr-end">
      <section class={`cr-legacy lv${l.index}`} aria-labelledby="cr-title">
        <span class="cr-hero-grass" aria-hidden="true" />
        <span class="cr-kicker cr-kicker-light">Tu carrera llegó a su fin</span>
        <div class="cr-closing-shirt"><Shirt nat={c.nat} surname={c.surname} num={c.num} size={88} trim={cos.trim} /></div>
        <h1 id="cr-title" ref={ref} tabIndex={-1}>{l.label}</h1>
        <p class="cr-score"><b>{l.score}</b> pts de Legado</p>
        <p class="cr-blurb">{legacyBlurb(l.index)}</p>
        {c.retire && <p class="cr-retire-msg">{RETIRE_TEXT[c.retire]}</p>}
        {lr && lr.ks.length > 0 && <span class="cr-record">📈 ¡Nuevo récord en {lr.ks.map(k => REC_LABEL[k].toLowerCase()).join(', ')}!</span>}
        {c.daily && <span class="cr-record">📆 Desafío del día · {l.score} pts</span>}
      </section>
      <div class="cr-actions cr-actions-end">
        <button type="button" class="btn primary cr-big" onClick={onAgain}>Jugar otra carrera</button>
        <button type="button" class="btn" onClick={onSummary}>Ver resumen</button>
        <button type="button" class="btn sm" onClick={onChange}>Cambiar jugador</button>
      </div>
    </div>
  );
}

/** El resumen completo de la carrera. */
export function Summary({ c, l, best, ach, onAgain, onChange, onAch }: { c: Career; l: Legacy; best: Best | null; ach: AchStats; onAgain: () => void; onChange: () => void; onAch: () => void }) {
  const ref = useFocusOnMount();
  const t = totals(c), n = nationOf(c.nat), keeper = c.pos === 'ARQ' || c.pos === 'DEF';
  const last = c.history[c.history.length - 1];
  const record = !!best && best.seed === c.seed && best.score === l.score;
  const stints = stintsOf(c);
  const awards = c.history.flatMap(h => h.awards);
  const share = () => {
    const url = `${location.origin}/#/juegos/carrera`;
    const text = c.daily ? dailyShareText(c, url) : shareText(c, url);
    if (navigator.share) navigator.share({ text }).catch(() => {});
    else window.open(whatsappUrl(text), '_blank', 'noopener');
  };
  const D = DIFFS[c.diff];
  return (
    <div class="cr-end cr-summary">
      <section class={`cr-legacy cr-sumhead lv${l.index}`} aria-labelledby="cr-title">
        <span class="cr-hero-grass" aria-hidden="true" />
        <div class="cr-sh-shirt"><Shirt nat={c.nat} surname={c.surname} num={c.num} size={96} trim={activeCosmetics(ach.unlocked).trim} /></div>
        <div class="cr-sh-body">
          <span class="cr-kicker cr-kicker-light">{c.surname} #{c.num} · {c.dpos} · <Flag nat={c.nat} size={14} /> {n.name}</span>
          <h1 id="cr-title" ref={ref} tabIndex={-1}>{l.label}</h1>
          <p class="cr-score"><b>{l.score}</b> pts de Legado{l.mult !== 1 && <small> ({l.base} × {fmtMult(l.mult).replace('×', '')} · {D.name})</small>}</p>
          {record && <span class="cr-record">🏅 ¡Es tu mejor carrera ({D.name})!</span>}
          {c.retire && <p class="cr-retire-msg">{RETIRE_TEXT[c.retire]}</p>}
        </div>
      </section>

      <dl class="cr-grid">
        <div><dt>Posición</dt><dd class="cr-dd-sm">{DPOS_LABEL[c.dpos]}</dd></div>
        <div><dt>Pie</dt><dd class="cr-dd-sm">{FOOTS[c.foot].short}</dd></div>
        <div><dt>OVR final</dt><dd class={cardTier(last?.ovr ?? 0)}>{last?.ovr ?? '—'}</dd></div>
        <div><dt>OVR máximo</dt><dd>{t.peak}</dd></div>
        <div><dt>Valor máximo</dt><dd>{fmtEuro(t.peakVal)}</dd></div>
        <div><dt>Valor al retirarte</dt><dd>{fmtEuro(last?.val ?? 0)}</dd></div>
        <div><dt>Partidos</dt><dd>{t.pj}</dd></div>
        <div><dt>Goles</dt><dd>{t.goals}</dd></div>
        <div><dt>Asistencias</dt><dd>{t.assists}</dd></div>
        {keeper && <div><dt>Vallas invictas</dt><dd>{t.cs}</dd></div>}
        <div><dt>Temporadas</dt><dd>{t.seasons}</dd></div>
        <div><dt>Clubes</dt><dd>{t.clubs}</dd></div>
      </dl>

      <div class="cr-two">
        <NationalCard c={c} />
        <section class="card cr-aw-card">
          <h2 class="cr-h">Premios individuales</h2>
          {awards.length ? <TrophyShelf names={awards} pts={AWARD_PTS} kind="award" /> : <p class="muted cr-empty">Ningún premio individual esta vez.</p>}
        </section>
      </div>

      {c.history.some(h => h.trophies.length) && (
        <section class="card cr-vit"><h2 class="cr-h">Vitrina de títulos</h2><TrophyShelf names={c.history.flatMap(h => h.trophies)} pts={TROPHY_PTS} kind="trophy" /></section>
      )}

      <section class="cr-clubs" aria-label="Tus clubes">
        <h2 class="cr-h cr-h-out">Tus clubes</h2>
        <ul class="cr-club-grid">{stints.map(s => <ClubCard s={s} keeper={keeper} />)}</ul>
      </section>

      <RecordsBlock c={c} ach={ach} />

      <div class="cr-actions cr-actions-end">
        <button type="button" class="btn primary cr-big" onClick={onAgain}>Jugar otra carrera</button>
        <button type="button" class="btn" onClick={share}>{c.daily ? 'Compartir el desafío' : 'Compartir mi carrera'}</button>
        <button type="button" class="btn" onClick={onChange}>Cambiar jugador</button>
        <button type="button" class="btn" onClick={onAch}>🏅 Logros</button>
      </div>
      {best && !record && <p class="cr-best-line muted">Tu mejor carrera ({DIFFS[best.d].name}) sigue siendo {best.label} ({best.score} pts, {best.surname}).</p>}

      <section class="cr-tlwrap"><h2 class="cr-h cr-h-out">Tu carrera</h2><Seasons c={c} /></section>
    </div>
  );
}

export { Chips, isTrophyName };
