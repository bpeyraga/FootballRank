import { useEffect, useMemo, useState } from 'preact/hooks';
import { ComplexDetail } from './ComplexPage';
import { OriginPicker } from './OriginPicker';
import { Photo } from './Photo';
import {
  DEFAULT_RADIUS, RADII, SIZES, countByRadius, filterComplexes, fmtKm, placeLine, priceFrom, sizeLabel, widerRadius, type ComplexRow, type Origin,
} from './model';
import { isOpenNow } from './slots';
import { useComplexSearch, useOrigin, type OpenMeta } from './useCourts';

/**
 * "Canchas cerca" (#/canchas) y la ficha de un complejo (#/cancha/<id>): en el celular una pantalla a la vez; en la compu,
 * la lista a la izquierda y el complejo elegido a la derecha. Es la misma pantalla para las dos rutas (así no se pierde la búsqueda).
 */
export function Courts({ id }: { id?: string }) {
  const { origin, zone, loading, choose } = useOrigin();
  const search = useComplexSearch(origin);
  const [km, setKm] = useState(DEFAULT_RADIUS);
  const [size, setSize] = useState<number | null>(null);
  const [changing, setChanging] = useState(false);

  useEffect(() => { window.scrollTo(0, 0); }, [id]);

  const rows = search.rows;
  const list = useMemo(() => (rows ? filterComplexes(rows, { km, size }) : []), [rows, km, size]);
  const counts = useMemo(() => (rows ? countByRadius(rows, size) : null), [rows, size]);
  const wider = rows ? widerRadius(rows, km, size) : null;
  const picking = changing || (!origin && !loading);

  const pick = (o: Origin) => { choose(o); setChanging(false); };

  return (
    <div class="wrap cn-page">
      <a class="muted cn-back cn-back-home" href="#/">← Inicio</a>
      <a class="muted cn-back cn-back-list" href="#/canchas">← Canchas cerca</a>

      <div class={`cn-shell${id ? ' has-detail' : ''}`}>
        <section class="cn-list-col" aria-label="Canchas cerca">
          <div class="cn-hero-top">
            <span class="cn-grass" aria-hidden="true" />
            <svg class="cn-pitch" viewBox="0 0 200 200" aria-hidden="true">
              <g fill="none" stroke="currentColor" stroke-width="3"><circle cx="100" cy="100" r="62" /><circle cx="100" cy="100" r="5" fill="currentColor" /><path d="M-10 100h220" /></g>
            </svg>
            <span class="cn-kicker">Canchas cerca</span>
            <h2 class="cn-title">Reservá tu cancha</h2>
            {origin && !picking && (
              <div class="cn-where">
                <span class="cn-where-pin" aria-hidden="true">📍</span>
                <span class="cn-where-txt"><small>Buscando cerca de</small><b class="ellipsis">{origin.label}</b></span>
                <button type="button" class="cn-change" onClick={() => setChanging(true)}>Cambiar</button>
              </div>
            )}
            {!origin && loading && <p class="cn-sub">Buscando tu zona…</p>}
            {!origin && !loading && <p class="cn-sub">Contanos desde dónde buscás y te mostramos las canchas más cercanas.</p>}
            {origin && !picking && (
              <>
                <div class="cn-radius" role="group" aria-label="Distancia">
                  {RADII.map(r => (
                    <button type="button" class={km === r ? 'on' : ''} aria-pressed={km === r} onClick={() => setKm(r)}>
                      {r} km{counts && <small>{counts[r]}</small>}
                    </button>
                  ))}
                </div>
                <div class="cn-radius cn-sizes-f" role="group" aria-label="Tamaño de la cancha">
                  <button type="button" class={size == null ? 'on' : ''} aria-pressed={size == null} onClick={() => setSize(null)}>Todas</button>
                  {SIZES.map(s => <button type="button" class={size === s ? 'on' : ''} aria-pressed={size === s} onClick={() => setSize(size === s ? null : s)}>{sizeLabel(s)}</button>)}
                </div>
              </>
            )}
          </div>

          {picking && (
            <div class="card cn-pick-card">
              <h3>{origin ? 'Cambiar el lugar' : '¿Desde dónde buscás?'}</h3>
              <OriginPicker zone={zone} onPick={pick} onCancel={origin ? () => setChanging(false) : undefined} />
            </div>
          )}

          {origin && !picking && (
            <div class="cn-results">
              {search.err && (
                <div class="card cn-empty" role="alert">
                  <p class="err" style="margin:0 0 12px">{search.err}</p>
                  <button type="button" class="btn" onClick={search.reload}>Reintentar</button>
                </div>
              )}
              {!search.err && !rows && <div class="cn-skeleton" aria-hidden="true">{[0, 1, 2].map(() => <div class="cn-sk cn-sk-card" />)}</div>}
              {rows && (
                <p class="cn-count" role="status">
                  {list.length === 0 ? 'Ninguna cancha' : `${list.length} ${list.length === 1 ? 'cancha' : 'canchas'}`} a {km} km o menos{size ? ` · ${sizeLabel(size)}` : ''}
                </p>
              )}
              {rows && list.length === 0 && (
                <div class="card cn-empty">
                  <span class="cn-empty-ico" aria-hidden="true">🏟️</span>
                  {wider
                    ? <><b>No hay canchas a {km} km</b><p class="muted">Hay algunas un poco más lejos{size ? ` con ${sizeLabel(size)}` : ''}: ampliá el radio para verlas.</p>
                        <button type="button" class="btn primary" onClick={() => setKm(wider)}>Ver hasta {wider} km</button></>
                    : <><b>Todavía no hay canchas por acá</b><p class="muted">{size ? `No encontramos canchas de ${sizeLabel(size)} en esta zona. ` : ''}Probá con otro barrio o sin filtrar por tamaño. Estamos sumando complejos todo el tiempo.</p>
                        {size != null && <button type="button" class="btn" onClick={() => setSize(null)}>Ver todos los tamaños</button>}</>}
                </div>
              )}
              {list.length > 0 && (
                <div class="cn-cards" role="list">
                  {list.map(c => <Card c={c} meta={search.meta.get(c.id)} active={c.id === id} />)}
                </div>
              )}
            </div>
          )}
        </section>

        <section class={`cn-detail-col${id ? '' : ' none'}`} aria-label="Detalle de la cancha">
          {id
            ? <ComplexDetail key={id} id={id} />
            : (
              <div class="card cn-placeholder">
                <span aria-hidden="true">🏟️</span>
                <b>Elegí una cancha</b>
                <p class="muted">Mirá los horarios, la ubicación y pedí tu turno desde acá.</p>
              </div>
            )}
        </section>
      </div>
    </div>
  );
}

function Card({ c, meta, active }: { c: ComplexRow; meta?: OpenMeta; active: boolean }) {
  const open = meta?.hours.length ? isOpenNow(meta.hours, meta.tz, Date.now()) : null;
  const where = placeLine(c);
  return (
    <a class={`cn-card${active ? ' on' : ''}`} role="listitem" href={`#/cancha/${c.id}`} aria-current={active ? 'page' : undefined}>
      <Photo url={c.photo_url} class="cn-card-ph">
        <span class="cn-km">{fmtKm(c.km)}</span>
        {open && <span class="cn-open yes">Abierto ahora</span>}
      </Photo>
      <div class="cn-card-body">
        <b class="cn-card-name ellipsis">{c.name}</b>
        {where && <span class="muted ellipsis cn-card-where">{where}</span>}
        <div class="cn-card-meta">
          <span class="cn-sizes">{c.sizes.map(s => <i>{sizeLabel(s)}</i>)}</span>
          <span class="cn-price">{priceFrom(c.min_price)}</span>
        </div>
      </div>
    </a>
  );
}
