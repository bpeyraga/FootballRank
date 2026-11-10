import { useEffect, useState } from 'preact/hooks';
import { Avatar } from '../../shared/ui/Avatar';
import type { EvPlayer } from './EventSteppers';
import { KIND_ICON, KIND_LABEL, type EventKind, type MatchEvent } from '../stats/statsCore';
import { MAX_COUNT, countsOf, eventCounts } from './quickMatch';
import {
  chronological, elapsedSec, fmtClock, fmtMinute, lastMineOf, liveLabel, minuteOf, scoreFromEvents,
  type LiveAction, type LiveClock,
} from './live';
import './quickmatch.css';

const BTN_KINDS: readonly EventKind[] = ['goal', 'assist', 'foul', 'yellow', 'red'];
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'es');

/** Cronómetro: se redibuja solo (cada 250 ms, solo mientras corre) y no arrastra al resto del panel. */
function BigClock({ clock, skew }: { clock: LiveClock; skew: number }) {
  const running = clock.live_state === 'running';
  const [, tick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => tick(n => n + 1), 250);
    return () => clearInterval(t);
  }, [running]);
  const sec = elapsedSec(clock, Date.now() + skew);
  return <b class="lv-clock" role="timer" aria-label={`Tiempo de juego ${fmtClock(sec)}`}>{fmtClock(sec)}</b>;
}

