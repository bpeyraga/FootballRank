import { useEffect, useRef, useState } from 'preact/hooks';
import { ATTRS, type Profile } from '../../shared/model';
import { AchScreen, AchToast } from './CareerAch';
import { Closing, RETIRE_TEXT, Summary, Vitrina } from './CareerEnd';
import { Seasons } from './CareerSeasons';
import { Start } from './CareerStart';
import { Boots, Chips, ClubLogo, CompLogo, CountryFlag, Flag, Shirt, TrophyIcon } from './CareerVisuals';
import { activeCosmetics, type Active } from './careerCosmetics';
import { ACH_TOTAL, unlockedCount } from './careerAchievements';
import { careerOvr } from './careerBase';
import { LEGAL_NOTICE } from './careerData';
import {
  canRetire, cardTier, currentEvent, legacy, potentialStars, seasonTitle,
  type Career,
} from './careerCore';
import { optionChips } from './careerFx';
import { nationOf } from './careerNations';
import { DPOS_LABEL } from './careerSetup';
import { trophyArt } from './careerTrophies';
import { fmtEuro, marketValue } from './careerValue';
import { LEAGUES, strLabel } from './careerWorld';
import { useCareer } from './useCareer';

/** Al cambiar de paso, el foco va al título (para lectores de pantalla y teclado) y se acerca a la vista si quedó lejos. */
function useStepFocus(key: string) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    const top = el.getBoundingClientRect().top;
    if (top < 0 || top > innerHeight * 0.75) el.scrollIntoView({ block: 'center' });
  }, [key]);
  return ref;
}

/**
 * Un doble toque en el botón de la pantalla anterior no tiene que caer en un botón de la que aparece justo después (en el mismo lugar):
 * durante unos instantes desde que se muestra la pantalla, los toques se ignoran. Devuelve `true` si el toque vale.
 */
