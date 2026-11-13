// "De potrero a leyenda": el resultado de la temporada, con suspenso. Los números suben, el OVR se prende en verde o en rojo, los títulos aparecen de a uno
// con papelitos y los hitos (tu debut, tu primer gol, la Selección) ocupan la pantalla un segundo y medio. Se saltea con un toque; una temporada
// tranquila sigue sola a la próxima. Solo transform y opacity, y sin movimiento si el sistema lo pide.
import { useEffect, useRef, useState } from 'preact/hooks';
import { BallIcon, ClubLogo, CompLogo, Flag, Shirt, TrophyIcon } from './CareerVisuals';
import { Count, useConfetti } from './CareerMotion';
import { reducedMotion } from './careerConfetti';
import { cardTier, pl } from './careerBase';
import { AWARD, RETIRE_TEXT } from './careerData';
import { milesShown, type Mile } from './careerStory';
import { awardArt, trophyArt } from './careerTrophies';
import type { Career, SeasonLog } from './careerTypes';
import { fmtEuro } from './careerValue';
import { CONTS, INTL, LEAGUES } from './careerWorld';

/** Qué tan grande es la fiesta: 3 para el Mundial, la Champions, la Libertadores y el Balón de Oro; 2 para cualquier título; 1 para un premio solo. */
export function celebration(h: Pick<SeasonLog, 'trophies' | 'awards'>): 0 | 1 | 2 | 3 {
  const huge = [INTL.worldCup.name, CONTS.cl.name, CONTS.lib.name];
  if (h.awards.includes(AWARD.ballon) || h.trophies.some(t => huge.includes(t))) return 3;
  if (h.trophies.length) return 2;
  return h.awards.length ? 1 : 0;
}

/** Una temporada tranquila sigue sola: sin títulos, premios, lesión, hitos, mudanza ni apuesta. */
export const isQuiet = (h: SeasonLog, moved: boolean): boolean => !h.trophies.length && !h.awards.length && !h.injury && !moved && !h.miles.length && !h.promo && !h.risk;

const MOMENT_MS = 1400;
/** Cuánto tarda en aparecer cada título (segundos). */
const STEP = 0.34;