/** Línea de tiempo: minuto, tipo y jugador. Con `onRemove`, cada renglón se puede sacar. */
export function Timeline({ events, nameOf, teamOf, onRemove, newestFirst }: {
  events: MatchEvent[]; nameOf: (pid: string) => string; teamOf: (pid: string) => 'A' | 'B' | null;
  onRemove?: (e: MatchEvent) => void; newestFirst?: boolean;
}) {
  const list = chronological(events);
  if (newestFirst) list.reverse();
  if (!list.length) return <p class="muted lv-empty">Todavía no pasó nada.</p>;
  return (
    <ol class="lv-tl">
      {list.map(e => {
        const t = teamOf(e.profile_id);
        return (
          <li key={e.id} class={`lv-ev ${t ?? ''}`}>
            <span class="lv-min">{fmtMinute(e.minute) || '–'}</span>
            <span class="lv-ico" aria-hidden="true">{KIND_ICON[e.kind]}</span>
            <span class="lv-who ellipsis"><b>{nameOf(e.profile_id)}</b> <small class="muted">{KIND_LABEL[e.kind]}</small></span>
            {onRemove && (
              <button type="button" class="lv-x" aria-label={`Sacar ${KIND_LABEL[e.kind].toLowerCase()} de ${nameOf(e.profile_id)}`} onClick={() => onRemove(e)}>×</button>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export interface LivePanelProps {
  clock: LiveClock;
  skew: number;                    // ms a sumarle a Date.now() para quedar a la hora del servidor
  events: MatchEvent[];
  ready: boolean;                  // los eventos ya se leyeron (antes de eso no se puede cargar nada)
  players: EvPlayer[];             // los que juegan (anotados y presentes)
  nameOf: (pid: string) => string;
  teamOf: (pid: string) => 'A' | 'B' | null;
  canEdit: boolean;                // owner/admins: manejan el reloj y cargan eventos
  meId: string;                    // "Deshacer" saca el último que cargué yo, no el de otro admin
  busy: boolean;                   // hay una acción del reloj en camino
  err: string;
  onClock: (a: LiveAction) => void;
  onRetry: () => void;
  onEvent: (pid: string, kind: EventKind, minute: number) => void;
  onUndo: () => void;
  onRemove: (e: MatchEvent) => void;
  onSaveResult: (a: number, b: number) => void;
}

/** Resultado final editable: arranca con el marcador de los goles cargados; si el admin lo toca, queda lo que puso. */
function FinalScore({ score, busy, onSave }: { score: { a: number; b: number }; busy: boolean; onSave: (a: number, b: number) => void }) {
  const [edit, setEdit] = useState<{ a: string; b: string } | null>(null);
  const a = edit ? edit.a : String(score.a), b = edit ? edit.b : String(score.b);
  const ok = (v: string) => /^\d{1,2}$/.test(v);
  const set = (k: 'a' | 'b', v: string) => setEdit({ a, b, [k]: v.replace(/\D/g, '').slice(0, 2) });
  return (
    <div class="lv-result">
      <div class="lv-result-in">
        <label><span>Equipo A</span><input inputMode="numeric" value={a} aria-label="Goles del Equipo A" onInput={e => set('a', (e.target as HTMLInputElement).value)} /></label>
        <em aria-hidden="true">–</em>
        <label><span>Equipo B</span><input inputMode="numeric" value={b} aria-label="Goles del Equipo B" onInput={e => set('b', (e.target as HTMLInputElement).value)} /></label>
      </div>
      <button type="button" class="btn primary block" disabled={busy || !ok(a) || !ok(b)} onClick={() => onSave(+a, +b)}>
        Guardar resultado {ok(a) ? a : '?'} – {ok(b) ? b : '?'}
      </button>
    </div>
  );
}

/**
 * Partido en vivo. Todos ven el cronómetro, el marcador y la línea de tiempo (en tiempo real);
 * los admins además manejan el reloj y cargan goles, asistencias, faltas y tarjetas con un toque por jugador.
 */
export function LivePanel(p: LivePanelProps) {
  const { clock, events, canEdit } = p;
  const state = clock.live_state === 'paused' || clock.live_state === 'ended' ? clock.live_state : 'running';
  const score = scoreFromEvents(events, p.teamOf);
  const counts = eventCounts(events);
  const last = lastMineOf(events, p.meId);
  const hasTeams = p.players.some(x => x.team);
  const minuteNow = () => minuteOf(elapsedSec(clock, Date.now() + p.skew));

  // El celular no tiene que apagar la pantalla mientras el admin está cargando el partido.
  useEffect(() => {
    if (!canEdit || state !== 'running') return;
    let lock: { release?: () => Promise<void> } | null = null, alive = true;
    const ask = async () => {
      try {
        const l = await (navigator as any).wakeLock?.request?.('screen');
        if (alive) lock = l ?? null; else l?.release?.();
      } catch { /* sin permiso o sin soporte: no pasa nada */ }
    };
    const onVis = () => { if (document.visibilityState === 'visible') ask(); };
    ask();
    document.addEventListener('visibilitychange', onVis);
    return () => { alive = false; document.removeEventListener('visibilitychange', onVis); lock?.release?.().catch(() => {}); };
  }, [canEdit, state]);

  const tap = (pid: string, kind: EventKind) => {
    try { navigator.vibrate?.(25); } catch { /* sin vibración */ }
    p.onEvent(pid, kind, minuteNow());
  };

  const groups: { key: 'A' | 'B' | 'none'; ps: EvPlayer[] }[] = hasTeams
    ? [{ key: 'A', ps: p.players.filter(x => x.team === 'A') }, { key: 'B', ps: p.players.filter(x => x.team === 'B') },
       { key: 'none', ps: p.players.filter(x => !x.team) }]
    : [{ key: 'none', ps: p.players }];

  return (
    <div class={`card live-card ${state}`}>
      <div class="lv-head">
        <div class="lv-time">
          <BigClock clock={clock} skew={p.skew} />
          <span class="lv-state"><i class={`lv-dot ${state}`} aria-hidden="true" /><span class="ellipsis">{state === 'running' ? `En vivo · ${liveLabel(clock)}` : liveLabel(clock)}</span></span>
        </div>
        <div class="lv-score" role="status" aria-label={`Marcador: Equipo A ${score.a}, Equipo B ${score.b}`}>
          <span class="ta">Equipo A</span><span /><span class="tb">Equipo B</span>
          <b>{score.a}</b><em aria-hidden="true">–</em><b>{score.b}</b>
        </div>
      </div>

      {canEdit && (
        <div class="lv-ctl">
          {state === 'running' && <button type="button" class="btn" disabled={p.busy} onClick={() => p.onClock('pause')}>⏸ Pausar</button>}
          {state !== 'running' && <button type="button" class="btn primary" disabled={p.busy} onClick={() => p.onClock('resume')}>▶ Reanudar</button>}
          {state !== 'ended' && clock.live_half !== 2 && <button type="button" class="btn" disabled={p.busy} onClick={() => p.onClock('half')}>⏭ 2º tiempo</button>}
          {state !== 'ended' && <button type="button" class="btn danger" disabled={p.busy} onClick={() => p.onClock('end')}>🏁 Terminar</button>}
        </div>
      )}
      {p.err && <p class="err" role="alert">{p.err}</p>}

      {state === 'ended' && (
        <div class="lv-final">
          <p><b>Terminó {score.a} – {score.b}</b>{canEdit ? '. Confirmá el resultado para cerrar el partido.' : '. Un admin va a confirmar el resultado.'}</p>
          {canEdit && <p class="muted lv-hint">Sale de los goles cargados. Si no es el marcador real, corregilo acá (o corregí los goles de abajo).</p>}
          {canEdit && (p.ready
            ? <FinalScore score={score} busy={p.busy} onSave={p.onSaveResult} />
            : <p class="muted lv-hint">Cargando los eventos del partido…</p>)}
        </div>
      )}

      {canEdit && !hasTeams && <p class="note-inline lv-note">Armá los equipos (en "Administrar") para que los goles sumen al marcador.</p>}

      <div class={`lv-body ${canEdit ? '' : 'solo'}`}>
        {canEdit && p.ready && (
          <div class="lv-pls">
            <div class="lv-undo">
              {last
                ? <span class="ellipsis">Tu último: <b>{fmtMinute(last.minute)} {KIND_ICON[last.kind]} {p.nameOf(last.profile_id)}</b></span>
                : <span class="muted">Tocá un botón para cargar un gol, una falta o una tarjeta.</span>}
              <button type="button" class="btn sm" disabled={!last} onClick={p.onUndo}>↶ Deshacer</button>
            </div>
            {!p.players.length && <p class="muted">No hay jugadores anotados.</p>}
            <div class="lv-teams">
              {groups.filter(g => g.ps.length).map(g => {
                const goals = g.ps.reduce((t, x) => t + countsOf(counts, x.id).goal, 0);
                return (
                  <div class={`qm-grp ${hasTeams ? g.key : ''}`}>
                    {hasTeams && (
                      <div class="qm-gh">
                        <b class={g.key === 'A' ? 'ta' : g.key === 'B' ? 'tb' : 'muted'}>{g.key === 'none' ? 'Sin equipo' : `Equipo ${g.key}`}</b>
                        <span class="muted">{KIND_ICON.goal} {goals}</span>
                      </div>
                    )}
                    {[...g.ps].sort(byName).map(x => {
                      const c = countsOf(counts, x.id);
                      return (
                        <div class="lv-pl" key={x.id}>
                          <div class="lv-pwho"><Avatar p={x.profile} size={28} /><span class="ellipsis">{x.name}</span></div>
                          <div class="lv-btns">
                            {BTN_KINDS.map(k => (
                              <button type="button" class={`lv-b ${c[k] ? 'on' : ''}`} key={k} disabled={c[k] >= MAX_COUNT[k]}
                                aria-label={`${KIND_LABEL[k]} de ${x.name}${c[k] ? ` (van ${c[k]})` : ''}`} onClick={() => tap(x.id, k)}>
                                <span aria-hidden="true">{KIND_ICON[k]}</span>
                                {c[k] > 0 && <sup aria-hidden="true">{c[k]}</sup>}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div class="lv-tlbox">
          <h4>Minuto a minuto</h4>
          {p.ready
            ? <Timeline events={events} nameOf={p.nameOf} teamOf={p.teamOf} newestFirst onRemove={canEdit ? p.onRemove : undefined} />
            : p.err
              ? <button type="button" class="btn sm" onClick={p.onRetry}>Reintentar</button>
              : <p class="muted lv-empty">Cargando…</p>}
        </div>
      </div>

      {canEdit && state !== 'running' && (
        <button type="button" class="linkbtn lv-reset" disabled={p.busy} onClick={() => p.onClock('reset')}>Reiniciar el reloj</button>
      )}
    </div>
  );
}
