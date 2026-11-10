import { useState } from 'preact/hooks';
import { GeoError, currentPosition, nameForPosition } from '../zone/geo';
import { geoErrorText, isUnnamed } from '../zone/model';
import { usePlaceSearch } from '../zone/useZone';
import { isMapsUrl, parseMapsUrl } from '../venues/maps';
import { resolvePlace } from './api';
import type { ComplexDraft } from './model';

/**
 * Dónde queda el complejo: barrio o ciudad (Open-Meteo, solo Argentina) o el celular, la dirección escrita y, para ubicarlo
 * con precisión, un link de Google Maps. Es un campo controlado: no guarda nada. Reusa los estilos `zn-*` de la zona.
 */
export function PlaceField({ draft, onChange, disabled = false }: {
  draft: ComplexDraft; onChange: (patch: Partial<ComplexDraft>) => void; disabled?: boolean;
}) {
  const hasPlace = draft.lat !== null && draft.lng !== null;
  const [changing, setChanging] = useState(false);
  const [q, setQ] = useState('');
  const [locating, setLocating] = useState(false);
  const [geoErr, setGeoErr] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkMsg, setLinkMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const search = usePlaceSearch(q);
  const searching = !hasPlace || changing;

  const pick = (label: string, lat: number, lng: number) => {
    onChange({ city: label, lat, lng });
    setChanging(false); setQ(''); setGeoErr('');
  };
  const useMyLocation = async () => {
    setLocating(true); setGeoErr('');
    try {
      const { lat, lng } = await currentPosition();
      const name = await nameForPosition(lat, lng);
      pick(isUnnamed(name) ? '' : name, lat, lng);
    } catch (e) { setGeoErr(geoErrorText(e instanceof GeoError ? e.code : undefined)); }
    setLocating(false);
  };

  const applyLink = async () => {
    const url = draft.maps_url.trim();
    setLinkMsg(null);
    if (!url) return;
    if (!isMapsUrl(url)) { setLinkMsg({ ok: false, text: 'Pegá un link de Google Maps (https://maps.app.goo.gl/… o https://www.google.com/maps/…).' }); return; }
    const p = parseMapsUrl(url);
    if (p.lat !== null && p.lng !== null) { onChange({ lat: p.lat, lng: p.lng }); setLinkMsg({ ok: true, text: 'Listo: ubicamos el complejo con el link.' }); return; }
    setLinkBusy(true);
    try {
      const r = await resolvePlace(url);
      if (r.lat !== null && r.lng !== null) { onChange({ lat: r.lat, lng: r.lng }); setLinkMsg({ ok: true, text: 'Listo: ubicamos el complejo con el link.' }); }
      else setLinkMsg({ ok: false, text: 'No pudimos sacar la ubicación de ese link. Probá con otro o buscá tu barrio arriba.' });
    } catch { setLinkMsg({ ok: false, text: 'No pudimos abrir ese link ahora. Probá de nuevo en un rato.' }); }
    setLinkBusy(false);
  };

  return (
    <div class="ow-place">
      <div class="zn-picker">
        {hasPlace && !changing && (
          <div class="zn-current">
            <span class="zn-pin" aria-hidden="true">📍</span>
            <div class="zn-current-copy">
              <b class="ellipsis">{draft.city || 'Ubicación cargada'}</b>
              <small class="muted">Así te encuentran en el buscador de canchas</small>
            </div>
            <button type="button" class="btn sm" disabled={disabled} onClick={() => setChanging(true)}>Cambiar</button>
          </div>
        )}
        {searching && (
          <div class="zn-search">
            <label class="field" style="margin-bottom:8px"><span>Barrio o ciudad del complejo</span>
              <input type="search" value={q} maxLength={60} placeholder="Palermo, Quilmes, Rosario…" autoComplete="off" enterKeyHint="search"
                disabled={disabled} onInput={e => setQ((e.target as HTMLInputElement).value)} /></label>
            {search.loading && <p class="muted zn-hint" role="status">Buscando…</p>}
            {search.err && <p class="err zn-hint" role="alert">No pudimos buscar ahora. Revisá la conexión o usá tu ubicación.</p>}
            {search.done && !search.items.length && <p class="muted zn-hint" role="status">No encontramos «{q.trim()}». Probá con otro barrio o con la ciudad.</p>}
            {search.items.length > 0 && (
              <ul class="zn-results" aria-label="Resultados">
                {search.items.map(p => (
                  <li><button type="button" disabled={disabled} onClick={() => pick(p.label, p.lat, p.lng)}>
                    <span aria-hidden="true">📍</span>
                    <span class="zn-res-copy"><b class="ellipsis">{p.label}</b>{p.detail && <small class="muted ellipsis">{p.detail}</small>}</span>
                  </button></li>
                ))}
              </ul>
            )}
            <div class="zn-or"><span>o</span></div>
            <button type="button" class="btn block zn-locate" disabled={disabled || locating} onClick={useMyLocation}>
              {locating ? 'Buscando tu ubicación…' : '📍 Estoy acá: usar mi ubicación'}
            </button>
            {geoErr && <p class="err zn-hint" role="alert">{geoErr}</p>}
            <p class="zn-credit muted">
              Búsqueda: <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a> · Nombres de barrios: © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>
            </p>
            {hasPlace && <button type="button" class="linkbtn zn-cancel" onClick={() => { setChanging(false); setQ(''); setGeoErr(''); }}>Cancelar</button>}
          </div>
        )}
      </div>

      <label class="field"><span>Dirección <span class="muted">(calle y número)</span></span>
        <input value={draft.address} maxLength={160} placeholder="Av. Siempre Viva 742" autoComplete="street-address" disabled={disabled}
          onInput={e => onChange({ address: (e.target as HTMLInputElement).value })} /></label>

      <label class="field"><span>Link de Google Maps <span class="muted">(opcional: ubica el complejo con precisión)</span></span>
        <div class="ow-inline">
          <input type="url" inputMode="url" value={draft.maps_url} maxLength={1000} placeholder="https://maps.app.goo.gl/…" disabled={disabled}
            onInput={e => { onChange({ maps_url: (e.target as HTMLInputElement).value }); setLinkMsg(null); }}
            onBlur={() => { if (draft.maps_url.trim()) void applyLink(); }} />
          <button type="button" class="btn sm" disabled={disabled || linkBusy || !draft.maps_url.trim()} onClick={() => void applyLink()}>
            {linkBusy ? 'Ubicando…' : 'Ubicar'}
          </button>
        </div></label>
      {linkMsg && <p class={linkMsg.ok ? 'ow-ok' : 'err'} role="status">{linkMsg.text}</p>}
    </div>
  );
}
