import { useEffect, useState } from 'preact/hooks';
import { inForecastWindow, loadWeather, weatherText, wmo, type Weather } from './weather';

/** Chip del clima a la hora del partido ("⛅ 18° · 20% lluvia · viento 12 km/h"). Si no hay pronóstico, no se ve nada. */
export function WeatherChip({ lat, lng, startsAt }: { lat: number | null | undefined; lng: number | null | undefined; startsAt: string }) {
  const [w, setW] = useState<Weather | null>(null);
  const ok = lat != null && lng != null && inForecastWindow(startsAt);
  useEffect(() => {
    setW(null);
    if (!ok) return;
    let dead = false;
    loadWeather(lat!, lng!, startsAt).then(r => { if (!dead) setW(r); });
    return () => { dead = true; };
  }, [ok, lat, lng, startsAt]);
  if (!ok || !w) return null;
  const { emoji, label } = wmo(w.code);
  return (
    <p class="wx-chip" title={`Pronóstico: ${label}`} aria-label={`Pronóstico: ${label}, ${weatherText(w)}`}>
      <span class="wx-ico" aria-hidden="true">{emoji}</span>
      <span>{weatherText(w)}</span>
    </p>
  );
}
