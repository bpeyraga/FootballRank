import { useMemo } from 'preact/hooks';
import { ExploreTile } from '../../shared/ui/ExploreTile';
import { argDay, streakShown } from './careerDaily';
import { ACH_TOTAL, DIFF_TITLE, loadSummary, topBest } from './careerSummary';

const Chev = () => <svg class="chev" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>;

/**
 * Entrada al minijuego desde Inicio: si hay una carrera en curso la retoma; si no, muestra tu mejor carrera (con su dificultad) o invita a jugar.
 * Solo lee el resumen chico que deja el juego (careerSummary): no trae el simulador al bundle de Inicio.
 * `compact`: baldosa de la sección "Explorar" (logros como insignia y un puntito si el Desafío de hoy sigue sin jugar).
 */
export function CareerEntry({ uid, compact = false }: { uid?: string | null; compact?: boolean }) {
  const s = useMemo(() => loadSummary(uid), [uid]);
  const best = topBest(s), today = argDay(), streak = streakShown(s.streak, today);
  const played = !!s.day && s.day.day === today;
  const daily = played ? `Desafío de hoy: tu mejor ${s.day!.score} pts` : 'Desafío de hoy: ¡todavía no lo jugaste!';
  const sub = s.run
    ? `Seguís con ${s.run.name} · temporada ${s.run.season}`
    : best ? `Tu mejor carrera${best.d === 'normal' ? '' : ` (${DIFF_TITLE[best.d]})`}: ${best.label} · ${best.score} pts` : 'Vivís la carrera de un crack, de pibe a leyenda';
  if (compact) {
    return (
      <ExploreTile kind="game" href="#/juegos/carrera" ico="🎮" title="De potrero a leyenda"
        sub={s.run ? `Seguís con ${s.run.name} · temp. ${s.run.season}` : best ? `Tu mejor carrera: ${best.score} pts` : 'De pibe a leyenda: jugá tu carrera'}
        badge={<span class="ex-pill" title="Logros desbloqueados" aria-label={`${s.ach} de ${ACH_TOTAL} logros`}><span aria-hidden="true">🏅</span> {s.ach}/{ACH_TOTAL}</span>}
        alert={played ? undefined : 'Desafío de hoy sin jugar'} />
    );
  }
  return (
    <a class="cr-entry" href="#/juegos/carrera">
      <span class="cr-entry-ico" aria-hidden="true">🎮</span>
      <span class="cr-entry-copy">
        <b>De potrero a leyenda</b>
        <span class="muted">{sub}</span>
        <span class="muted cr-entry-daily">📆 {daily}{streak > 0 ? ` · 🔥 ${streak} ${streak === 1 ? 'día seguido' : 'días seguidos'}` : ''}</span>
      </span>
      <span class="cr-entry-ach" title="Logros desbloqueados" aria-label={`${s.ach} de ${ACH_TOTAL} logros`}><span aria-hidden="true">🏅</span> {s.ach}/{ACH_TOTAL}</span>
      <Chev />
    </a>
  );
}
