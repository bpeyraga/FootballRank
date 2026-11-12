// "De potrero a leyenda": la pantalla de arranque. Todo con valores listos (Argentina, tu posición, Normal): con un toque en "Empezar" alcanza.
import { useMemo, useState } from 'preact/hooks';
import { ATTRS, displayName, type Profile, type Stats } from '../../shared/model';
import { Flag, Shirt } from './CareerVisuals';
import { STYLES } from './careerData';
import { cleanNum, cleanSurname, youthTarget } from './careerCore';
import { NATIONS, nationOf } from './careerNations';
import { DIFFS, DIFF_LIST, DPOS_DEFAULT, DPOS_LABEL, DPOS_LIST, DPOS_XY, FOOT_LIST, FOOTS } from './careerSetup';
import type { DailySetup } from './careerChallenge';
import { streakShown, type Streak } from './careerDaily';
import type { Best, DPos, Difficulty, Foot, NatId, StyleId } from './careerTypes';
import { LEAGUES } from './careerWorld';
import type { StartOpts } from './useCareer';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** La cancha en miniatura: tocás la posición donde jugás. Los doce lugares son botones de verdad (se pueden usar con teclado). */
export function PosPicker({ value, onChange }: { value: DPos; onChange: (p: DPos) => void }) {
  return (
    <div class="cr-pitchbox">
      <div class="cr-pitch" role="radiogroup" aria-label="Posición en la cancha">
        <svg class="cr-pitch-bg" viewBox="0 0 100 130" preserveAspectRatio="none" aria-hidden="true">
          <rect x="3" y="3" width="94" height="124" rx="3" fill="none" stroke="currentColor" stroke-width="1.2" />
          <path d="M3 65h94" stroke="currentColor" stroke-width="1" />
          <circle cx="50" cy="65" r="11" fill="none" stroke="currentColor" stroke-width="1" />
          <rect x="24" y="3" width="52" height="19" fill="none" stroke="currentColor" stroke-width="1" />
          <rect x="24" y="108" width="52" height="19" fill="none" stroke="currentColor" stroke-width="1" />
          <rect x="38" y="3" width="24" height="7" fill="none" stroke="currentColor" stroke-width="1" />
          <rect x="38" y="120" width="24" height="7" fill="none" stroke="currentColor" stroke-width="1" />
        </svg>
        {DPOS_LIST.map(p => (
          <label class={`cr-spot${value === p ? ' on' : ''}`} style={`left:${DPOS_XY[p][0]}%;top:${DPOS_XY[p][1]}%`} title={DPOS_LABEL[p]}>
            <input type="radio" name="cr-dpos" value={p} checked={value === p} onChange={() => onChange(p)} aria-label={DPOS_LABEL[p]} />
            <span>{p}</span>
          </label>
        ))}
      </div>
      <p class="cr-pos-name" role="status"><b>{value}</b> · {DPOS_LABEL[value]}</p>
    </div>
  );
}

/** Buscador de países con bandera: la Argentina primero, después el resto de Sudamérica y el mundo. */
function NatPicker({ value, onChange }: { value: NatId; onChange: (n: NatId) => void }) {
  const [q, setQ] = useState('');
  const list = useMemo(() => { const k = norm(q.trim()); return k ? NATIONS.filter(n => norm(n.name).includes(k)) : NATIONS; }, [q]);
  const n = nationOf(value);
  const where = n.lg ? null : n.migr.map(l => LEAGUES[l].country).filter((x, i, a) => a.indexOf(x) === i).join(', ');
  return (
    <div class="cr-natbox">
      <input class="cr-natq" type="search" value={q} placeholder="Buscar país" aria-label="Buscar país" autoComplete="off" onInput={e => setQ((e.target as HTMLInputElement).value)} />
      <div class="cr-nats" role="radiogroup" aria-label="Nacionalidad">
        {list.map(x => (
          <label class="cr-nat">
            <input type="radio" name="cr-nat" value={x.id} checked={value === x.id} onChange={() => onChange(x.id)} />
            <span><Flag nat={x.id} size={24} /><b>{x.name}</b></span>
          </label>
        ))}
        {!list.length && <p class="muted cr-nonat">No encontramos ese país.</p>}
      </div>
      <p class="cr-natnote"><Flag nat={n.id} size={18} /> Jugás en {n.team}.{where ? ` Como ${n.name} no tiene liga en el juego, te vas de chico a ${where}.` : ` Arrancás en las inferiores de un club de ${n.name}.`}</p>
    </div>
  );
}

