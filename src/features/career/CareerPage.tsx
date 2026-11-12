import { useEffect, useRef, useState } from 'preact/hooks';
import { ATTRS, POS, displayName, type Pos, type Profile, type Stats } from '../../shared/model';
import { whatsappUrl } from '../matches/share';
import { Crest } from '../../shared/ui/Crest';
import { AWARD_PTS, POS_LABEL, STYLES, TROPHY_PTS } from './careerData';
import { LEAGUES } from './careerWorld';
import {
  canRetire, cardTier, careerOvr, currentEvent, fxTags, legacy, legacyBlurb, potentialStars, seasonTitle, shareText, tally, totals, youthTarget,
  type Best, type Career, type RetireWhy, type SeasonLog, type StyleId,
} from './careerCore';
import { useCareer, type StartOpts } from './useCareer';

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

const RETIRE_TEXT: Record<RetireWhy, string> = {
  elegido: 'Elegiste colgar los botines en el momento justo.',
  edad: 'Llegaste a los 40: es hora de colgar los botines.',
  fisico: 'El cuerpo dijo basta: ya no te daba para seguir.',
};

/** Tu jugador: OVR, club, potencial y las seis stats. */
function PlayerBar({ c, age }: { c: Career; age: number }) {
  const ovr = careerOvr(c.stats, c.pos);
  const stars = potentialStars(c.potential);
  return (
    <section class="cr-bar" aria-label="Tu jugador">
      <div class={`ovr ${cardTier(ovr)} cr-ovr`} role="img" aria-label={`OVR ${ovr}`}><b>{ovr}</b><small>OVR</small></div>
      <div class="cr-who">
        <b class="ellipsis">{c.name}</b>
        <span class="muted ellipsis">{POS_LABEL[c.pos]} · {age} años</span>
      </div>
      {age <= 27 && (
        <div class="cr-stars" role="img" aria-label={`Potencial: ${stars} de 5 estrellas`}>
          <span aria-hidden="true">{[0, 1, 2, 3, 4].map(i => <i class={i < stars ? 'on' : ''}>★</i>)}</span><small>Potencial</small>
        </div>
      )}
      <p class="cr-club"><Crest team={c.club.name} size={20} /><span class="ellipsis">{c.club.name}</span><i>{LEAGUES[c.club.lg].name}</i></p>
      <ul class="cr-stats">
        {ATTRS.map(([k, code, name]) => {
          const v = Math.round(c.stats[k]);
          return <li title={name}><span>{code}</span><b>{v}</b><i style={`--w:${v}%`} aria-hidden="true" /></li>;
        })}
      </ul>
    </section>
  );
}

