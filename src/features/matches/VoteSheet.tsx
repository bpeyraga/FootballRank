import { createPortal } from 'preact/compat';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import './votePrompt.css';
import { displayName, posLine } from '../../shared/supabase';
import { Avatar } from '../../shared/ui/Avatar';
import { fmtDate } from '../../shared/text';
import { loadVoteRoster, voteMvp, type VotePlayer } from './api';
import { errText } from './model';
import { ratingsLeft, type PendingVote } from './votingCore';

const FOCUSABLE = 'a[href],button:not([disabled]):not([tabindex="-1"])';
const byName = (a: VotePlayer, b: VotePlayer) => displayName(a).localeCompare(displayName(b), 'es');

/**
 * "¿Cómo salió el partido?": hoja de abajo en el celu / ventana centrada en la compu para votar la figura de un partido que jugaste
 * (un toque en un jugador y queda votado) y de ahí ir a calificar a tu equipo. Si hay más de un partido pendiente, los va pasando.
 * Diálogo modal accesible: Esc = "Después", Tab queda adentro, el foco vuelve a donde estaba. Se baja aparte (import dinámico desde
 * VotePrompt): no pesa en la carga inicial.
 */
export function VoteSheet({ queue, meId, onLater, onSkip, onDone }: {
  queue: PendingVote[]; meId: string;
  /** "Después" (o Esc, o tocar afuera, o ir a calificar): no se vuelve a pedir en esta sesión. Recibe los partidos que quedaban. */
  onLater: (matchIds: string[]) => void;
  /** "No jugué este partido": no se vuelve a pedir ese partido. */
  onSkip: (matchId: string) => void;
  /** Se terminó con todos. */
  onDone: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const [roster, setRoster] = useState<VotePlayer[] | null>(null);
  const [phase, setPhase] = useState<'pick' | 'done'>('pick');
  const [picked, setPicked] = useState<VotePlayer | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // id del jugador al que se está votando
  const [err, setErr] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const cur = queue[idx];
  const left = ratingsLeft(cur);

  // Los jugadores del partido de turno
  useEffect(() => {
    let alive = true;
    setRoster(null); setErr('');
    loadVoteRoster(cur.match_id).then(r => { if (alive) setRoster(r); })
      .catch(e => { if (alive) { setRoster([]); setErr(errText(e)); } });
    return () => { alive = false; };
  }, [cur.match_id]);

  const later = () => onLater(queue.slice(idx).map(q => q.match_id));
  const next = () => {
    if (idx + 1 < queue.length) { setIdx(idx + 1); setPhase('pick'); setPicked(null); setErr(''); } else onDone();
  };

  // Al abrir, foco en el título; al cerrar, el foco vuelve a donde estaba.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>('#vp-title')?.focus({ preventScroll: true });
    return () => { if (before?.isConnected) before.focus?.({ preventScroll: true }); };
  }, []);
  // Cuando llegan los jugadores o se pasa a "listo", el foco va al primer botón útil (si no, queda en el título o en un botón que ya no está).
  useEffect(() => {
    if (roster && phase === 'pick') box.current?.querySelector<HTMLElement>('.vp-opt')?.focus({ preventScroll: true });
    if (phase === 'done') box.current?.querySelector<HTMLElement>('.vp-main')?.focus({ preventScroll: true });
  }, [roster, phase, idx]);

  // Teclado: Esc = Después; Tab atrapado adentro.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { if (!busy) { e.preventDefault(); later(); } return; }
      if (e.key !== 'Tab') return;
      const items = [...(box.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
      if (!items.length) { e.preventDefault(); return; }
      const first = items[0], end = items[items.length - 1], at = document.activeElement;
      if (!box.current?.contains(at)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && at === first) { e.preventDefault(); end.focus(); }
      else if (!e.shiftKey && at === end) { e.preventDefault(); first.focus(); }
    };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, [busy, idx, queue]);

  const groups = useMemo(() => {
    const others = (roster ?? []).filter(p => p.id !== meId).sort(byName);
    if (!others.some(p => p.team)) return [{ key: 'all', team: null as 'A' | 'B' | null, label: '', items: others }];
    return ([['A', 'Equipo A'], ['B', 'Equipo B'], [null, 'Sin equipo']] as const)
      .map(([t, label]) => ({ key: t ?? 'none', team: t, label, items: others.filter(p => p.team === t) }))
      .filter(g => g.items.length);
  }, [roster, meId]);
  const none = roster != null && !groups.some(g => g.items.length);

  const vote = async (p: VotePlayer) => {
    if (busy) return;
    setBusy(p.id); setErr('');
    try { await voteMvp(cur.match_id, p.id); }
    catch (e) { setBusy(null); setErr(errText(e)); return; }
    setBusy(null); setPicked(p); setPhase('done');
  };

  const matchHref = `#/c/${cur.slug}/m/${cur.match_id}`;
  const rate = left > 0 && (
    <a class={phase === 'done' ? 'btn primary vp-main' : 'btn'} href={matchHref} onClick={later}>
      Calificar a mi equipo ({left})
    </a>
  );

  // En el <body>: tapa también la barra de pestañas.
  return createPortal(
    <div class="sheet-bg vp-bg" onClick={() => !busy && later()}>
      <div class="sheet vp-sheet" ref={box} role="dialog" aria-modal="true" aria-labelledby="vp-title" aria-describedby="vp-sub"
        onClick={e => e.stopPropagation()}>
        <div class="vp-hero">
          <span class="vp-trophy" aria-hidden="true">🏆</span>
          <div class="vp-head">
            {queue.length > 1 && <span class="vp-kicker">Partido {idx + 1} de {queue.length}</span>}
            <h2 id="vp-title" tabIndex={-1}>{phase === 'done' ? '¡Listo, gracias!' : '¿Cómo salió el partido?'}</h2>
            <p id="vp-sub" class="vp-sub">{cur.title} · {cur.community_name} · {fmtDate(cur.starts_at)}</p>
          </div>
          <button type="button" class="icon-btn vp-x" aria-label="Después" disabled={!!busy} onClick={later}>✕</button>
        </div>

        <div class="vp-body">
          <span class="vp-sr" role="status">{phase === 'done' && picked ? `Voto guardado: ${displayName(picked)}` : roster == null ? 'Cargando jugadores' : ''}</span>
          {phase === 'pick' && <>
            <p class="vp-ask"><b>¿Quién fue la figura?</b> <span class="muted">Un toque y listo. Vale elegir a uno del otro equipo.</span></p>
            {roster == null && <p class="muted vp-load">Cargando jugadores…</p>}
            {none && !err && <p class="muted">No hay otros jugadores para votar en este partido.</p>}
            <div class={`vp-teams${groups.length > 1 ? ' two' : ''}`}>
              {groups.map(g => (
                <section key={g.key} class={`vp-team${g.team ? ` ${g.team}` : ''}`} aria-label={g.label || undefined}>
                  {g.label && <b class={`vp-team-h ${g.team === 'A' ? 'ta' : g.team === 'B' ? 'tb' : ''}`}>{g.label}</b>}
                  {g.items.map(p => (
                    <button type="button" class={`vp-opt${picked?.id === p.id ? ' on' : ''}`} disabled={!!busy}
                      aria-label={`Votar a ${displayName(p)} como figura`} onClick={() => vote(p)}>
                      <Avatar p={p} size={40} zoom={false} />
                      <span class="vp-who"><span class="ellipsis">{displayName(p)}</span><small class="muted">{posLine(p)}</small></span>
                      <span class="vp-go" aria-hidden="true">{busy === p.id ? '…' : '🏆'}</span>
                    </button>
                  ))}
                </section>
              ))}
            </div>
          </>}

          {phase === 'done' && picked && (
            <div class="vp-done">
              <Avatar p={picked} size={64} zoom={false} />
              <p class="vp-voted">Tu figura: <b>{displayName(picked)}</b></p>
              <p class="muted">{left > 0
                ? `Te ${left === 1 ? 'falta' : 'faltan'} calificar ${left} ${left === 1 ? 'compañero' : 'compañeros'}: del 1 al 10, ¿cómo jugó cada uno?`
                : 'Gracias por votar: así el ranking y la historia del partido quedan bien.'}</p>
            </div>
          )}
          {err && <p class="err" role="alert">{err}</p>}
        </div>

        <div class="vp-foot">
          {phase === 'pick' ? <>
            {rate}
            <button type="button" class="btn vp-later" disabled={!!busy} onClick={later}>Después</button>
            <button type="button" class="linkish vp-skip" disabled={!!busy} onClick={() => { onSkip(cur.match_id); next(); }}>No jugué este partido</button>
          </> : <>
            {rate}
            <button type="button" class={`btn${left > 0 ? '' : ' primary vp-main'}`} onClick={next}>
              {idx + 1 < queue.length ? 'Siguiente partido' : 'Cerrar'}
            </button>
            <button type="button" class="linkish vp-skip" onClick={() => { setPhase('pick'); setErr(''); }}>Cambiar mi voto</button>
          </>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
