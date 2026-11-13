import { ExploreTile } from '../../shared/ui/ExploreTile';
import { isUnnamed } from './model';
import { useMyZone } from './useZone';

const Chev = () => <svg class="chev" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>;

/**
 * Entrada al "Ranking de tu zona" desde Inicio. Con zona cargada es la tarjeta destacada; sin zona (o mientras carga)
 * es una línea discreta que invita a contar dónde jugás. Si la zona no se puede leer, queda como la discreta.
 * `compact`: baldosa de la sección "Explorar" (con zona, la baldosa muestra el nombre de tu zona).
 */
export function ZoneEntry({ compact = false }: { compact?: boolean }) {
  const { zone } = useMyZone();
  const label = zone ? (isUnnamed(zone.label) ? 'Tu zona' : zone.label) : '';
  if (compact) {
    return <ExploreTile kind="zone" href="#/zona" ico="🏆" title="Ranking de tu zona" sub={zone ? `${label} · el mejor de tu barrio` : '¿Dónde jugás? Mirá el mejor de tu barrio'} />;
  }
  return (
    <a class={`zn-entry${zone ? '' : ' soft'}`} href="#/zona">
      <span class="zn-entry-ico" aria-hidden="true">🏆</span>
      <span class="zn-entry-copy">
        <b>Ranking de tu zona</b>
        <span class="muted">
          {zone ? `${label} · mirá quién es el mejor de tu barrio` : '¿Dónde jugás? Mirá quién es el mejor de tu barrio'}
        </span>
      </span>
      <Chev />
    </a>
  );
}