const Seg = <T extends string>({ name, label, value, items, onChange }: { name: string; label: string; value: T; items: readonly { id: T; title: string; desc: string }[]; onChange: (v: T) => void }) => (
  <fieldset class="cr-fs">
    <legend>{label}</legend>
    <div class="cr-seg">
      {items.map(i => (
        <label class="cr-opt">
          <input type="radio" name={name} value={i.id} checked={value === i.id} onChange={() => onChange(i.id)} />
          <span><b>{i.title}</b><small>{i.desc}</small></span>
        </label>
      ))}
    </div>
  </fieldset>
);

/** El Desafío del día: el mismo arranque para todos (hora de la Argentina), con tu mejor puntaje de hoy y tu racha. */
function DailyCard({ setup, best, streak, today, onPlay }: { setup: DailySetup; best: number | null; streak: Streak; today: string; onPlay: () => void }) {
  const n = nationOf(setup.nat), s = streakShown(streak, today);
  return (
    <section class="card cr-daily" aria-labelledby="cr-daily-t">
      <div class="cr-daily-top">
        <h2 id="cr-daily-t" class="cr-h">📆 Desafío del día</h2>
        {s > 0 && <span class="cr-streak" title="Días seguidos con un desafío terminado">🔥 {s} {s === 1 ? 'día seguido' : 'días seguidos'}</span>}
      </div>
      <p class="cr-daily-setup"><Flag nat={setup.nat} size={20} /> <b>{n.name}</b> · {setup.dpos} · {FOOTS[setup.foot].short} · {DIFFS[setup.diff].name}</p>
      <p class="muted cr-daily-note">Hoy todos arrancan con el mismo jugador y el mismo azar. {best !== null ? <>Tu mejor de hoy: <b>{best} pts</b>.</> : 'Todavía no lo jugaste hoy.'}</p>
      <button type="button" class="btn primary block" onClick={onPlay}>{best !== null ? 'Jugarlo de nuevo' : 'Jugar el desafío de hoy'}</button>
    </section>
  );
}

