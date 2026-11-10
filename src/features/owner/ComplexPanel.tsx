import { useState } from 'preact/hooks';
import { AgendaView } from './AgendaView';
import { DetailsView } from './DetailsView';
import { FieldsView } from './FieldsView';
import { HoursView } from './HoursView';
import { RequestsView } from './RequestsView';
import { Icon, Skeleton, TAB_ICONS } from './ui';
import { useBookingsFeed, useComplexData, usePending } from './useOwner';
import { TABS, isPublished, setupChecklist, type ComplexData, type TabId } from './model';

/** Qué le falta al complejo para aparecer en el buscador (solo lo obligatorio), con un link a donde se completa. */
function SetupBanner({ data }: { data: ComplexData }) {
  const { complex, fields, hours } = data;
  const items = setupChecklist(complex, fields, hours);
  const missing = items.filter(i => i.required && !i.ok);
  if (!complex.active) {
    return <div class="card note ow-alert"><b>Tu complejo está pausado</b><span>No aparece en el buscador. Activalo desde <a href={`#/duenio/${complex.id}/datos`}>Datos</a>.</span></div>;
  }
  if (isPublished(items, true) || !missing.length) return null;
  return (
    <div class="card note ow-setup" role="status">
      <b>Completá tu complejo para aparecer en el buscador</b>
      <ul>
        {items.filter(i => i.required).map(i => (
          <li class={i.ok ? 'ok' : ''}><span aria-hidden="true">{i.ok ? '✓' : '○'}</span>{i.ok ? i.label : <a href={`#/duenio/${complex.id}/${i.tab}`}>{i.label}</a>}</li>
        ))}
      </ul>
    </div>
  );
}

/** Un complejo: encabezado, avisos de lo que falta y las pestañas Agenda, Pedidos, Canchas, Horarios y Datos. */
export function ComplexPanel({ meId, id, tab }: { meId: string; id: string; tab: TabId }) {
  const { data, err, patch, reload } = useComplexData(meId, id);
  const tick = useBookingsFeed(id);
  const [bump, setBump] = useState(0);
  const pending = usePending(id, tick, bump);
  const reloadAll = () => setBump(b => b + 1);

  if (data === undefined) return <div class="ow-panel"><a class="ow-back" href="#/duenio">← Mis complejos</a><Skeleton rows={3} /></div>;
  if (data === null) {
    return (
      <div class="ow-panel">
        <a class="ow-back" href="#/duenio">← Mis complejos</a>
        <div class="card ow-empty">
          <span class="ow-empty-ico" aria-hidden="true">🔎</span>
          <h3>No encontramos ese complejo</h3>
          <p class="muted">{err || 'Ese complejo no existe o no es tuyo.'}</p>
          <a class="btn" href="#/duenio">Ir a mis complejos</a>
        </div>
      </div>
    );
  }

  const { complex } = data;
  const published = isPublished(setupChecklist(complex, data.fields, data.hours), complex.active);
  const href = (t: TabId) => `#/duenio/${id}${t === 'agenda' ? '' : '/' + t}`;

  return (
    <div class="ow-panel">
      <a class="ow-back" href="#/duenio">← Mis complejos</a>
      <header class={`ow-hero${complex.photo_url ? ' has-photo' : ''}`}>
        {complex.photo_url ? <img class="ow-hero-img" src={complex.photo_url} alt="" /> : <div class="ow-hero-def" aria-hidden="true" />}
        <div class="ow-hero-shade" aria-hidden="true" />
        <div class="ow-hero-body">
          <h2>{complex.name}</h2>
          <p class="ellipsis">{[complex.address, complex.city].filter(Boolean).join(' · ') || 'Sin dirección'}</p>
        </div>
        <span class={`ow-pill ow-hero-pill ${published ? 'ok' : complex.active ? 'warn' : 'off'}`}>
          {published ? 'Publicado' : complex.active ? 'Incompleto' : 'Pausado'}
        </span>
      </header>

      <SetupBanner data={data} />

      <nav class="tabs ow-tabs" aria-label="Secciones del complejo">
        {TABS.map(t => (
          <a href={href(t.id)} class={t.id === tab ? 'on' : ''} aria-current={t.id === tab ? 'page' : undefined}>
            <span class="tab-ico"><Icon>{TAB_ICONS[t.id]}</Icon></span>
            <span class="tab-label">{t.label}</span>
            {t.id === 'pedidos' && pending > 0 && tab !== 'pedidos' && <span class="tab-badge" aria-label={`${pending} por responder`}>{pending > 99 ? '99+' : pending}</span>}
          </a>
        ))}
      </nav>

      <div class={`ow-body ow-tab-${tab}`}>
        {err && <p class="err" role="alert">{err} <button class="linkbtn" onClick={reload}>Reintentar</button></p>}
        {tab === 'agenda' && <AgendaView data={data} tick={tick} pending={pending} reloadAll={reloadAll} />}
        {tab === 'pedidos' && <RequestsView data={data} tick={tick} reloadAll={reloadAll} />}
        {tab === 'canchas' && <FieldsView data={data} patch={patch} />}
        {tab === 'horarios' && <HoursView data={data} patch={patch} />}
        {tab === 'datos' && <DetailsView data={data} patch={patch} />}
      </div>
    </div>
  );
}
