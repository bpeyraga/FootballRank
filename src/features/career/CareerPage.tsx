import { useEffect, useRef, useState } from 'preact/hooks';
import './career.css';
import { ATTRS, type Profile } from '../../shared/model';
import { AchScreen, AchToast } from './CareerAch';
import { End } from './CareerEnd';
import { Reveal } from './CareerReveal';
import { Seasons } from './CareerSeasons';
import { Start } from './CareerStart';
import { Chips, ClubLogo, CompLogo, Flag, TrophyIcon } from './CareerVisuals';
import { activeCosmetics, type Active } from './careerCosmetics';
import { ACH_TOTAL, attemptKey, unlockedCount } from './careerAchievements';
import { cardTier, careerOvr, pl } from './careerBase';
import { LEGAL_NOTICE } from './careerData';
import { STAGE_LABEL, stageOf } from './careerEvents';
import { canRetire, currentEvent, potentialStars, totals, type Career } from './careerCore';
import { optionChips, riskOf } from './careerFx';
import { DPOS_LABEL } from './careerSetup';
import { trophyArt } from './careerTrophies';
import type { Opt } from './careerTypes';
import { fmtEuro } from './careerValue';
import { LEAGUES } from './careerWorld';
import { useCareer } from './useCareer';

/** Al cambiar de paso, el foco va al título (para lectores de pantalla y teclado) y se acerca a la vista si quedó lejos. */
function useStepFocus(key: string) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    const top = el.getBoundingClientRect().top;
    if (top < 0 || top > innerHeight * 0.85) el.scrollIntoView({ block: 'center' });
  }, [key]);
  return ref;
}

/**
 * Un doble toque en el botón de la pantalla anterior no tiene que caer en un botón de la que aparece justo después (en el mismo lugar):
 * durante unos instantes desde que se muestra la pantalla, los toques se ignoran. Devuelve `true` si el toque vale.
 */
function useTapGuard(ms = 350) {
  const until = useRef(Date.now() + ms);
  return () => {
    const now = Date.now();
    if (now < until.current) return false;
    until.current = now + ms + 50;
    return true;
  };
}

const year = (c: Career, age = c.age) => c.y0 + age - 17;
/** Mientras se decide la final, esa temporada todavía no se ve (el resultado se sabe después de decidir). */
const shownHistory = (c: Career) => (c.tension ? c.history.slice(0, -1) : c.history);

/** Lo que muestra la tarjeta del jugador mientras la temporada se está contando: el club, la edad y el OVR de antes (no se adelanta el resultado). */
interface Shown { club: string; lg: Career['club']['lg']; ovr: number; age: number }

/** Tu carta: OVR, camiseta, club y tus seis stats. Vertical en la compu y compacta en el celular. */
function PlayerCard({ c, shown, cos }: { c: Career; shown: Shown; cos: Active }) {
  const t = totals({ ...c, history: shownHistory(c) });
  const stars = potentialStars(c.potential);
  const L = LEAGUES[shown.lg];
  return (
    <section class={`cr-pcard ${cardTier(shown.ovr)}`} aria-label="Tu jugador">
      <div class="cr-pc-top">
        <div class={`cr-ovrbadge ${cardTier(shown.ovr)}${cos.frameId ? ` ${cos.frameId}` : ''}`} role="img" aria-label={`OVR ${shown.ovr}`}>
          <b key={shown.ovr} class="cr-tick">{shown.ovr}</b><small>{c.dpos}</small>
        </div>
        <div class="cr-pc-who">
          <b class="ellipsis">{c.surname}</b>
          <span class="ellipsis"><span class="cr-num2">#{c.num}</span> · {DPOS_LABEL[c.dpos]}</span>
          <span class="ellipsis"><Flag nat={c.nat} size={14} /> {shown.age} años</span>
          {shown.age <= 27 && <span class="cr-stars" role="img" aria-label={`Potencial: ${stars} de 5 estrellas`} title="Potencial">{[0, 1, 2, 3, 4].map(i => <i class={i < stars ? 'on' : ''}>★</i>)}</span>}
        </div>
      </div>
      <div class="cr-pc-club">
        <ClubLogo name={shown.club} size={34} />
        <span class="cr-pc-cn"><b class="ellipsis">{c.loan ? `${shown.club} (cedido)` : shown.club}</b><span class="ellipsis"><CompLogo name={L.name} size={13} /> {L.name}</span></span>
      </div>
      <ul class="cr-stats" aria-label="Tus stats">
        {ATTRS.map(([k, code, name]) => {
          const v = Math.round(c.stats[k]);
          return <li title={name}><span>{code}</span><b>{v}</b><i style={`--w:${v}%`} aria-hidden="true" /></li>;
        })}
      </ul>
      <ul class="cr-pc-tot" aria-label="Tu carrera hasta ahora">
        <li title="Títulos"><span aria-hidden="true">🏆</span><b>{t.trophies}</b></li>
        <li title="Goles"><span aria-hidden="true">⚽</span><b>{t.goals}</b></li>
        <li title="Partidos"><span aria-hidden="true">📅</span><b>{t.pj}</b></li>
        <li title="Valor máximo de mercado"><span aria-hidden="true">💶</span><b>{t.peakVal ? fmtEuro(t.peakVal) : '—'}</b></li>
      </ul>
    </section>
  );
}

