// "De potrero a leyenda": la pantalla de arranque. Todo viene listo (Argentina, tu posición, Normal): con un toque en "Empezar" alcanza.
// Lo demás (país, posición, pie, estilo, dificultad) está en "Personalizar".
import { useMemo, useState } from 'preact/hooks';
import { ATTRS, displayName, type Profile, type Stats } from '../../shared/model';
import { Flag, Shirt } from './CareerVisuals';
import { STYLES } from './careerData';
import { cleanNum, cleanSurname, youthTarget } from './careerCore';
import { NATIONS, nationOf } from './careerNations';
import { DIFF_LIST, DPOS_DEFAULT, DPOS_LABEL, DPOS_LIST, DPOS_XY, FOOT_LIST, FOOTS, fmtMult } from './careerSetup';
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
      {where && <p class="cr-natnote"><Flag nat={n.id} size={16} /> Sin liga propia: te vas de chico a {where}.</p>}
    </div>
  );
}

interface Choice<T extends string> { id: T; title: string; sub: string; emoji?: string }

const Seg = <T extends string>({ name, label, value, items, onChange }: { name: string; label: string; value: T; items: readonly Choice<T>[]; onChange: (v: T) => void }) => (
  <fieldset class="cr-fs">
    <legend>{label}</legend>
    <div class="cr-seg">
      {items.map(i => (
        <label class="cr-opt">
          <input type="radio" name={name} value={i.id} checked={value === i.id} onChange={() => onChange(i.id)} />
          <span>{i.emoji && <i aria-hidden="true">{i.emoji}</i>}<b>{i.title}</b><small>{i.sub}</small></span>
        </label>
      ))}
    </div>
  </fieldset>
);

const DIFF_SUB: Record<Difficulty, string> = { normal: 'Parejo', intenso: 'Más difícil', experto: 'Una hazaña' };

