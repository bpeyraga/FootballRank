import { directionsUrl, mapUrl } from '../venues/maps';
import { BookingPicker } from './BookingPicker';
import { contactWhatsapp, fmtPrice, placeLine, sizeLabel, surfaceLabel, telUrl, type Complex, type Field } from './model';
import { Photo } from './Photo';
import { isOpenNow, localParts, safeTz, weekHours, type HoursRow } from './slots';
import { useComplex } from './useCourts';

/** Ficha de un complejo: foto, cómo llegar, contacto, canchas, horarios y el selector de turnos. */
export function ComplexDetail({ id }: { id: string }) {
  const { data, err, reload } = useComplex(id);

  if (data === undefined) return (
    <div class="cn-detail" aria-hidden="true"><div class="cn-sk cn-sk-hero" /><div class="cn-sk cn-sk-block" /><div class="cn-sk cn-sk-block" /></div>
  );
  if (!data) return (
    <div class="card cn-empty">
      <span class="cn-empty-ico" aria-hidden="true">🏟️</span>
      <b>{err ? 'No pudimos abrir esta cancha' : 'No encontramos esta cancha'}</b>
      <p class="muted">{err || 'Puede que el complejo ya no esté disponible.'}</p>
      <div class="cn-empty-btns">
        {err && <button type="button" class="btn" onClick={reload}>Reintentar</button>}
        <a class="btn primary" href="#/canchas">Ver otras canchas</a>
      </div>
    </div>
  );

  const { complex: c, fields, hours } = data;
  const tz = safeTz(c.tz);
  const now = Date.now();
  const open = hours.length ? isOpenNow(hours, tz, now) : null;
  const where = placeLine(c);
  const loc = { name: c.name, address: where || null, lat: c.lat, lng: c.lng };
  const hasPlace = c.lat != null || !!where || !!c.maps_url;
  const wa = contactWhatsapp(c, `Hola, vi ${c.name} en El Partidito y quería consultar por un turno.`);

  return (
    <article class="cn-detail">
      <Photo url={c.photo_url} class="cn-hero">
        <div class="cn-hero-shade" aria-hidden="true" />
        <div class="cn-hero-copy">
          {open != null && <span class={`cn-open ${open ? 'yes' : 'no'}`}>{open ? 'Abierto ahora' : 'Cerrado ahora'}</span>}
          <h2>{c.name}</h2>
          {where && <p class="ellipsis">{where}</p>}
        </div>
      </Photo>

      <div class="cn-actions">
        {hasPlace && <a class="cn-act" href={directionsUrl(loc)} target="_blank" rel="noopener"><span aria-hidden="true">🧭</span>Cómo llegar</a>}
        {c.phone && <a class="cn-act" href={telUrl(c.phone)}><span aria-hidden="true">📞</span>Llamar</a>}
        {wa && <a class="cn-act" href={wa} target="_blank" rel="noopener"><span aria-hidden="true">💬</span>WhatsApp</a>}
        {hasPlace && <a class="cn-act" href={mapUrl({ ...loc, maps_url: c.maps_url })} target="_blank" rel="noopener"><span aria-hidden="true">🗺️</span>Ver mapa</a>}
      </div>

      <section class="card cn-sec cn-book" aria-labelledby="cn-book-h">
        <h3 id="cn-book-h">Reservá tu turno</h3>
        <BookingPicker complex={c} fields={fields} hours={hours} />
      </section>

      <div class="cn-cols">
        <FieldsCard fields={fields} />
        <HoursCard hours={hours} tz={tz} open={open} now={now} />
      </div>

      <About c={c} />
    </article>
  );
}

function FieldsCard({ fields }: { fields: Field[] }) {
  return (
    <section class="card cn-sec" aria-labelledby="cn-fields-h">
      <h3 id="cn-fields-h">Canchas</h3>
      {!fields.length && <p class="muted">Todavía no cargaron las canchas.</p>}
      <ul class="cn-fields">
        {fields.map(f => (
          <li>
            <span class="cn-size">{sizeLabel(f.size)}</span>
            <span class="cn-field-main"><b class="ellipsis">{f.name}</b><small class="muted">{surfaceLabel(f.surface)}{f.roofed ? ' · Techada' : ''}</small></span>
            <span class="cn-field-price">{f.price != null ? <><b>{fmtPrice(f.price)}</b><small class="muted">por hora</small></> : <small class="muted">A consultar</small>}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function HoursCard({ hours, tz, open, now }: { hours: HoursRow[]; tz: string; open: boolean | null; now: number }) {
  const groups = weekHours(hours, localParts(now, tz).dow);
  return (
    <section class="card cn-sec" aria-labelledby="cn-hours-h">
      <h3 id="cn-hours-h">Horarios{open != null && <span class={`cn-open inline ${open ? 'yes' : 'no'}`}>{open ? 'Abierto ahora' : 'Cerrado ahora'}</span>}</h3>
      {!hours.length && <p class="muted">Todavía no cargaron los horarios.</p>}
      <ul class="cn-hours">
        {hours.length > 0 && groups.map(g => (
          <li class={`${g.today ? 'today' : ''}${g.closed ? ' closed' : ''}`}><span>{g.label}</span><b>{g.text}</b></li>
        ))}
      </ul>
    </section>
  );
}

function About({ c }: { c: Complex }) {
  if (!c.description?.trim() && !c.amenities.length) return null;
  return (
    <section class="card cn-sec" aria-labelledby="cn-about-h">
      <h3 id="cn-about-h">Sobre el complejo</h3>
      {c.description?.trim() && <p class="cn-about">{c.description.trim()}</p>}
      {c.amenities.length > 0 && <ul class="cn-amen">{c.amenities.map(a => <li>{a}</li>)}</ul>}
    </section>
  );
}
