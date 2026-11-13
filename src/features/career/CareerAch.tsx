// "De potrero a leyenda": la pantalla de Logros y el aviso cuando se desbloquea uno.
import { useEffect, useRef } from 'preact/hooks';
import { ACHIEVEMENTS, ACH_TOTAL, REC_KEYS, REC_LABEL, isUnlocked, progressOf, progressText, tierLabel, unlockedCount, type AchStats } from './careerAchievements';
import { COSMETICS, unlockedBy } from './careerCosmetics';
import { fmtEuro } from './careerValue';

const dateText = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
};

/** Las tarjetas de logros: los desbloqueados a todo color, los que faltan en gris con su barra de avance ("3/10"). */
export function AchScreen({ ach, onBack }: { ach: AchStats; onBack: () => void }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => { ref.current?.focus({ preventScroll: true }); }, []);
  const n = unlockedCount(ach);
  return (
    <section class="cr-achs" aria-labelledby="cr-ach-title">
      <button type="button" class="btn sm cr-ach-back" onClick={onBack}>← Volver</button>
      <header class="cr-ach-head">
        <h1 id="cr-ach-title" ref={ref} tabIndex={-1}>Logros</h1>
        <p class="cr-ach-count"><b>{n}</b>/{ACH_TOTAL} desbloqueados</p>
        <div class="cr-prog big" role="progressbar" aria-valuemin={0} aria-valuemax={ACH_TOTAL} aria-valuenow={n} aria-label="Logros desbloqueados"><i style={`width:${Math.round((n / ACH_TOTAL) * 100)}%`} /></div>
        <p class="muted cr-ach-sub">{ach.careersStarted} {ach.careersStarted === 1 ? 'carrera arrancada' : 'carreras arrancadas'} · {ach.careersFinished} {ach.careersFinished === 1 ? 'terminada' : 'terminadas'} · {ach.seasonsPlayed} {ach.seasonsPlayed === 1 ? 'temporada' : 'temporadas'} · {ach.titlesWon} {ach.titlesWon === 1 ? 'título' : 'títulos'}</p>
      </header>
      <section class="cr-card2 cr-recs" aria-label="Récords">
        <h2 class="cr-h">Récords</h2>
        <ul class="cr-rec-list">
          {REC_KEYS.map(k => <li><span class="cr-rec-k">{REC_LABEL[k]}</span><b>{ach.rec[k] ? (k === 'val' ? fmtEuro(ach.rec[k]) : ach.rec[k]) : '—'}</b></li>)}
        </ul>
        {ach.streak.n > 0 && <p class="muted cr-rec-streak">🔥 Racha del desafío: {ach.streak.n} {ach.streak.n === 1 ? 'día' : 'días'} · la más larga: {ach.maxStreak}</p>}
      </section>
      <section class="cr-card2 cr-recs" aria-label="Desbloqueables">
        <h2 class="cr-h">Desbloqueables</h2>
        <ul class="cr-cos-list">
          {COSMETICS.map(c => { const on = isUnlocked(ach, c.ach), a = ACHIEVEMENTS.find(x => x.id === c.ach); return <li class={on ? 'on' : 'off'}><span class="cr-cos-dot" style={`background:${c.color}`} aria-hidden="true" /><span>{c.label}<small class="muted">{on ? ' · ¡tuyo!' : ` · con "${a?.title ?? ''}"`}</small></span></li>; })}
        </ul>
      </section>
      <ul class="cr-ach-grid">
        {ACHIEVEMENTS.map(a => {
          const on = isUnlocked(ach, a.id), p = progressOf(a, ach);
          return (
            <li class={`cr-ach ${a.tier}${on ? ' on' : ' off'}`}>
              <span class="cr-ach-ico" aria-hidden="true">{on ? a.icon : '🔒'}</span>
              <span class="cr-ach-t">
                <b>{a.title}</b>
                <small>{a.desc}</small>
                <span class="cr-ach-meta"><em>{tierLabel[a.tier]}</em>{on ? <span class="muted"> · {dateText(ach.unlocked[a.id])}</span> : <span class="muted"> · {progressText(a, ach)}</span>}</span>
                {!on && a.target > 1 && <span class="cr-prog" role="progressbar" aria-valuemin={0} aria-valuemax={p.target} aria-valuenow={p.value} aria-label={`${a.title}: ${p.value} de ${p.target}`}><i style={`width:${p.pct}%`} /></span>}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Aviso de un logro nuevo: se va solo a los 4 segundos (o al tocarlo). */
export function AchToast({ ids, onDone }: { ids: readonly string[]; onDone: () => void }) {
  const id = ids[0];
  useEffect(() => {
    if (!id) return;
    const t = setTimeout(onDone, 3800);
    return () => clearTimeout(t);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const a = ACHIEVEMENTS.find(x => x.id === id);
  if (!a) return null;
  return (
    <div class={`cr-toast ${a.tier}`} role="status" aria-live="polite" onClick={onDone}>
      <span class="cr-medal" aria-hidden="true"><span class="cr-medal-in"><i>{a.icon}</i></span></span>
      <span class="cr-toast-t"><small>¡Logro desbloqueado!</small><b>{a.title}</b>{unlockedBy(a.id).map(c => <small class="cr-toast-cos">Desbloqueaste: {c.label}</small>)}</span>
    </div>
  );
}
