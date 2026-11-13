import type { ComponentChildren } from 'preact';

/**
 * Baldosa de la sección "Explorar" del Inicio: ícono, título y una línea corta. Los estilos (.ex-*) están en home.css.
 * `kind` le da el color de cada entrada (courts, zone, fut, game). `badge` va arriba a la derecha (un escudo, "🏅 3/24").
 * `alert` es un puntito de aviso con su texto para lectores de pantalla (p. ej. "Desafío de hoy sin jugar").
 */
export function ExploreTile({ href, kind, ico, title, sub, badge, alert }: {
  href: string; kind: 'courts' | 'zone' | 'fut' | 'game'; ico: string; title: string; sub: string;
  badge?: ComponentChildren; alert?: string;
}) {
  return (
    <a class={`ex-tile ex-${kind}`} href={href}>
      <span class="ex-top">
        <span class="ex-ico" aria-hidden="true">{ico}{alert && <i class="ex-dot" />}</span>
        {badge && <span class="ex-badge">{badge}</span>}
      </span>
      <b class="ex-title">{title}</b>
      <span class="ex-sub">{sub}</span>
      {alert && <span class="ex-sr">{alert}</span>}
    </a>
  );
}
