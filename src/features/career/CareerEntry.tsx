import { useMemo } from 'preact/hooks';
import { argDay, streakShown } from './careerDaily';
import { ACH_TOTAL, DIFF_TITLE, loadSummary, topBest } from './careerSummary';

const Chev = () => <svg class="chev" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>;

/**
 * Entrada al minijuego desde Inicio: si hay una carrera en curso la retoma; si no, muestra tu mejor carrera (con su dificultad) o invita a jugar.
 * Solo lee el resumen chico que deja el juego (careerSummary): no trae el simulador al bundle de Inicio.
 */
export function CareerEntry({ uid }: { uid?: string | null }) {
  const s = useMemo(() => loadSummary(uid), [uid]);
  const best = topBest(s), today = argDay(), streak = streakShown(s.streak, today);
  const daily = s.day && s.day.day === today ? `Desafío de hoy: tu mejor ${s.day.score} pts` : 'Desafío de hoy: ¡todavía no lo jugaste!';
  const sub = s.run
    ? `Seguís con ${s.run.name} · temporada ${s.run.season}`
    : best ? `Tu mejor carrera${best.d === 'normal' ? '' : ` (${DIFF_TITLE[best.d]})`}: ${best.label} · ${best.score} pts` : 'Vivís la carrera de un crack, de pibe a leyenda';
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