/** Tu recorrido, de un vistazo: una ficha por temporada con el escudo, tu OVR y los títulos. */
function Strip({ c }: { c: Career }) {
  const rows = shownHistory(c);
  const ref = useRef<HTMLOListElement>(null);
  useEffect(() => { const el = ref.current; if (el) el.scrollLeft = el.scrollWidth; }, [rows.length]);
  if (!rows.length) return null;
  return (
    <section class="cr-strip-w" aria-label="Tu carrera">
      <ol class="cr-strip" ref={ref}>
        {rows.map(h => {
          const a = h.trophies.length ? trophyArt(h.trophies[0]) : null;
          return (
            <li class={h.trophies.length ? 'won' : ''} title={`${year(c, h.age)} · ${h.club} · OVR ${h.ovr}${h.trophies.length ? ` · ${h.trophies.join(', ')}` : ''}`}>
              <small>{h.age}</small>
              <ClubLogo name={h.club} size={26} />
              <b>{h.ovr}</b>
              <span class={`cr-st-cup${a ? '' : ' empty'}`}>{a && <TrophyIcon shape={a.shape} tone={a.tone} size={16} />}{h.trophies.length > 1 ? <em>{h.trophies.length}</em> : null}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// ---------- Una temporada: la decisión ----------

/** Una de las dos opciones: la segura (verde) o la que se la juega (naranja), con su escudo o ícono y lo que ganás y arriesgás. */
function OptionCard({ c, o, state, onPick }: { c: Career; o: Opt; state: '' | 'picked' | 'other'; onPick: () => void }) {
  const [kind, ...rest] = optionChips(c, o);
  const bad = Math.round(riskOf(o).pBad * 100);
  return (
    <button type="button" class={`cr-opt2 ${o.kind}${state ? ` ${state}` : ''}`} onClick={onPick} disabled={state === 'other'}>
      <span class={`cr-ok-tag ${o.kind}`}>{kind.text}</span>
      <span class="cr-ok-art">{o.club ? <ClubLogo name={o.club} size={58} /> : <i aria-hidden="true">{o.icon}</i>}</span>
      <span class="cr-ok-l">{o.label}</span>
      <Chips chips={rest} class="cr-ok-chips" />
      {o.kind === 'risky' && (
        <span class="cr-odds" role="img" aria-label={`${100 - bad} % sale bien, ${bad} % sale mal`}>
          <i class="ok" style={`flex-grow:${100 - bad}`}><b>{100 - bad} %</b></i><i class="bad" style={`flex-grow:${bad}`}><b>{bad} %</b></i>
        </span>
      )}
    </button>
  );
}

function Decide({ c, onPick, onRetire }: { c: Career; onPick: (id: string) => void; onRetire: () => void }) {
  const ev = currentEvent(c)!;
  const ref = useStepFocus(`d${c.history.length}${c.tension ? 't' : ''}`);
  const [sure, setSure] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  // El estado de esta pantalla (la confirmación de retiro, el bloqueo de toques) arranca de cero en cada decisión: ver `key` en CareerScreen
  const tapOk = useTapGuard();
  const t = c.tension;
  const pick = (id: string) => {
    if (picked || !tapOk()) return;
    setPicked(id);
    timer.current = window.setTimeout(() => onPick(id), matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 230);
  };
  // Si te vas (Inicio, "Colgar los botines", "Abandonar") antes de que termine la animación, la elección no se aplica sobre una carrera que ya no es la de esta pantalla
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const stage = stageOf(c);
  return (
    <section class={`cr-dec${t ? ' final' : ''}`} aria-labelledby="cr-title">
      <div class="cr-dkick">
        {t ? <><CompLogo name={t.name} size={20} /><span class="cr-key">MOMENTO CLAVE</span></> : <><span class={`cr-stage ${stage}`}>{STAGE_LABEL[stage].toUpperCase()}</span><span>Temporada {c.history.length + 1} · {year(c)}</span></>}
      </div>
      <h2 id="cr-title" ref={ref} tabIndex={-1}><span class="cr-dic" aria-hidden="true">{ev.icon}</span> {ev.title}</h2>
      <p class="cr-dtext">{ev.text}</p>
      <div class="cr-opts" role="group" aria-label="Elegí uno">
        <OptionCard c={c} o={ev.options[0]} state={picked ? (picked === 'safe' ? 'picked' : 'other') : ''} onPick={() => pick('safe')} />
        <span class="cr-or" aria-hidden="true">o</span>
        <OptionCard c={c} o={ev.options[1]} state={picked ? (picked === 'risky' ? 'picked' : 'other') : ''} onPick={() => pick('risky')} />
      </div>
      {canRetire(c) && (
        <div class="cr-retire">
          {!sure
            ? <button type="button" class="cr-link" onClick={() => setSure(true)}>🧤 Colgar los botines</button>
            : (
              <div class="cr-sure" role="alert">
                <span>¿Te retirás? Tu carrera se cierra acá.</span>
                <button type="button" class="btn sm primary" onClick={onRetire}>Sí, me retiro</button>
                <button type="button" class="btn sm" onClick={() => setSure(false)}>Seguir</button>
              </div>
            )}
        </div>
      )}
    </section>
  );
}

// ---------- La pantalla ----------

/** "De potrero a leyenda": simulador de la carrera de un futbolista. Todo vive en este dispositivo (y es de cada perfil). */
export function CareerPage({ me }: { me: Profile }) {
  // Con `key`, si cambia el perfil se vuelve a cargar lo guardado de ese perfil
  return <CareerScreen key={me.id} me={me} />;
}

function CareerScreen({ me }: { me: Profile }) {
  const g = useCareer(me);
  const [quit, setQuit] = useState(false);
  const [achView, setAchView] = useState(false);
  // Qué temporada de qué carrera ya terminó de mostrarse (con el intento en la clave: al jugar otra carrera, la temporada con el mismo número vuelve a contarse de cero)
  const [settled, setSettled] = useState('');
  const run = g.run;
  const cos = activeCosmetics(g.ach.unlocked);

  const shell = (body: preact.ComponentChildren, cls = '') => (
    <div class={`wrap cr-page ${cls}`}>
      {body}
      <p class="cr-legal">{LEGAL_NOTICE}</p>
      {g.toast.length > 0 && <AchToast ids={g.toast} onDone={g.dismissToast} />}
    </div>
  );

  if (achView) return shell(<><a class="cr-back" href="#/">← Inicio</a><AchScreen ach={g.ach} onBack={() => setAchView(false)} /></>);

  if (!run) {
    return shell(
      <>
        <a class="cr-back" href="#/">← Inicio</a>
        <Start
          me={me} card={g.card} bests={g.bests} achCount={unlockedCount(g.ach)} achTotal={ACH_TOTAL} onStart={g.start} onAch={() => setAchView(true)}
          daily={g.daily} dailyBest={g.ach.dailyBest && g.ach.dailyBest.day === g.today ? g.ach.dailyBest.score : null} streak={g.ach.streak} today={g.today} onDaily={g.startDaily}
        />
      </>,
    );
  }
  if (run.phase === 'over') {
    return shell(<End key="end" c={run} ach={g.ach} best={g.bests[run.diff]} onAgain={g.again} onChange={g.reset} onAch={() => setAchView(true)} />, 'cr-over');
  }

  const last = run.history[run.history.length - 1];
  const stepKey = `${attemptKey(run)}:${last.n}`;
  const reveal = run.phase === 'result' && settled !== stepKey;
  const shown: Shown = reveal || run.tension
    ? { club: last.club, lg: last.lg, ovr: last.ovr0, age: last.age }
    : { club: run.club.name, lg: run.club.lg, ovr: careerOvr(run.stats, run.pos, run.dpos), age: run.age };
  const season = run.phase === 'result' || run.tension ? last.n : run.history.length + 1;

  return shell(
    <>
      <nav class="cr-top"><a class="cr-back" href="#/">← Inicio</a><span class="cr-seasonlbl">Temporada {season} · {year(run, run.phase === 'result' || run.tension ? last.age : run.age)}</span></nav>
      <div class="cr-layout">
        <aside class="cr-side">
          <PlayerCard c={run} shown={shown} cos={cos} />
          <Strip c={run} />
        </aside>
        <main class="cr-main">
          {run.phase === 'decide'
            ? <Decide key={`${run.history.length}${run.tension ? 't' : ''}`} c={run} onPick={g.pick} onRetire={g.retire} />
            : <Reveal key={last.n} c={run} onNext={g.next} onSettled={() => setSettled(stepKey)} />}
        </main>
      </div>
      {run.history.length > 1 && (
        <details class="cr-all">
          <summary>📋 Temporada por temporada ({pl(shownHistory(run).length, 'temporada', 'temporadas')})</summary>
          <Seasons c={{ ...run, history: shownHistory(run) }} limit={6} />
        </details>
      )}
      <div class="cr-quit">
        {!quit
          ? <button type="button" class="cr-link" onClick={() => setQuit(true)}>Abandonar esta carrera</button>
          : (
            <div class="cr-sure" role="alert">
              <span>Se borra esta carrera y arrancás de cero.</span>
              <button type="button" class="btn sm danger" onClick={() => { setQuit(false); g.reset(); }}>Sí, abandonar</button>
              <button type="button" class="btn sm" onClick={() => setQuit(false)}>Seguir</button>
            </div>
          )}
      </div>
    </>,
    'cr-playing',
  );
}