/** El Desafío del día: el mismo arranque para todos (hora de la Argentina), con tu mejor puntaje de hoy y tu racha. */
function DailyCard({ setup, best, streak, today, onPlay }: { setup: DailySetup; best: number | null; streak: Streak; today: string; onPlay: () => void }) {
  const n = nationOf(setup.nat), s = streakShown(streak, today);
  return (
    <section class="cr-daily" aria-labelledby="cr-daily-t">
      <div class="cr-daily-top">
        <h2 id="cr-daily-t" class="cr-h">📆 Desafío del día</h2>
        {s > 0 && <span class="cr-streak" title="Días seguidos con un desafío terminado">🔥 {s}</span>}
      </div>
      <p class="cr-daily-setup"><Flag nat={setup.nat} size={20} /> <b>{n.name}</b> · {setup.dpos} · {FOOTS[setup.foot].short}</p>
      <p class="muted cr-daily-note">{best !== null ? <>Tu mejor de hoy: <b>{best} pts</b></> : 'Mismo jugador y mismo azar para todos.'}</p>
      <button type="button" class="btn block cr-daily-go" onClick={onPlay}>{best !== null ? 'Jugarlo de nuevo' : 'Jugar el desafío'} <span aria-hidden="true">▶</span></button>
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
  const [open, setOpen] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(min-width:900px)').matches);
  const avg = card ? ATTRS.reduce((t, [k]) => t + card[k], 0) / ATTRS.length : 0;
  const youth = Math.min(60, Math.max(45, Math.round(youthTarget(avg))));
  const n = Math.round(Number(num));
  const numOk = Number.isInteger(n) && n >= 1 && n <= 99;
  const shirtNum = numOk ? n : cleanNum(undefined, dpos);
  const who = { name: name.trim() || 'Crack', surname: cleanSurname(surname) || cleanSurname(name) || 'CRACK', num: shirtNum };

  /** "Usar mi perfil": tu nombre, apellido, número y posición; y, si tenés carta, arrancás con ella. La nacionalidad queda Argentina. */
  const useProfile = () => {
    setName(mine.name); setSurname(mine.surname); setNum(String(mine.num)); setDpos(mine.dpos); setNat('ar');
    if (card) setUseCard(true);
  };
  const submit = (e: Event) => {
    e.preventDefault();
    onStart({ ...who, dpos, nat, foot, diff, style, useCard: useCard && !!card });
  };
  const best = bests[diff];
  const S = STYLES.find(s => s.id === style)!;

  return (
    <div class="cr-start">
      <header class="cr-hero">
        <span class="cr-hero-grass" aria-hidden="true" />
        <svg class="cr-hero-pitch" viewBox="0 0 200 200" aria-hidden="true">
          <g fill="none" stroke="currentColor" stroke-width="3"><circle cx="100" cy="100" r="62" /><circle cx="100" cy="100" r="5" fill="currentColor" /><path d="M-10 100h220" /></g>
        </svg>
        <span class="cr-hero-ball" aria-hidden="true">⚽</span>
        <span class="cr-kicker cr-kicker-light">Simulador de carrera</span>
        <h1>De potrero<br />a leyenda</h1>
        <p>Elegí. Arriesgá. Hacete leyenda.</p>
        <div class="cr-hero-actions">
          <button type="button" class="btn sm" onClick={useProfile}>👤 Usar mi perfil</button>
          <button type="button" class="btn sm" onClick={onAch}>🏅 Logros {achCount}/{achTotal}</button>
        </div>
      </header>

      <div class="cr-start-grid">
        <form class="cr-form" onSubmit={submit}>
          <section class="cr-card2 cr-me" aria-label="Tu jugador">
            <div class="cr-me-shirt" aria-live="polite"><Shirt nat={nat} surname={who.surname} num={shirtNum} size={118} /></div>
            <div class="cr-me-f">
              <label class="field"><span>Nombre</span><input value={name} maxLength={24} placeholder="Tu nombre" autoComplete="off" onInput={e => setName((e.target as HTMLInputElement).value)} /></label>
              <div class="cr-me-row">
                <label class="field"><span>Apellido</span><input class="cr-upper" value={surname} maxLength={14} placeholder="Apellido" autoComplete="off" onInput={e => setSurname((e.target as HTMLInputElement).value.toUpperCase().slice(0, 14))} /></label>
                <label class="field cr-numf"><span>N.º</span><input type="number" inputMode="numeric" min={1} max={99} value={num} aria-invalid={!numOk} onInput={e => setNum((e.target as HTMLInputElement).value)} /></label>
              </div>
            </div>
          </section>

          <button class="btn primary block cr-go" type="submit">Empezar la carrera <Flag nat={nat} size={20} /></button>
          <p class="cr-pick-sum" aria-label="Tu elección actual">
            <span><Flag nat={nat} size={14} /> {nationOf(nat).name}</span><span>{dpos}</span><span>{FOOTS[foot].short}</span><span>{S.emoji} {S.name}</span><span>{diff === 'normal' ? 'Normal' : DIFF_LIST.find(d => d.id === diff)!.name}</span>
            {useCard && card && <span>🃏 Con tu carta ({youth})</span>}
          </p>

          <details class="cr-custom" open={open} onToggle={e => setOpen((e.target as HTMLDetailsElement).open)}>
            <summary><span>⚙️ Personalizar</span><span class="muted">país, posición, estilo, dificultad</span></summary>
            <div class="cr-custom-in">
              <section class="cr-cs"><h2 class="cr-h">Nacionalidad</h2><NatPicker value={nat} onChange={setNat} /></section>
              <section class="cr-cs"><h2 class="cr-h">Posición</h2><PosPicker value={dpos} onChange={setDpos} /></section>
              <section class="cr-cs">
                <Seg name="cr-foot" label="Pie hábil" value={foot} items={FOOT_LIST.map(f => ({ id: f.id, title: f.name, sub: f.short }))} onChange={setFoot} />
                <Seg name="cr-style" label="Estilo de juego" value={style} items={STYLES.map(s => ({ id: s.id, title: s.name, sub: s.tag, emoji: s.emoji }))} onChange={setStyle} />
                <Seg name="cr-diff" label="Dificultad" value={diff} items={DIFF_LIST.map(d => ({ id: d.id, title: d.name, sub: `${DIFF_SUB[d.id]}${d.mult !== 1 ? ` · ${fmtMult(d.mult)}` : ''}` }))} onChange={setDiff} />
                <p class="cr-diffbest" role="status">{best ? <>🏅 Tu mejor ({DIFF_LIST.find(d => d.id === diff)!.name}): <b>{best.label}</b> · {best.score} pts</> : <span class="muted">Todavía sin carrera terminada en esta dificultad.</span>}</p>
              </section>
              {card && (
                <label class="cr-cardopt">
                  <input type="checkbox" checked={useCard} onChange={e => setUseCard((e.target as HTMLInputElement).checked)} />
                  <span><b>Arrancar con tu carta</b><small>Tus stats reales, en versión pibe (~{youth} de OVR).</small></span>
                </label>
              )}
            </div>
          </details>
        </form>

        <aside class="cr-start-side">
          <DailyCard setup={daily} best={dailyBest} streak={streak} today={today} onPlay={() => onDaily(who)} />
          <p class="cr-fine muted">Clubes y torneos reales, resultados inventados. Se guarda solo en este dispositivo.</p>
        </aside>
      </div>
    </div>
  );
}
