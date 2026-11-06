import { useEffect, useRef, useState } from 'preact/hooks';
import { sb } from '../../shared/supabase';
import { isMapsUrl, parseMapsUrl, type Venue } from './maps';
import { NEW_VENUE, type VenueDraft } from './venues';

/**
 * Datos de una cancha nueva: link de Google Maps, nombre y dirección.
 * Al pegar el link completa el nombre (editable) y guarda las coordenadas.
 */
export function VenueNewFields({ draft, onDraft }: { draft: VenueDraft; onDraft: (d: VenueDraft) => void }) {
  const [state, setState] = useState<'' | 'busy' | 'ok' | 'fail'>('');
  const cur = useRef(draft); cur.current = draft;        // siempre el borrador más nuevo (la búsqueda es asíncrona)
  const done = useRef('');                                 // último link ya procesado
  const auto = useRef('');                                 // último nombre puesto por el link: si el admin lo cambió, no se pisa
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const lookup = async (url: string) => {
    done.current = url;
    let r: { name: string | null; lat: number | null; lng: number | null } = parseMapsUrl(url);
    if (r.lat == null) { // link corto: lo resuelve la función `place`
      setState('busy');
      try {
        const { data, error } = await sb.functions.invoke('place', { body: { url } });
        if (error || !data) throw error ?? new Error('sin respuesta');
        r = { name: data.name ?? null, lat: data.lat ?? null, lng: data.lng ?? null };
      } catch {
        done.current = ''; // que volver a tocar el link reintente
        if (cur.current.url.trim() === url) setState('fail');
        return;
      }
    }
    const d = cur.current;
    if (d.url.trim() !== url) return; // pegó otro link mientras buscábamos
    const mine = !d.name.trim() || d.name === auto.current; // el nombre es nuestro (o está vacío): se puede reemplazar
    const name = mine && r.name ? r.name.slice(0, 80) : d.name;
    if (mine && r.name) auto.current = name;
    onDraft({ ...d, name, lat: r.lat, lng: r.lng });
    setState(r.name || r.lat != null ? 'ok' : 'fail');
  };

  const onUrl = (e: Event) => {
    const url = (e.target as HTMLInputElement).value;
    onDraft({ ...draft, url, lat: null, lng: null });
    clearTimeout(timer.current);
    setState('');
    const t = url.trim();
    if (t && t !== done.current && isMapsUrl(t)) timer.current = setTimeout(() => lookup(t), 500) as unknown as number;
  };

  const url = draft.url.trim();
  return (
    <div class="venue-new">
      <label class="field"><span>Link de Google Maps</span>
        <input type="url" inputMode="url" autocomplete="off" autocapitalize="none" spellcheck={false} maxLength={1000}
          placeholder="https://maps.app.goo.gl/…" value={draft.url} onInput={onUrl} />
      </label>
      <p class="muted venue-hint" aria-live="polite">
        {state === 'busy' ? 'Buscando el lugar en Google Maps…'
          : state === 'ok' ? 'Listo, encontramos el lugar. Revisá el nombre.'
          : state === 'fail' ? 'No pudimos leer ese link. Cargá el nombre a mano.'
          : url && !isMapsUrl(url) ? 'Tiene que ser un link de Google Maps (https://maps.app.goo.gl/…).'
          : 'En Google Maps tocá Compartir y copiá el link.'}
      </p>
      <label class="field"><span>Nombre</span>
        <input value={draft.name} maxLength={80} placeholder="Ej: Doble 5 Fútbol Urbano"
          onInput={e => onDraft({ ...draft, name: (e.target as HTMLInputElement).value })} />
      </label>
      <label class="field"><span>Dirección (opcional)</span>
        <input value={draft.address} maxLength={160} placeholder="Calle y número, barrio…"
          onInput={e => onDraft({ ...draft, address: (e.target as HTMLInputElement).value })} />
      </label>
    </div>
  );
}

/**
 * Selector de cancha del formulario de partido: ninguna, una guardada o "Nueva cancha…".
 * Al elegir "Nueva cancha…" aparecen los campos de VenueNewFields.
 */
export function VenueField({ venues, value, onChange, draft, onDraft }: {
  venues: Venue[]; value: string; onChange: (v: string) => void;
  draft: VenueDraft; onDraft: (d: VenueDraft) => void;
}) {
  return (
    <>
      <label class="field"><span>Cancha</span>
        <select value={value} onChange={e => onChange((e.target as HTMLSelectElement).value)}>
          <option value="">Sin cancha guardada</option>
          {venues.map(v => <option value={v.id}>{v.name}</option>)}
          <option value={NEW_VENUE}>➕ Nueva cancha…</option>
        </select>
      </label>
      {value === NEW_VENUE && <VenueNewFields draft={draft} onDraft={onDraft} />}
    </>
  );
}
