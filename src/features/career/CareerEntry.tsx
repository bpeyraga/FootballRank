import { useMemo } from 'preact/hooks';
import { loadSummary } from './careerSummary';

const Chev = () => <svg class="chev" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>;

/**
 * Entrada al minijuego desde Inicio: si hay una carrera en curso la retoma; si no, muestra tu mejor carrera o invita a jugar.
 * Solo lee el resumen chico que deja el juego (careerSummary): no trae el simulador al bundle de Inicio.
 */
export function CareerEntry({ uid }: { uid?: string | null }) {
  const { run, best } = useMemo(() => loadSummary(uid), [uid]);
  const sub = run
    ? `Seguís con ${run.name} · temporada ${run.season}`
    : best ? `Tu mejor carrera: ${best.label} · ${best.score} pts` : 'Vivís la carrera de un crack, de pibe a leyenda';
  return (
    <a class="cr-entry" href="#/juegos/carrera">
      <span class="cr-entry-ico" aria-hidden="true">🎮</span>
      <span class="cr-entry-copy"><b>De potrero a leyenda</b><span class="muted">{sub}</span></span>
      <Chev />
    </a>
  );
}
