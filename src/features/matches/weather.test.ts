import { describe, expect, it, vi } from 'vitest';
import {
  WX_TTL, cacheKey, forecastUrl, hourKey, inForecastWindow, loadWeather, pickHour, readCache, weatherText, wmo, writeCache, type Weather,
} from './weather';

const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m }; };
const HOURLY = {
  time: ['2026-11-12T20:00', '2026-11-12T21:00', '2026-11-12T22:00'],
  temperature_2m: [19.4, 18.4, 17],
  precipitation_probability: [10, 20, 60],
  weathercode: [1, 2, 63],
  windspeed_10m: [8, 12.3, 15],
};

describe('wmo', () => {
  it('emoji y descripción por código', () => {
    expect(wmo(0)).toEqual({ emoji: '☀️', label: 'Despejado' });
    expect(wmo(2).emoji).toBe('⛅');
    expect(wmo(3).label).toBe('Nublado');
    expect(wmo(45).emoji).toBe('🌫️');
    expect(wmo(53).label).toBe('Llovizna');
    expect(wmo(63).emoji).toBe('🌧️');
    expect(wmo(75).emoji).toBe('🌨️');
    expect(wmo(81).emoji).toBe('🌦️');
    expect(wmo(95).emoji).toBe('⛈️');
    expect(wmo(99).label).toBe('Tormenta con granizo');
  });
  it('un código desconocido no rompe', () => {
    expect(wmo(1234).emoji).toBe('🌡️');
  });
});

describe('weatherText', () => {
  it('temperatura, lluvia y viento redondeados', () => {
    expect(weatherText({ code: 2, temp: 18.4, rain: 20, wind: 12.3 })).toBe('18° · 20% lluvia · viento 12 km/h');
    expect(weatherText({ code: 2, temp: 17.5, rain: 0, wind: 0 })).toBe('18° · 0% lluvia · viento 0 km/h');
  });
  it('omite lo que falta', () => {
    expect(weatherText({ code: 0, temp: 21, rain: null, wind: null })).toBe('21°');
    expect(weatherText({ code: 0, temp: 21, rain: 5, wind: null })).toBe('21° · 5% lluvia');
  });
});

describe('hourKey', () => {
  it('pasa el instante a la hora de Buenos Aires (UTC-3), en punto', () => {
    expect(hourKey('2026-11-13T00:00:00Z')).toBe('2026-11-12T21:00');
    expect(hourKey('2026-11-13T00:45:00Z')).toBe('2026-11-12T21:00');
  });
  it('cruza de día y de año', () => {
    expect(hourKey('2026-11-13T02:30:00Z')).toBe('2026-11-12T23:00');
    expect(hourKey('2026-11-13T03:00:00Z')).toBe('2026-11-13T00:00');
    expect(hourKey('2027-01-01T01:00:00Z')).toBe('2026-12-31T22:00');
  });
  it('fecha inválida', () => {
    expect(hourKey('nada')).toBeNull();
  });
});

describe('pickHour', () => {
  it('toma la hora pedida', () => {
    expect(pickHour(HOURLY, '2026-11-12T21:00')).toEqual({ code: 2, temp: 18.4, rain: 20, wind: 12.3 });
  });
  it('hora que no está, o respuesta rara: null', () => {
    expect(pickHour(HOURLY, '2026-11-12T23:00')).toBeNull();
    expect(pickHour(null, 'x')).toBeNull();
    expect(pickHour({}, 'x')).toBeNull();
    expect(pickHour({ time: ['a'], temperature_2m: [null], weathercode: [1] }, 'a')).toBeNull();
  });
  it('lluvia y viento opcionales', () => {
    expect(pickHour({ time: ['a'], temperature_2m: [10], weathercode: [3] }, 'a')).toEqual({ code: 3, temp: 10, rain: null, wind: null });
  });
});

describe('inForecastWindow', () => {
  const now = Date.UTC(2026, 10, 6, 15, 0);
  it('desde 3 h atrás hasta 7 días adelante', () => {
    expect(inForecastWindow(new Date(now + 3600e3).toISOString(), now)).toBe(true);
    expect(inForecastWindow(new Date(now - 2 * 3600e3).toISOString(), now)).toBe(true);
    expect(inForecastWindow(new Date(now + 7 * 864e5).toISOString(), now)).toBe(true);
  });
  it('fuera de la ventana o inválida', () => {
    expect(inForecastWindow(new Date(now - 4 * 3600e3).toISOString(), now)).toBe(false);
    expect(inForecastWindow(new Date(now + 7 * 864e5 + 1000).toISOString(), now)).toBe(false);
    expect(inForecastWindow('nada', now)).toBe(false);
  });
});

