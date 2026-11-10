import { useState } from 'preact/hooks';
import { GeoError, currentPosition, nameForPosition } from './geo';
import { PRIVACY_NOTE, geoErrorText, isUnnamed, type ZoneDraft } from './model';
import { usePlaceSearch } from './useZone';

/**
 * "¿Dónde jugás?": buscar el barrio o usar la ubicación del celular, y decidir si aparecer en el ranking de la zona.
 * Es un campo controlado (no guarda nada): quien lo usa (perfil, primera ficha o la pantalla del ranking) guarda `value`.
 * Participar es opt-in: la zona recién elegida arranca SIN aparecer. Solo se guarda una ubicación gruesa (~1 km).
 */
export function ZonePicker({ value, onChange, disabled = false }: { value: ZoneDraft | null; onChange: (z: ZoneDraft | null) => void; disabled?: boolean }) {
  const [changing, setChanging] = useState(false);
  const [q, setQ] = useState('');
  const [locating, setLocating] = useState(false);
  const [geoErr, setGeoErr] = useState('');
  const search = usePlaceSearch(q);
  const searching = !value || changing;

  const pick = (label: string, lat: number, lng: number) => {
    onChange({ label, lat, lng, public: value?.public ?? false });
    setChanging(false); setQ(''); setGeoErr('');
  };

  const useMyLocation = async () => {
    setLocating(true); setGeoErr('');
    try {
      const { lat, lng } = await currentPosition();
      pick(await nameForPosition(lat, lng), lat, lng);
    } catch (e) {
      setGeoErr(geoErrorText(e instanceof GeoError ? e.code : undefined));
    }
    setLocating(false);
  };

  return (
    <div class="zn-picker">
      {value && !changing && (
        <div class="zn-current">
          <span class="zn-pin" aria-hidden="true">📍</span>
          <div class="zn-current-copy">
            <b class="ellipsis">{isUnnamed(value.label) ? 'Tu ubicación (sin nombre de barrio)' : value.label}</b>
            <small class="muted">Ubicación aproximada, a ~1 km</small>
          </div>
          <button type="button" class="btn sm" disabled={disabled} onClick={() => setChanging(true)}>Cambiar</button>
          <button type="button" class="btn sm" disabled={disabled} onClick={() => onChange(null)}>Quitar</button>
        </div>
      )}

      {searching && (
        <div class="zn-search">
          <label class="field" style="margin-bottom:8px"><span>Tu barrio o ciudad</span>
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
            {locating ? 'Buscando tu ubicación…' : '📍 Usar mi ubicación'}
          </button>
          {geoErr && <p class="err zn-hint" role="alert">{geoErr}</p>}
          <p class="zn-credit muted">
            Búsqueda: <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a> · Nombres de barrios: © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>
          </p>
          {value && <button type="button" class="linkbtn zn-cancel" onClick={() => { setChanging(false); setQ(''); setGeoErr(''); }}>Cancelar</button>}
        </div>
      )}

      {value && (
        <label class="zn-switch">
          <input type="checkbox" role="switch" checked={value.public} disabled={disabled}
            onChange={e => onChange({ ...value, public: (e.target as HTMLInputElement).checked })} />
          <span class="zn-track" aria-hidden="true"><i /></span>
          <span class="zn-switch-copy">
            <b>Aparecer en el ranking de mi zona</b>
            <small class="muted">{value.public ? 'Los jugadores de tu zona te van a ver en el ranking.' : 'Ahora no aparecés, pero igual podés ver el ranking.'}</small>
          </span>
        </label>
      )}
      <p class="zn-privacy muted"><span aria-hidden="true">🔒</span> {PRIVACY_NOTE}</p>
    </div>
  );
}
