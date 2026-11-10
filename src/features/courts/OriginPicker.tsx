import { useState } from 'preact/hooks';
import { GeoError, currentPosition, nameForPosition } from '../zone/geo';
import { geoErrorText, isUnnamed } from '../zone/model';
import { usePlaceSearch } from '../zone/useZone';
import type { Origin } from './model';

/**
 * "¿Desde dónde buscás?": un barrio o ciudad (Open-Meteo), la ubicación del celular o mi zona guardada.
 * Es un campo controlado: no guarda nada en la base; quien lo usa recibe el lugar elegido en `onPick`.
 * La ubicación del celular llega redondeada a ~1 km (zone/geo.ts), igual que en el resto de la app.
 */
export function OriginPicker({ zone, onPick, onCancel }: { zone: Origin | null; onPick: (o: Origin) => void; onCancel?: () => void }) {
  const [q, setQ] = useState('');
  const [locating, setLocating] = useState(false);
  const [geoErr, setGeoErr] = useState('');
  const search = usePlaceSearch(q);

  const useMyLocation = async () => {
    setLocating(true); setGeoErr('');
    try {
      const { lat, lng } = await currentPosition();
      const name = await nameForPosition(lat, lng);
      onPick({ label: isUnnamed(name) ? 'Cerca tuyo' : name, lat, lng, source: 'gps' });
    } catch (e) {
      setGeoErr(geoErrorText(e instanceof GeoError ? e.code : undefined));
    }
    setLocating(false);
  };

  return (
    <div class="cn-origin">
      <label class="cn-search">
        <span class="cn-search-ico" aria-hidden="true">🔎</span>
        <input type="search" value={q} maxLength={60} placeholder="Barrio o ciudad: Palermo, Quilmes, Rosario…" autoComplete="off" enterKeyHint="search"
          aria-label="Barrio o ciudad" onInput={e => setQ((e.target as HTMLInputElement).value)} />
      </label>
      {search.loading && <p class="cn-hint" role="status">Buscando…</p>}
      {search.err && <p class="cn-hint cn-hint-err" role="alert">No pudimos buscar ahora. Revisá la conexión o usá tu ubicación.</p>}
      {search.done && !search.items.length && <p class="cn-hint" role="status">No encontramos «{q.trim()}». Probá con otro barrio o con la ciudad.</p>}
      {search.items.length > 0 && (
        <ul class="cn-places" aria-label="Resultados">
          {search.items.map(p => (
            <li><button type="button" onClick={() => onPick({ label: p.label, lat: p.lat, lng: p.lng, source: 'search' })}>
              <span aria-hidden="true">📍</span>
              <span class="cn-res-copy"><b class="ellipsis">{p.label}</b>{p.detail && <small class="ellipsis">{p.detail}</small>}</span>
            </button></li>
          ))}
        </ul>
      )}
      <div class="cn-origin-btns">
        <button type="button" class="cn-chip-btn" disabled={locating} onClick={useMyLocation}>{locating ? 'Buscando tu ubicación…' : '📍 Usar mi ubicación'}</button>
        {zone && <button type="button" class="cn-chip-btn" onClick={() => onPick(zone)}>🏠 Mi zona · {zone.label}</button>}
        {onCancel && <button type="button" class="cn-chip-btn ghost" onClick={onCancel}>Cancelar</button>}
      </div>
      {geoErr && <p class="cn-hint cn-hint-err" role="alert">{geoErr}</p>}
      <p class="cn-credit">
        Búsqueda: <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a> · Nombres de barrios: © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>
      </p>
    </div>
  );
}