function useTapGuard(ms = 400) {
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

/** El club donde jugás: escudo, liga, cómo viene y cómo terminó la última temporada, tu OVR, tu valor y tus seis stats. */
function ClubHeader({ c, age, cos }: { c: Career; age: number; cos: Active }) {
  const ovr = careerOvr(c.stats, c.pos, c.dpos);
  const stars = potentialStars(c.potential);
  const last = shownHistory(c)[shownHistory(c).length - 1];
  const L = LEAGUES[c.club.lg];
  const val = last?.val ?? marketValue({ ovr, age, potential: c.potential, lg: c.club.lg, tier: c.club.tier });
  const n = nationOf(c.nat);
  return (
    <section class="cr-bar" aria-label="Tu jugador y tu club">
      <div class="cr-club-row">
        <ClubLogo name={c.club.name} size={46} />
        <div class="cr-club-info">
          <b class="ellipsis cr-club-name">{c.loan ? `${c.club.name} (cedido)` : c.club.name}</b>
          <span class="cr-league"><CompLogo name={L.name} size={16} /><span class="ellipsis">{L.name}</span></span>
          <span class="muted cr-club-meta">
            {strLabel(c.club)}
            {last ? ` · Terminaste ${last.fin}.º${last.lg !== c.club.lg ? ` en ${LEAGUES[last.lg].name}` : ''}` : ''}
          </span>
        </div>
      </div>
      <div class="cr-me">
        <div class={`ovr ${cardTier(ovr)} cr-ovr${cos.frameId ? ` ${cos.frameId}` : ''}`} role="img" aria-label={`OVR ${ovr}`}><b>{ovr}</b><small>OVR</small></div>
        <div class="cr-who">
          <b class="ellipsis">{c.surname} <span class="cr-num">#{c.num}</span></b>
          <span class="muted ellipsis">{c.dpos} · {DPOS_LABEL[c.dpos]}</span>
          <span class="muted ellipsis"><Flag nat={c.nat} size={14} /> {age} años · {year(c, age)} · <b class="cr-val" title="Valor de mercado">{fmtEuro(val)}</b></span>
        </div>
        {age <= 27 && (
          <div class="cr-stars" role="img" aria-label={`Potencial: ${stars} de 5 estrellas`}>
            <span aria-hidden="true">{[0, 1, 2, 3, 4].map(i => <i class={i < stars ? 'on' : ''}>★</i>)}</span><small>Potencial</small>
          </div>
        )}
        <span class="cr-bar-shirt"><Shirt nat={c.nat} surname={c.surname} num={c.num} size={54} trim={cos.trim} />{cos.boots && <Boots color={cos.boots} size={30} />}</span>
      </div>
      <ul class="cr-stats">
        {ATTRS.map(([k, code, name]) => {
          const v = Math.round(c.stats[k]);
          return <li title={name}><span>{code}</span><b>{v}</b><i style={`--w:${v}%`} aria-hidden="true" /></li>;
        })}
      </ul>
    </section>
  );
}

// ---------- Una temporada: la decisión ----------

function Decide({ c, onPick, onRetire }: { c: Career; onPick: (id: string) => void; onRetire: () => void }) {
  const ev = currentEvent(c)!;
  const total = c.picks.length + c.queue.length;
  const ref = useStepFocus(`d${c.history.length}-${c.picks.length}${c.tension ? 't' : ''}`);
  const [sure, setSure] = useState(false);
  // El estado de esta pantalla (la confirmación de retiro, el bloqueo de toques) arranca de cero en cada decisión: ver `key` en CareerScreen
  const tapOk = useTapGuard();
  const pick = (id: string) => { if (tapOk()) onPick(id); };

  return (
    <section class="card cr-card" aria-labelledby="cr-title">
      <div class={`cr-kicker${c.tension ? ' cr-key' : ''}`}>{c.tension ? `⚡ Momento clave · Temporada ${c.history.length}` : `Temporada ${c.history.length + 1} · ${year(c)} · ${c.age} años${total > 1 ? ` · decisión ${c.picks.length + 1} de ${total}` : ''}`}</div>
      <h2 id="cr-title" ref={ref} tabIndex={-1}>{ev.title}</h2>
      <p class="cr-text">{ev.text}</p>
      {c.notes.length > 0 && <ul class="cr-notes" aria-label="Novedades">{c.notes.map(n => <li>{n}</li>)}</ul>}
      <div class="cr-choices" role="group" aria-label="Elegí una opción">
        {ev.options.map(o => {
          const chips = optionChips(c, o), club = o.fx.move?.club;
          return (
            <button type="button" class={`cr-choice${club ? ' offer' : ''}`} onClick={() => pick(o.id)}>
              {club && (
                <span class="cr-offer-head">
                  <ClubLogo name={club.name} size={42} />
                  <span class="cr-offer-t">
                    <b class="ellipsis">{club.name}</b>
                    <span class="cr-league"><CompLogo name={LEAGUES[club.lg].name} size={15} /><span class="ellipsis">{LEAGUES[club.lg].name}</span> <CountryFlag country={LEAGUES[club.lg].country} size={14} /></span>
                  </span>
                </span>
              )}
              <span class="cr-choice-l"><span>{o.label}</span></span>
              <span class="cr-choice-h">{o.hint}</span>
              <Chips chips={chips} />
            </button>
          );
        })}
      </div>
      {canRetire(c) && (
        <div class="cr-retire">
          {!sure
            ? <button type="button" class="btn sm" onClick={() => setSure(true)}>🧤 Colgar los botines</button>
            : (
              <div class="cr-sure" role="alert">
                <span>¿Te retirás ahora? Tu carrera se cierra acá.</span>
                <button type="button" class="btn sm primary" onClick={onRetire}>Sí, me retiro</button>
                <button type="button" class="btn sm" onClick={() => setSure(false)}>Seguir jugando</button>
              </div>
            )}
        </div>
      )}
    </section>
  );
}

// ---------- Una temporada: el resultado ----------

function Result({ c, onNext }: { c: Career; onNext: () => void }) {
  const h = c.history[c.history.length - 1];
  const ref = useStepFocus(`r${h.n}`);
  const tapOk = useTapGuard();
  const d = h.ovr - h.ovr0;
  const keeper = c.pos === 'ARQ' || c.pos === 'DEF';
  const L = LEAGUES[h.lg];
  const prev = c.history[c.history.length - 2];
  const dv = prev ? h.val - prev.val : 0;
  return (
    <section class="card cr-card cr-result" aria-labelledby="cr-title">
      <div class="cr-kicker cr-kick-club">Temporada {h.n} · {c.y0 + h.age - 17} · {h.age} años · <ClubLogo name={h.club} size={18} /> {h.club}</div>
      <h2 id="cr-title" ref={ref} tabIndex={-1}>{seasonTitle(h)}</h2>
      <p class="muted cr-role"><CompLogo name={L.name} size={15} /> {h.role} · {L.name}{h.fin > 0 ? ` (${h.fin}.º)` : ''}{h.cont ? ` · ${h.cont}` : ''}{h.captain ? ' · Capitán' : ''}</p>
      <p class="cr-s-marks">
        {h.injury && <span class="cr-mark inj">LESIÓN</span>}
        {h.promo === 'up' && <span class="cr-mark up">▲ ASCENSO</span>}
        {h.promo === 'down' && <span class="cr-mark down">▼ DESCENSO</span>}
      </p>
      <p class="cr-delta">
        OVR {h.ovr0} → <b>{h.ovr}</b>{' '}
        <span class={d > 0 ? 'up' : d < 0 ? 'down' : ''}>{d > 0 ? `▲ +${d}` : d < 0 ? `▼ −${Math.abs(d)}` : '= igual'}</span>
        <span class="cr-val-line"> · Valor <b>{fmtEuro(h.val)}</b>{dv !== 0 && <span class={dv > 0 ? 'up' : 'down'}> {dv > 0 ? '▲' : '▼'}</span>}</span>
      </p>
      <dl class="cr-nums" style={`--n:${keeper || h.caps > 0 ? 3 : 4}`}>
        <div><dt>Partidos</dt><dd>{h.pj}</dd></div>
        <div><dt>Goles</dt><dd>{h.goals}</dd></div>
        <div><dt>Asist.</dt><dd>{h.assists}</dd></div>
        {keeper && <div><dt>Vallas invictas</dt><dd>{h.cs}</dd></div>}
        <div><dt>Nota</dt><dd>{h.pj > 0 ? h.rating.toFixed(1) : '—'}</dd></div>
        {h.caps > 0 && <div><dt>Selección</dt><dd>{h.caps}{h.capGoals || h.capAssists ? <small> ({h.capGoals}g {h.capAssists}a)</small> : null}</dd></div>}
      </dl>
      {h.tours.length > 0 && <p class="cr-s-nat"><Flag nat={c.nat} size={16} /> {h.tours.join(' · ')}</p>}
      {(h.trophies.length > 0 || h.awards.length > 0) && (
        <ul class="cr-chips" aria-label="Títulos y premios">
          {h.trophies.map(t => { const a = trophyArt(t); return <li class="gold"><TrophyIcon shape={a.shape} tone={a.tone} size={20} /> {t}</li>; })}
          {h.awards.map(a => <li><span aria-hidden="true">⭐</span> {a}</li>)}
        </ul>
      )}
      {h.lines.length > 0 && <ul class="cr-lines">{h.lines.map(l => <li>{l}</li>)}</ul>}
      {h.picks.length > 0 && <p class="cr-picks muted">Elegiste: {h.picks.join(' · ')}</p>}
      {c.retire && <p class="cr-retire-msg">{RETIRE_TEXT[c.retire]}</p>}
      <button type="button" class="btn primary block cr-next" onClick={() => { if (tapOk()) onNext(); }}>{c.retire ? 'Ver mi carrera completa' : `Seguir: temporada ${h.n + 1}`}</button>
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
  const [summary, setSummary] = useState(false);
  const run = g.run;
  const cos = activeCosmetics(g.ach.unlocked);

  const back = <a class="muted cr-back" href="#/">← Inicio</a>;
  const shell = (body: preact.ComponentChildren) => (
    <div class="wrap cr-page">
      {back}
      {body}
      <p class="cr-legal">{LEGAL_NOTICE}</p>
      {g.toast.length > 0 && <AchToast ids={g.toast} onDone={g.dismissToast} />}
    </div>
  );

  if (achView) return shell(<AchScreen ach={g.ach} onBack={() => setAchView(false)} />);

  if (!run) {
    return shell(
      <Start
        me={me} card={g.card} bests={g.bests} achCount={unlockedCount(g.ach)} achTotal={ACH_TOTAL} onStart={g.start} onAch={() => setAchView(true)}
        daily={g.daily} dailyBest={g.ach.dailyBest && g.ach.dailyBest.day === g.today ? g.ach.dailyBest.score : null} streak={g.ach.streak} today={g.today} onDaily={g.startDaily}
      />,
    );
  }
  if (run.phase === 'over') {
    const l = legacy(run);
    const again = () => { setSummary(false); g.again(); };
    const change = () => { setSummary(false); g.reset(); };
    return shell(summary
      ? <Summary c={run} l={l} best={g.bests[run.diff]} ach={g.ach} onAgain={again} onChange={change} onAch={() => setAchView(true)} />
      : <Closing c={run} l={l} ach={g.ach} onSummary={() => setSummary(true)} onAgain={again} onChange={change} />);
  }

  const resultAge = run.phase === 'result' || run.tension ? run.history[run.history.length - 1].age : run.age;
  const past = { ...run, history: shownHistory(run) };
  return shell(
    <>
      <ClubHeader c={run} age={resultAge} cos={cos} />
      {run.phase === 'decide'
        ? <Decide key={`${run.history.length}-${run.picks.length}`} c={run} onPick={g.pick} onRetire={g.retire} />
        : <Result c={run} onNext={g.next} />}
      {past.history.length > 0 && (
        <section class="cr-tlwrap">
          <h2 class="cr-h cr-h-out">Tu carrera</h2>
          <Seasons c={past} limit={6} />
        </section>
      )}
      <Vitrina c={past} fold />
      <div class="cr-quit">
        {!quit
          ? <button type="button" class="btn sm" onClick={() => setQuit(true)}>Abandonar esta carrera</button>
          : (
            <div class="cr-sure" role="alert">
              <span>Se borra esta carrera y arrancás de cero.</span>
              <button type="button" class="btn sm danger" onClick={() => { setQuit(false); g.reset(); }}>Sí, abandonar</button>
              <button type="button" class="btn sm" onClick={() => setQuit(false)}>Seguir</button>
            </div>
          )}
      </div>
    </>,
  );
}