/** Un hito a pantalla completa: ícono grande, el título, y la hinchada cantando tu apellido. Se va solo o con un toque. */
function Moment({ m, c, onDone }: { m: Mile; c: Career; onDone: () => void }) {
  const cf = useConfetti();
  // Se cierra una sola vez: un doble toque (o un toque justo cuando vence el tiempo) no tiene que saltear también el hito que sigue,
  // y un toque suelto del botón anterior no lo cierra en el primer instante.
  const closed = useRef(false), shownAt = useRef(Date.now());
  const close = () => { if (closed.current) return; closed.current = true; onDone(); };
  useEffect(() => {
    cf.fire(m.big >= 7 ? 3 : 2, { x: 0.5, y: 0.7 });
    const t = setTimeout(close, reducedMotion() ? 900 : MOMENT_MS);
    return () => clearTimeout(t);
  }, [m.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const h = c.history[c.history.length - 1];
  const chant = c.surname;
  return (
    <div class="cr-moment" role="status" onClick={e => { e.stopPropagation(); if (Date.now() - shownAt.current > 350) close(); }}>
      <span class="cr-rays" aria-hidden="true" />
      <canvas class="cr-confetti" ref={cf.ref} aria-hidden="true" />
      <div class="cr-moment-in">
        {m.id === 'debut' || m.id === 'europe' || m.id === 'home' || m.id === 'captain' ? <span class="cr-moment-art"><ClubLogo name={h.club} size={92} /></span>
          : m.id === 'caps1' || m.id === 'wc' ? <span class="cr-moment-art"><Flag nat={c.nat} size={92} /></span>
            : m.id === 'goal1' ? <span class="cr-moment-art cr-moment-ball"><BallIcon size={92} /></span>
              : <span class="cr-moment-ico" aria-hidden="true">{m.icon}</span>}
        <h2 class="cr-moment-t">{m.title}</h2>
        {m.sub && <p class="cr-moment-s">{m.sub}</p>}
        {(m.id === 'debut' || m.id === 'caps1' || m.id === 'goal1') && <span class="cr-moment-shirt"><Shirt nat={c.nat} surname={c.surname} num={c.num} size={84} /></span>}
        <p class="cr-chant" aria-hidden="true">{[0, 1, 2].map(i => <span style={`--d:${0.35 + i * 0.22}s`}>¡{chant}!</span>)}</p>
      </div>
    </div>
  );
}

const tourLine = (t: string) => { const [name, res = ''] = t.split(' · '); return { name, res, won: res === 'Campeón' }; };

/** El resultado de la temporada que se acaba de jugar. `onSettled` avisa cuando terminó el espectáculo (para que la tarjeta del jugador muestre su OVR nuevo). */
export function Reveal({ c, onNext, onSettled }: { c: Career; onNext: () => void; onSettled: () => void }) {
  const h = c.history[c.history.length - 1];
  const prev = c.history[c.history.length - 2];
  const reduced = reducedMotion();
  const keeper = c.pos === 'ARQ' || c.pos === 'DEF';
  const moved = !!prev && prev.club !== h.club;
  const miles = milesShown(c, h);
  const level = celebration(h);
  const quiet = isQuiet(h, moved);
  const [mi, setMi] = useState(0); // qué hito a pantalla completa toca (si ya pasaron todos, sigue el resultado)
  const [skip, setSkip] = useState(false);
  const [done, setDone] = useState(false);
  const cf = useConfetti();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const showMoment = mi < miles.big.length;

  // Los tiempos (en segundos) de cada parte, uno detrás de otro
  let t = 0;
  const T = {} as Record<'gamble' | 'transfer' | 'nums' | 'ovr' | 'trophies' | 'news' | 'end', number>;
  T.gamble = 0; if (h.risk) t += 0.75;
  T.transfer = t; if (moved) t += 0.8;
  T.nums = t; T.ovr = t + 0.3;
  T.trophies = t + 0.85;
  const items = h.trophies.length + h.awards.length;
  t = T.trophies + Math.min(items, 5) * STEP + (items ? 0.1 : -0.35);
  T.news = t; T.end = t + 0.45;

  useEffect(() => {
    if (showMoment) return;
    titleRef.current?.focus({ preventScroll: true });
    scrollTo({ top: 0 });
    if (reduced) { setDone(true); return; }
    const ts: number[] = [];
    ts.push(window.setTimeout(() => setDone(true), T.end * 1000));
    if (level) ts.push(window.setTimeout(() => cf.fire(level === 1 ? 1 : level, { x: 0.5, y: 0.55 }), T.trophies * 1000));
    if (h.risk === 'ok') ts.push(window.setTimeout(() => cf.fire(1, { x: 0.5, y: 0.2 }), 520));
    return () => ts.forEach(clearTimeout);
  }, [showMoment, h.n]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (done) onSettled(); }, [done]); // eslint-disable-line react-hooks/exhaustive-deps

  // Una temporada tranquila pasa sola a la siguiente (con el botón a la vista, por si querés mirarla)
  useEffect(() => {
    if (!done || !quiet || c.retire) return;
    const id = window.setTimeout(onNext, 1700);
    return () => clearTimeout(id);
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps

  const speedUp = () => { if (!done) { setSkip(true); setDone(true); if (level) cf.fire(level === 1 ? 1 : level, { x: 0.5, y: 0.55 }); } };

  const L = LEAGUES[h.lg];
  const d = h.ovr - h.ovr0;
  const failed = /^Se cayó el pase/.test(h.say);
  const stamp = h.risk === 'ok' ? '¡SALIÓ BIEN!' : failed ? 'SE CAYÓ EL PASE' : 'SALIÓ MAL';
  const dly = (s: number) => `--d:${skip ? 0 : s.toFixed(2)}s`;
  const year = c.y0 + h.age - 17;
  const trophyCount = h.trophies.length + h.awards.length;
  const shownTrophies = h.trophies.slice(0, 4), shownAwards = h.awards.slice(0, Math.max(0, 5 - shownTrophies.length));
  const hidden = trophyCount - shownTrophies.length - shownAwards.length;

  return (
    <section class={`cr-rv${skip ? ' cr-skip' : ''}${h.injury ? ' cr-hurt' : ''}${level ? ` cr-win${level}` : ''}`} aria-labelledby="cr-title" onClick={speedUp}>
      <canvas class="cr-confetti" ref={cf.ref} aria-hidden="true" />
      {showMoment && <Moment key={miles.big[mi].id} m={miles.big[mi]} c={c} onDone={() => setMi(i => i + 1)} />}
      {!showMoment && h.risk && <span class={`cr-flash ${h.risk}`} style={dly(0.5)} aria-hidden="true" />}
      {!showMoment && h.injury && <span class="cr-flash bad cr-flash-inj" style={dly(T.nums + 0.1)} aria-hidden="true" />}

      <header class="cr-rv-head cr-a" style={dly(0)}>
        <ClubLogo name={h.club} size={52} />
        <div class="cr-rv-t">
          <small>TEMP. {h.n} · {year} · {h.age} AÑOS</small>
          <h2 id="cr-title" ref={titleRef} tabIndex={-1}>{h.club}</h2>
          <span class="cr-rv-lg"><CompLogo name={L.name} size={15} /> {L.name}{h.fin > 0 ? ` · ${h.fin}.º` : ''}{h.captain ? ' · 🎖️' : ''}</span>
        </div>
        <span class="cr-role">{h.role}</span>
      </header>

      {h.risk && (
        <div class={`cr-gamble ${h.risk}${failed ? ' fail' : ''}`}>
          <span class="cr-dice" aria-hidden="true">🎲</span>
          <div class="cr-gamble-txt">
            <b class="cr-stamp" style={dly(0.5)}>{stamp}</b>
            {h.say && <span class="cr-say cr-a" style={dly(0.62)}>{h.say}</span>}
          </div>
        </div>
      )}

      {moved && (
        <div class="cr-transfer cr-a" style={dly(T.transfer)}>
          <span class="cr-tfrom"><ClubLogo name={prev.club} size={34} /></span>
          <span class="cr-tarrow" aria-hidden="true">›</span>
          <span class="cr-tcrest" style={dly(T.transfer + 0.25)}><ClubLogo name={h.club} size={56} /></span>
          <div class="cr-tinfo"><small>{prev.lg === 'inf' ? 'DEBUT PROFESIONAL' : c.loan ? 'CEDIDO A' : 'NUEVO CLUB'}</small><b>{h.club}</b></div>
        </div>
      )}

      <div class={`cr-rv-nums${keeper ? ' keeper' : ''}`}>
        <div class="cr-num cr-a" style={dly(T.nums)}><Count to={h.pj} delay={skip ? 0 : T.nums + 0.1} dur={0.8} skip={skip} /><small>PARTIDOS</small></div>
        <div class="cr-num goals cr-a" style={dly(T.nums + 0.08)}>
          <Count to={h.goals} delay={skip ? 0 : T.nums + 0.2} dur={Math.min(1.1, 0.5 + h.goals * 0.04)} skip={skip} /><small>GOLES</small>
          {!skip && !reduced && h.goals > 0 && (
            <span class="cr-balls" aria-hidden="true">
              {Array.from({ length: Math.min(h.goals, 9) }, (_, i) => <i style={`--bd:${(T.nums + 0.2 + (i / Math.min(h.goals, 9)) * Math.min(1.1, 0.5 + h.goals * 0.04)).toFixed(2)}s;--bx:${((i * 37) % 60) - 30}px`}><BallIcon size={18} /></i>)}
            </span>
          )}
        </div>
        {keeper
          ? <div class="cr-num cr-a" style={dly(T.nums + 0.16)}><Count to={h.cs} delay={skip ? 0 : T.nums + 0.3} dur={0.8} skip={skip} /><small>{h.cs === 1 ? 'VALLA INVICTA' : 'VALLAS INVICTAS'}</small></div>
          : <div class="cr-num cr-a" style={dly(T.nums + 0.16)}><Count to={h.assists} delay={skip ? 0 : T.nums + 0.3} dur={0.8} skip={skip} /><small>ASISTENCIAS</small></div>}
      </div>

      <div class={`cr-rv-ovr ${d > 0 ? 'up' : d < 0 ? 'down' : 'flat'} cr-a`} style={dly(T.ovr)}>
        <div class={`cr-ovrbadge ${cardTier(h.ovr)}`}>
          <span class="cr-glow" style={dly(T.ovr + 0.9)} aria-hidden="true" />
          <Count from={h.ovr0} to={h.ovr} delay={skip ? 0 : T.ovr + 0.15} dur={0.75} skip={skip} /><small>OVR</small>
        </div>
        <div class="cr-ovr-side">
          <span class="cr-delta" style={dly(T.ovr + 0.8)}>{d > 0 ? `▲ +${d}` : d < 0 ? `▼ −${Math.abs(d)}` : '＝'}</span>
          <span class="cr-ovr-sub">Nota <b class={h.rating >= 7.5 ? 'hi' : h.rating && h.rating < 6.4 ? 'lo' : ''}>{h.pj > 0 ? h.rating.toFixed(1) : '—'}</b> · 💶 <b>{fmtEuro(h.val)}</b></span>
          <span class="cr-marks">
            {h.injury && <span class="cr-mark inj cr-stampin" style={dly(T.nums + 0.15)}>🏥 LESIÓN {h.injury.toUpperCase()}</span>}
            {h.promo === 'up' && <span class="cr-mark up cr-stampin" style={dly(T.nums + 0.3)}>▲ ASCENSO</span>}
            {h.promo === 'down' && <span class="cr-mark down cr-stampin" style={dly(T.nums + 0.3)}>▼ DESCENSO</span>}
          </span>
        </div>
      </div>

      {(h.caps > 0 || h.tours.length > 0) && (
        <p class="cr-rv-nat cr-a" style={dly(T.trophies - 0.1)}>
          <Flag nat={c.nat} size={18} />
          {h.caps > 0 && <b>{pl(h.caps, 'partido', 'partidos')}{h.capGoals ? ` · ${pl(h.capGoals, 'gol', 'goles')}` : ''}</b>}
          {h.tours.slice(0, 2).map(x => { const o = tourLine(x); return <span class={`cr-tour${o.won ? ' won' : ''}`}>{o.won ? '🏆 ' : ''}{o.name}{o.won ? '' : ` · ${o.res}`}</span>; })}
        </p>
      )}

      {trophyCount > 0 && (
        <ul class={`cr-rv-trophies lv${level}`} aria-label="Títulos y premios">
          {shownTrophies.map((n, i) => { const a = trophyArt(n); return (
            <li class="cr-tpop gold" style={dly(T.trophies + i * STEP)}><span class="cr-tshine"><TrophyIcon shape={a.shape} tone={a.tone} size={46} /></span><b>{n}</b></li>
          ); })}
          {shownAwards.map((n, i) => { const a = awardArt(n); return (
            <li class="cr-tpop award" style={dly(T.trophies + (shownTrophies.length + i) * STEP)}><span class="cr-tshine"><TrophyIcon shape={a.shape} tone={a.tone} size={40} /></span><b>{n}</b></li>
          ); })}
          {hidden > 0 && <li class="cr-tpop more" style={dly(T.trophies + 5 * STEP)}><b>+{hidden}</b></li>}
        </ul>
      )}

      <div class="cr-news cr-a" style={dly(T.news)}>
        <span class="cr-news-k">📰 TITULAR</span>
        <p class="cr-news-h">{h.head}</p>
        {h.near && <p class="cr-near">😬 {h.near}</p>}
      </div>

      {miles.small.length > 0 && (
        <ul class="cr-mchips" aria-label="Hitos">{miles.small.map((m, i) => <li class="cr-a" style={dly(T.news + 0.2 + i * 0.12)}><span aria-hidden="true">{m.icon}</span> {m.title.replace(/^¡|!$/g, '')}</li>)}</ul>
      )}

      {c.retire && done && <p class="cr-retire-msg cr-a" style="--d:0s">{RETIRE_TEXT[c.retire]}</p>}

      <div class={`cr-rv-foot${done ? ' ready' : ''}`}>
        {!done
          ? <span class="cr-hint">Tocá para saltear</span>
          : (
            <button type="button" class={`btn primary cr-next${quiet && !c.retire ? ' auto' : ''}`} onClick={e => { e.stopPropagation(); onNext(); }}>
              <span>{c.retire ? 'Ver mi carrera' : `Temporada ${h.n + 1}`}</span><span aria-hidden="true">▶</span>
              {quiet && !c.retire && <i class="cr-auto" aria-hidden="true" />}
            </button>
          )}
      </div>
      <span class="sr" aria-live="polite">{done ? `${h.head}. OVR ${h.ovr0} a ${h.ovr}. ${pl(h.pj, 'partido', 'partidos')}, ${pl(h.goals, 'gol', 'goles')}.` : ''}</span>
    </section>
  );
}