/** Tu carrera temporada por temporada. Se desplaza sola hasta la última. */
function Timeline({ rows, pos }: { rows: SeasonLog[]; pos: Pos }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { const el = box.current; if (el) el.scrollTop = el.scrollHeight; }, [rows.length]);
  if (!rows.length) return null;
  const keeper = pos === 'ARQ' || pos === 'DEF';
  return (
    <section class="cr-tlwrap">
      <h3>Tu carrera</h3>
      <div class="cr-tl" ref={box} role="region" aria-label="Tu carrera, temporada por temporada" tabIndex={0}>
        <table>
          <thead>
            <tr>
              <th scope="col">Temp.</th><th scope="col" class="cr-tl-age">Edad</th><th scope="col" class="cr-tl-club">Club</th><th scope="col">OVR</th><th scope="col">PJ</th>
              <th scope="col">G</th><th scope="col">A</th>{keeper && <th scope="col" title="Vallas invictas">VI</th>}<th scope="col" title="Títulos">🏆</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(h => {
              const d = h.ovr - h.ovr0;
              return (
                <tr class={h.trophies.length ? 'won' : ''}>
                  <td>{h.n}</td><td class="cr-tl-age">{h.age}</td>
                  <td class="cr-tl-club">
                    <span class="cr-tl-cn"><Crest team={h.club} size={14} /><span class="ellipsis">{h.club}</span></span>
                    <small class="muted ellipsis">{LEAGUES[h.lg].name}{h.fin > 0 ? ` · ${h.fin}.º` : ''}</small>
                  </td>
                  <td title={d ? `${d > 0 ? '+' : '−'}${Math.abs(d)} en la temporada` : undefined}>
                    <b>{h.ovr}</b>{d !== 0 && <i class={d > 0 ? 'up' : 'down'} aria-hidden="true">{d > 0 ? '▲' : '▼'}</i>}
                  </td>
                  <td>{h.pj}</td><td>{h.goals}</td><td>{h.assists}</td>{keeper && <td>{h.cs}</td>}
                  <td>{h.trophies.length || '·'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------- Pantalla de arranque ----------

function Start({ me, card, best, onStart }: { me: Profile; card: Stats | null | undefined; best: Best | null; onStart: (o: StartOpts) => void }) {
  const [name, setName] = useState(() => displayName(me).slice(0, 24));
  const [pos, setPos] = useState<Pos>(me.pos && POS.includes(me.pos) ? me.pos : 'MED');
  const [style, setStyle] = useState<StyleId>('potrero');
  const [useCard, setUseCard] = useState(false);
  const avg = card ? ATTRS.reduce((t, [k]) => t + card[k], 0) / ATTRS.length : 0;
  const youth = Math.min(60, Math.max(45, Math.round(youthTarget(avg))));

  const toggleCard = (on: boolean) => { setUseCard(on); if (on && me.pos) setPos(me.pos); };
  const submit = (e: Event) => { e.preventDefault(); onStart({ name: name.trim() || 'Crack', pos, style, useCard: useCard && !!card }); };

  return (
    <div class="cr-start">
      <header class="cr-hero">
        <span class="cr-hero-grass" aria-hidden="true" />
        <svg class="cr-hero-pitch" viewBox="0 0 200 200" aria-hidden="true">
          <g fill="none" stroke="currentColor" stroke-width="3"><circle cx="100" cy="100" r="62" /><circle cx="100" cy="100" r="5" fill="currentColor" /><path d="M-10 100h220" /></g>
        </svg>
        <span class="cr-kicker cr-kicker-light">Simulador de carrera</span>
        <h1>De potrero a leyenda</h1>
        <p>Arrancás en las inferiores de un club argentino y vivís la carrera entera de un futbolista, de los 17 años hasta el retiro: Libertadores, Champions, Mundial y Balón de Oro. Vos elegís; el azar decide cómo sale. ¿Hasta dónde llegás?</p>
      </header>

      {best && (
        <p class="cr-best" role="status">
          <span aria-hidden="true">🏅</span> Tu mejor carrera: <b>{best.label}</b> · {best.score} pts <span class="muted">({best.name}, {best.pos}, {best.seasons} temporadas)</span>
        </p>
      )}

      <form class="card cr-form" onSubmit={submit}>
        <label class="field">
          <span>Nombre del jugador</span>
          <input value={name} maxLength={24} placeholder="Tu nombre" autoComplete="off" onInput={e => setName((e.target as HTMLInputElement).value)} />
        </label>

        <fieldset class="cr-fs">
          <legend>Posición</legend>
          <div class="cr-pos">
            {POS.map(p => (
              <label class="cr-opt">
                <input type="radio" name="cr-pos" value={p} checked={pos === p} onChange={() => setPos(p)} />
                <span><b>{p}</b><small>{POS_LABEL[p]}</small></span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset class="cr-fs">
          <legend>Estilo de juego</legend>
          <div class="cr-styles">
            {STYLES.map(s => (
              <label class="cr-opt cr-style">
                <input type="radio" name="cr-style" value={s.id} checked={style === s.id} onChange={() => setStyle(s.id)} />
                <span>
                  <i aria-hidden="true">{s.emoji}</i>
                  <b>{s.name}</b>
                  <em>{s.tag}</em>
                  <small>{s.desc}</small>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {card && (
          <label class="cr-cardopt">
            <input type="checkbox" checked={useCard} onChange={e => toggleCard((e.target as HTMLInputElement).checked)} />
            <span>
              <b>Arrancar con tu carta</b>
              <small>Usás tus stats reales, en versión pibe de 17 (arrancás con unos {youth} de OVR). Cuanto mejor tu carta, más potencial tenés.</small>
            </span>
          </label>
        )}

        <button class="btn primary block cr-go">Empezar la carrera</button>
        <p class="cr-fine muted">Clubes y torneos reales, resultados inventados. Se guarda solo en este dispositivo y no cuenta para ningún ranking de la app.</p>
      </form>
    </div>
  );
}

// ---------- Una temporada: la decisión ----------

function Decide({ c, onPick, onRetire }: { c: Career; onPick: (id: string) => void; onRetire: () => void }) {
  const ev = currentEvent(c)!;
  const total = c.picks.length + c.queue.length;
  const ref = useStepFocus(`d${c.history.length}-${c.picks.length}`);
  const [sure, setSure] = useState(false);
  // El estado de esta pantalla (la confirmación de retiro, el bloqueo de toques) arranca de cero en cada decisión: ver `key` en CareerScreen
  const tapOk = useTapGuard();
  const pick = (id: string) => { if (tapOk()) onPick(id); };

  return (
    <section class="card cr-card" aria-labelledby="cr-title">
      <div class="cr-kicker">Temporada {c.history.length + 1} · {c.age} años{total > 1 ? ` · decisión ${c.picks.length + 1} de ${total}` : ''}</div>
      <h2 id="cr-title" ref={ref} tabIndex={-1}>{ev.title}</h2>
      <p class="cr-text">{ev.text}</p>
      {c.notes.length > 0 && <ul class="cr-notes" aria-label="Novedades">{c.notes.map(n => <li>{n}</li>)}</ul>}
      <div class="cr-choices" role="group" aria-label="Elegí una opción">
        {ev.options.map(o => {
          const tags = fxTags(o.fx);
          return (
            <button type="button" class="cr-choice" onClick={() => pick(o.id)}>
              <span class="cr-choice-l">{o.fx.move && <Crest team={o.fx.move.club.name} size={20} />}<span>{o.label}</span></span>
              <span class="cr-choice-h">{o.hint}</span>
              {tags.length > 0 && (
                <span class="cr-tags">{tags.map(t => <span class={`cr-tag${t.good === true ? ' up' : t.good === false ? ' down' : ''}`}>{t.t}</span>)}</span>
              )}
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
  return (
    <section class="card cr-card cr-result" aria-labelledby="cr-title">
      <div class="cr-kicker cr-kick-club">Temporada {h.n} · {h.age} años · <Crest team={h.club} size={16} /> {h.club}</div>
      <h2 id="cr-title" ref={ref} tabIndex={-1}>{seasonTitle(h)}</h2>
      <p class="muted cr-role">{h.role} · {LEAGUES[h.lg].name}{h.fin > 0 ? ` (${h.fin}.º)` : ''}{h.cont ? ` · ${h.cont}` : ''}{h.captain ? ' · Capitán' : ''}</p>
      <p class="cr-delta">
        OVR {h.ovr0} → <b>{h.ovr}</b>{' '}
        <span class={d > 0 ? 'up' : d < 0 ? 'down' : ''}>{d > 0 ? `▲ +${d}` : d < 0 ? `▼ −${Math.abs(d)}` : '= igual'}</span>
      </p>
      <dl class="cr-nums" style={`--n:${keeper || h.caps > 0 ? 3 : 4}`}>
        <div><dt>Partidos</dt><dd>{h.pj}</dd></div>
        <div><dt>Goles</dt><dd>{h.goals}</dd></div>
        <div><dt>Asist.</dt><dd>{h.assists}</dd></div>
        {keeper && <div><dt>Vallas invictas</dt><dd>{h.cs}</dd></div>}
        <div><dt>Nota</dt><dd>{h.pj > 0 ? h.rating.toFixed(1) : '—'}</dd></div>
        {h.caps > 0 && <div><dt>Selección</dt><dd>{h.caps}{h.capGoals ? <small> ({h.capGoals} g)</small> : null}</dd></div>}
      </dl>
      {(h.trophies.length > 0 || h.awards.length > 0) && (
        <ul class="cr-chips" aria-label="Títulos y premios">
          {h.trophies.map(t => <li class="gold"><span aria-hidden="true">🏆</span> {t}</li>)}
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

// ---------- El cierre ----------

function End({ c, best, onAgain }: { c: Career; best: Best | null; onAgain: () => void }) {
  const t = totals(c), l = legacy(c);
  const ref = useStepFocus('end');
  const record = !!best && best.seed === c.seed && best.score === l.score;
  const keeper = c.pos === 'ARQ' || c.pos === 'DEF';
  const trophies = tally(c.history.flatMap(h => h.trophies), TROPHY_PTS);
  const awards = tally(c.history.flatMap(h => h.awards), AWARD_PTS);
  // Los clubes por los que pasaste, en orden, con la liga en la que jugaste en cada uno
  // (si jugaste en primera con ese club, vale esa liga y no la de reserva de tus inferiores)
  const path = c.history.filter((h, i) => c.history.findIndex(x => x.club === h.club) === i).map(h => c.history.find(x => x.club === h.club && x.lg !== 'inf') ?? h);
  const share = () => {
    const text = shareText(c, `${location.origin}/#/juegos/carrera`);
    if (navigator.share) navigator.share({ text }).catch(() => {});
    else window.open(whatsappUrl(text), '_blank', 'noopener');
  };
  const tiles: [string, string | number][] = [
    ['Temporadas', t.seasons], ['Clubes', t.clubs], ['Partidos', t.pj], ['Goles', t.goals], ['Asistencias', t.assists],
    ...(keeper ? [['Vallas invictas', t.cs] as [string, number]] : []),
    ['Títulos', t.trophies], ['Premios', t.awards],
    ['Selección', t.caps ? `${t.caps} (${t.capGoals} g)` : '—'], ['OVR máximo', t.peak],
  ];
  return (
    <div class="cr-end">
      <section class={`cr-legacy lv${l.index}`} aria-labelledby="cr-title">
        <span class="cr-hero-grass" aria-hidden="true" />
        <span class="cr-kicker cr-kicker-light">Tu carrera terminó · {c.name} ({c.pos})</span>
        <h1 id="cr-title" ref={ref} tabIndex={-1}>{l.label}</h1>
        <p class="cr-score"><b>{l.score}</b> pts de Legado</p>
        <p class="cr-blurb">{legacyBlurb(l.index)}</p>
        {record && <span class="cr-record">🏅 ¡Es tu mejor carrera!</span>}
        {c.retire && <p class="cr-retire-msg">{RETIRE_TEXT[c.retire]}</p>}
      </section>

      <dl class="cr-grid">
        {tiles.map(([k, v]) => <div><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>

      {(trophies.length > 0 || awards.length > 0) && (
        <section class="card cr-honors">
          {trophies.length > 0 && (
            <div>
              <h3>Títulos</h3>
              <ul class="cr-chips">{trophies.map(([n, k]) => <li class="gold"><span aria-hidden="true">🏆</span> {n}{k > 1 ? ` ×${k}` : ''}</li>)}</ul>
            </div>
          )}
          {awards.length > 0 && (
            <div>
              <h3>Premios</h3>
              <ul class="cr-chips">{awards.map(([n, k]) => <li><span aria-hidden="true">⭐</span> {n}{k > 1 ? ` ×${k}` : ''}</li>)}</ul>
            </div>
          )}
        </section>
      )}

      {path.length > 0 && (
        <section class="card cr-honors">
          <h3>Tu recorrido</h3>
          <ul class="cr-path">
            {path.map(h => <li><Crest team={h.club} size={22} /><span><b class="ellipsis">{h.club}</b><small class="muted ellipsis">{LEAGUES[h.lg].name}</small></span></li>)}
          </ul>
        </section>
      )}

      <div class="cr-actions">
        <button type="button" class="btn primary" onClick={share}>Compartir mi carrera</button>
        <button type="button" class="btn" onClick={onAgain}>Jugar otra vez</button>
      </div>
      {best && !record && <p class="cr-best-line muted">Tu mejor carrera sigue siendo {best.label} ({best.score} pts, {best.name}).</p>}

      <Timeline rows={c.history} pos={c.pos} />
    </div>
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
  const run = g.run;

  const back = <a class="muted cr-back" href="#/">← Inicio</a>;

  if (!run) return <div class="wrap cr-page">{back}<Start me={me} card={g.card} best={g.best} onStart={g.start} /></div>;
  if (run.phase === 'over') return <div class="wrap cr-page">{back}<End c={run} best={g.best} onAgain={g.reset} /></div>;

  const resultAge = run.phase === 'result' ? run.history[run.history.length - 1].age : run.age;
  return (
    <div class="wrap cr-page">
      {back}
      <PlayerBar c={run} age={resultAge} />
      {run.phase === 'decide'
        ? <Decide key={`${run.history.length}-${run.picks.length}`} c={run} onPick={g.pick} onRetire={g.retire} />
        : <Result c={run} onNext={g.next} />}
      <Timeline rows={run.history} pos={run.pos} />
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
    </div>
  );
}