export function Start({ me, card, bests, achCount, achTotal, daily, dailyBest, streak, today, onStart, onDaily, onAch }: {
  me: Profile; card: Stats | null | undefined; bests: Record<Difficulty, Best | null>; achCount: number; achTotal: number;
  daily: DailySetup; dailyBest: number | null; streak: Streak; today: string; onStart: (o: StartOpts) => void; onDaily: (who: { name: string; surname: string; num: number }) => void; onAch: () => void;
}) {
  const full = displayName(me).trim();
  const words = full.split(/\s+/).filter(Boolean);
  const mine = { name: (words.length > 1 ? words.slice(0, -1).join(' ') : full).slice(0, 24), surname: cleanSurname(words[words.length - 1] ?? ''), num: cleanNum(me.shirt_number), dpos: DPOS_DEFAULT[me.pos] ?? 'MC' };
  const [name, setName] = useState(mine.name);
  const [surname, setSurname] = useState(mine.surname);
  const [num, setNum] = useState(String(mine.num));
  const [dpos, setDpos] = useState<DPos>(mine.dpos);
  const [nat, setNat] = useState<NatId>('ar');
  const [foot, setFoot] = useState<Foot>('der');
  const [style, setStyle] = useState<StyleId>('potrero');
  const [diff, setDiff] = useState<Difficulty>('normal');
  const [useCard, setUseCard] = useState(false);
  const avg = card ? ATTRS.reduce((t, [k]) => t + card[k], 0) / ATTRS.length : 0;
  const youth = Math.min(60, Math.max(45, Math.round(youthTarget(avg))));
  const n = Math.round(Number(num));
  const numOk = Number.isInteger(n) && n >= 1 && n <= 99;

  /** "Usar mi perfil": tu nombre, apellido, número y posición; y, si tenés carta, arrancás con ella. La nacionalidad queda Argentina. */
  const useProfile = () => {
    setName(mine.name); setSurname(mine.surname); setNum(String(mine.num)); setDpos(mine.dpos); setNat('ar');
    if (card) setUseCard(true);
  };
  const submit = (e: Event) => {
    e.preventDefault();
    onStart({ name: name.trim() || 'Crack', surname: cleanSurname(surname) || cleanSurname(name) || 'CRACK', num: numOk ? n : cleanNum(undefined, dpos), dpos, nat, foot, diff, style, useCard: useCard && !!card });
  };
  const best = bests[diff];
  const D = DIFF_LIST.find(d => d.id === diff)!;

  return (
    <div class="cr-start">
      <header class="cr-hero">
        <span class="cr-hero-grass" aria-hidden="true" />
        <svg class="cr-hero-pitch" viewBox="0 0 200 200" aria-hidden="true">
          <g fill="none" stroke="currentColor" stroke-width="3"><circle cx="100" cy="100" r="62" /><circle cx="100" cy="100" r="5" fill="currentColor" /><path d="M-10 100h220" /></g>
        </svg>
        <span class="cr-kicker cr-kicker-light">Simulador de carrera</span>
        <h1>De potrero a leyenda</h1>
        <p>Arrancás en las inferiores de un club y vivís la carrera entera de un futbolista, de los 17 años hasta el retiro: Libertadores, Champions, Mundial y Balón de Oro. Vos elegís; el azar decide cómo sale. ¿Hasta dónde llegás?</p>
        <div class="cr-hero-actions">
          <button type="button" class="btn sm" onClick={useProfile}>👤 Usar mi perfil</button>
          <button type="button" class="btn sm" onClick={onAch}>🏅 Logros {achCount}/{achTotal}</button>
        </div>
      </header>

      <DailyCard setup={daily} best={dailyBest} streak={streak} today={today} onPlay={() => onDaily({ name: name.trim() || 'Crack', surname: cleanSurname(surname) || cleanSurname(name) || 'CRACK', num: numOk ? n : cleanNum(undefined, dpos) })} />

      <form class="cr-form" onSubmit={submit}>
        <section class="card cr-sec">
          <h2 class="cr-h">Tu jugador</h2>
          <div class="cr-ident">
            <div class="cr-ident-f">
              <label class="field"><span>Nombre</span><input value={name} maxLength={24} placeholder="Tu nombre" autoComplete="off" onInput={e => setName((e.target as HTMLInputElement).value)} /></label>
              <label class="field"><span>Apellido (va en la camiseta)</span><input class="cr-upper" value={surname} maxLength={14} placeholder="Apellido" autoComplete="off" onInput={e => setSurname((e.target as HTMLInputElement).value.toUpperCase().slice(0, 14))} /></label>
              <label class="field"><span>Número (1 a 99)</span><input type="number" inputMode="numeric" min={1} max={99} value={num} aria-invalid={!numOk} onInput={e => setNum((e.target as HTMLInputElement).value)} /></label>
            </div>
            <div class="cr-ident-s" aria-live="polite"><Shirt nat={nat} surname={cleanSurname(surname) || 'CRACK'} num={numOk ? n : cleanNum(undefined, dpos)} size={132} /></div>
          </div>
        </section>

        <section class="card cr-sec">
          <h2 class="cr-h">Nacionalidad</h2>
          <NatPicker value={nat} onChange={setNat} />
        </section>

        <section class="card cr-sec">
          <h2 class="cr-h">Posición</h2>
          <PosPicker value={dpos} onChange={setDpos} />
        </section>

        <section class="card cr-sec">
          <Seg name="cr-foot" label="Pie hábil" value={foot} items={FOOT_LIST.map(f => ({ id: f.id, title: f.name, desc: f.desc }))} onChange={setFoot} />
          <fieldset class="cr-fs">
            <legend>Estilo de juego</legend>
            <div class="cr-styles">
              {STYLES.map(s => (
                <label class="cr-opt cr-style">
                  <input type="radio" name="cr-style" value={s.id} checked={style === s.id} onChange={() => setStyle(s.id)} />
                  <span><i aria-hidden="true">{s.emoji}</i><b>{s.name}</b><em>{s.tag}</em><small>{s.desc}</small></span>
                </label>
              ))}
            </div>
          </fieldset>
        </section>

        <section class="card cr-sec">
          <Seg name="cr-diff" label="Dificultad" value={diff} items={DIFF_LIST.map(d => ({ id: d.id, title: d.name, desc: d.desc }))} onChange={setDiff} />
          <p class="cr-diffbest" role="status">
            {best ? <>🏅 Mejor carrera ({D.name}): <b>{best.label}</b> · {best.score} pts</> : <span class="muted">Todavía no terminaste una carrera en {D.name}.</span>}
          </p>
        </section>

        {card && (
          <label class="cr-cardopt">
            <input type="checkbox" checked={useCard} onChange={e => setUseCard((e.target as HTMLInputElement).checked)} />
            <span>
              <b>Arrancar con tu carta</b>
              <small>Usás tus stats reales, en versión pibe de 17 (arrancás con unos {youth} de OVR). Cuanto mejor tu carta, más potencial tenés.</small>
            </span>
          </label>
        )}

        <button class="btn primary block cr-go">Empezar la carrera <Flag nat={nat} size={18} /></button>
        <p class="cr-fine muted">Clubes y torneos reales, resultados inventados. Se guarda solo en este dispositivo y no cuenta para ningún ranking de la app.</p>
      </form>
    </div>
  );
}

