import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeoError, currentPosition, geocodeUrl, nameForPosition, reverseUrl, searchPlaces } from './geo';
import { UNNAMED_ZONE } from './model';

const reply = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body }) as unknown as Response;

afterEach(() => { vi.unstubAllGlobals(); });

describe('URLs', () => {
  it('geocoding: Argentina (countryCode), en español, 6 resultados y el texto codificado', () => {
    const u = new URL(geocodeUrl('  Villa Crespo '));
    expect(u.origin + u.pathname).toBe('https://geocoding-api.open-meteo.com/v1/search');
    expect(u.searchParams.get('name')).toBe('Villa Crespo');
    expect(u.searchParams.get('countryCode')).toBe('AR');
    expect(u.searchParams.get('language')).toBe('es');
    expect(u.searchParams.get('count')).toBe('6');
    expect(geocodeUrl('Ñuñoa & Co')).toContain('name=%C3%91u%C3%B1oa%20%26%20Co');
  });
  it('reverse: usa lo que se le pasa', () => {
    const u = new URL(reverseUrl(-34.59, -58.43));
    expect(u.hostname).toBe('nominatim.openstreetmap.org');
    expect(u.searchParams.get('lat')).toBe('-34.59');
    expect(u.searchParams.get('lon')).toBe('-58.43');
    expect(u.searchParams.get('accept-language')).toBe('es');
  });
});

describe('searchPlaces', () => {
  const body = { results: [{ name: 'Palermo', latitude: -34.58856, longitude: -58.43053, admin1: 'Ciudad Autónoma de Buenos Aires', admin2: 'Comuna 14' }] };
  it('devuelve lugares con coordenadas redondeadas', async () => {
    const f = vi.fn(async () => reply(body));
    const l = await searchPlaces('Palermo', { fetch: f as any });
    expect(l).toEqual([{ label: 'Palermo, CABA', detail: 'Comuna 14', lat: -34.59, lng: -58.43 }]);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('con menos de 2 letras no pide nada', async () => {
    const f = vi.fn();
    expect(await searchPlaces(' a ', { fetch: f as any })).toEqual([]);
    expect(f).not.toHaveBeenCalled();
  });
  it('sin resultados es lista vacía; si el servicio falla, tira error (la pantalla avisa)', async () => {
    expect(await searchPlaces('zzzz', { fetch: (async () => reply({ generationtime_ms: 0.2 })) as any })).toEqual([]);
    await expect(searchPlaces('Palermo', { fetch: (async () => reply({}, false)) as any })).rejects.toThrow();
    await expect(searchPlaces('Palermo', { fetch: (async () => { throw new Error('offline'); }) as any })).rejects.toThrow('offline');
  });
});

describe('nameForPosition (privacidad: al servicio de mapas solo llega la ubicación gruesa)', () => {
  it('redondea antes de pedir el nombre y devuelve el barrio', async () => {
    const f = vi.fn(async (_url: string) => reply({ address: { suburb: 'Palermo', city: 'Buenos Aires' } }));
    expect(await nameForPosition(-34.588561234, -58.430539876, { fetch: f as any })).toBe('Palermo, Buenos Aires');
    const u = new URL(f.mock.calls[0][0]);
    expect(u.searchParams.get('lat')).toBe('-34.59');
    expect(u.searchParams.get('lon')).toBe('-58.43');
  });
  it('si no se puede, "Zona sin nombre" y nunca tira', async () => {
    expect(await nameForPosition(-34.6, -58.4, { fetch: (async () => reply({}, false)) as any })).toBe(UNNAMED_ZONE);
    expect(await nameForPosition(-34.6, -58.4, { fetch: (async () => { throw new Error('offline'); }) as any })).toBe(UNNAMED_ZONE);
    expect(await nameForPosition(-34.6, -58.4, { fetch: (async () => reply({ error: 'Unable to geocode' })) as any })).toBe(UNNAMED_ZONE);
  });
});

describe('currentPosition', () => {
  it('devuelve la ubicación YA redondeada: la fina no sale de acá', async () => {
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: (ok: any) => ok({ coords: { latitude: -34.58856123, longitude: -58.43053456 } }) } });
    expect(await currentPosition()).toEqual({ lat: -34.59, lng: -58.43 });
  });
  it('errores del navegador con su código', async () => {
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: (_ok: any, ko: any) => ko({ code: 1 }) } });
    await expect(currentPosition()).rejects.toMatchObject({ code: 1 });
    await expect(currentPosition()).rejects.toBeInstanceOf(GeoError);
  });
  it('sin geolocalización disponible', async () => {
    vi.stubGlobal('navigator', {});
    await expect(currentPosition()).rejects.toMatchObject({ code: 2 });
  });
});