describe('forecastUrl', () => {
  it('lleva coordenadas, variables por hora, zona y 8 días', () => {
    const u = new URL(forecastUrl(-34.6, -58.4));
    expect(u.origin + u.pathname).toBe('https://api.open-meteo.com/v1/forecast');
    expect(u.searchParams.get('latitude')).toBe('-34.6');
    expect(u.searchParams.get('longitude')).toBe('-58.4');
    expect(u.searchParams.get('hourly')).toBe('temperature_2m,precipitation_probability,weathercode,windspeed_10m');
    expect(u.searchParams.get('timezone')).toBe('America/Argentina/Buenos_Aires');
    expect(u.searchParams.get('forecast_days')).toBe('8');
    expect(forecastUrl(1, 2)).toContain('timezone=America%2FArgentina%2FBuenos_Aires');
  });
});

describe('caché', () => {
  const w: Weather = { code: 2, temp: 18, rain: 20, wind: 12 };
  it('guarda y devuelve dentro de los 30 minutos, y vence después', () => {
    const s = mem(), k = cacheKey(-34.6, -58.4, '2026-11-12T21:00');
    writeCache(s, k, w, 1000);
    expect(readCache(s, k, 1000 + WX_TTL - 1)).toEqual(w);
    expect(readCache(s, k, 1000 + WX_TTL)).toBeNull();
  });
  it('clave distinta por cancha y por hora', () => {
    expect(cacheKey(-34.6, -58.4, 'a')).not.toBe(cacheKey(-34.7, -58.4, 'a'));
    expect(cacheKey(-34.6, -58.4, 'a')).not.toBe(cacheKey(-34.6, -58.4, 'b'));
  });
  it('sin storage, con basura o que tira error: no rompe', () => {
    expect(readCache(null, 'k')).toBeNull();
    const s = mem(); s.setItem('k', '{no es json');
    expect(readCache(s, 'k')).toBeNull();
    expect(() => writeCache({ getItem: () => null, setItem: () => { throw new Error('lleno'); } }, 'k', w)).not.toThrow();
  });
});

describe('loadWeather', () => {
  const now = Date.UTC(2026, 10, 6, 15, 0);
  const startsAt = '2026-11-13T00:00:00Z'; // 21:00 en Buenos Aires, a 6 días
  const ok = (data: unknown) => vi.fn(async () => ({ ok: true, json: async () => data }) as any);

  it('baja el pronóstico, elige la hora del partido y lo guarda', async () => {
    const f = ok({ hourly: HOURLY }), storage = mem();
    expect(await loadWeather(-34.6, -58.4, startsAt, { fetch: f, storage, now })).toEqual({ code: 2, temp: 18.4, rain: 20, wind: 12.3 });
    expect(f).toHaveBeenCalledTimes(1);
    // segunda vez: sale del caché, sin red
    expect((await loadWeather(-34.6, -58.4, startsAt, { fetch: f, storage, now: now + 60e3 }))?.temp).toBe(18.4);
    expect(f).toHaveBeenCalledTimes(1);
    // vencido el caché: vuelve a pedir
    await loadWeather(-34.6, -58.4, startsAt, { fetch: f, storage, now: now + WX_TTL + 1 });
    expect(f).toHaveBeenCalledTimes(2);
  });
  it('fuera de la ventana no pide nada', async () => {
    const f = ok({ hourly: HOURLY });
    expect(await loadWeather(-34.6, -58.4, '2026-12-30T00:00:00Z', { fetch: f, storage: null, now })).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
  it('falla en silencio: red caída, HTTP de error, JSON raro u hora ausente', async () => {
    expect(await loadWeather(1, 2, startsAt, { fetch: vi.fn(async () => { throw new Error('offline'); }), storage: null, now })).toBeNull();
    expect(await loadWeather(1, 2, startsAt, { fetch: vi.fn(async () => ({ ok: false }) as any), storage: null, now })).toBeNull();
    expect(await loadWeather(1, 2, startsAt, { fetch: ok({ nada: 1 }), storage: null, now })).toBeNull();
    expect(await loadWeather(1, 2, startsAt, { fetch: ok({ hourly: { ...HOURLY, time: ['2026-11-20T21:00'] } }), storage: null, now })).toBeNull();
  });
});
