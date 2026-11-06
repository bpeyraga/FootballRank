import { describe, expect, it } from 'vitest';
import { directionsUrl, embedUrl, isMapsUrl, mapUrl, parseMapsUrl } from './maps';

const LONG = 'https://www.google.com/maps/place/Doble+5+F%C3%BAtbol+Urbano/@-34.1712614,-58.9721262,17z/data=!3m1!4b1!4m6!3m5!1s0x95bb73cc5520c8af:0x6006ad26e1da02d2!8m2!3d-34.1712614!4d-58.9695513!16s%2Fg%2F11abc?entry=ttu';

describe('parseMapsUrl', () => {
  it('saca nombre y el punto exacto (!3d!4d) del link largo', () => {
    expect(parseMapsUrl(LONG)).toEqual({ name: 'Doble 5 Fútbol Urbano', lat: -34.1712614, lng: -58.9695513 });
  });
  it('si no hay !3d!4d usa el @lat,lng del centro del mapa', () => {
    const r = parseMapsUrl('https://www.google.com/maps/place/Cancha+Norte/@-34.6,-58.4,17z');
    expect(r).toEqual({ name: 'Cancha Norte', lat: -34.6, lng: -58.4 });
  });
  it('decodifica tildes y deja pasar un "+" codificado como %2B', () => {
    expect(parseMapsUrl('https://www.google.com/maps/place/F%C3%BAtbol+5+%2B+Bar/@1,2,15z').name).toBe('Fútbol 5 + Bar');
  });
  it('entiende ?q=lat,lng y ?query=lat,lng', () => {
    expect(parseMapsUrl('https://maps.google.com/?q=-34.5,-58.5')).toEqual({ name: null, lat: -34.5, lng: -58.5 });
    expect(parseMapsUrl('https://www.google.com/maps/search/?api=1&query=-34.5%2C-58.5'))
      .toEqual({ name: null, lat: -34.5, lng: -58.5 });
  });
  it('un ?q= con texto sirve de nombre', () => {
    expect(parseMapsUrl('https://www.google.com/maps?q=Cancha+El+Gol')).toEqual({ name: 'Cancha El Gol', lat: null, lng: null });
  });
  it('un pin con coordenadas como "nombre" no devuelve nombre', () => {
    expect(parseMapsUrl('https://www.google.com/maps/place/-34.17,-58.97')).toEqual({ name: null, lat: -34.17, lng: -58.97 });
  });
  it('descarta coordenadas fuera de rango y links rotos', () => {
    expect(parseMapsUrl('https://maps.google.com/?q=999,999')).toEqual({ name: null, lat: null, lng: null });
    expect(parseMapsUrl('no es un link')).toEqual({ name: null, lat: null, lng: null });
  });
});

describe('isMapsUrl', () => {
  it('acepta solo links de Google Maps por https', () => {
    for (const ok of ['https://maps.app.goo.gl/mZcAvCZdY8APXmVz9', 'https://goo.gl/maps/abc', LONG,
      'https://maps.google.com/?q=1,2', 'https://www.google.com.ar/maps/place/X']) expect(isMapsUrl(ok)).toBe(true);
    for (const bad of ['http://maps.app.goo.gl/x', 'https://evil.com/maps/place/x', 'https://google.com.evil.com/maps/x',
      'https://www.google.com/search?q=maps', 'https://goo.gl/other', 'https://user:pw@maps.app.goo.gl/x',
      'https://maps.app.goo.gl:8443/x', 'javascript:alert(1)', '']) expect(isMapsUrl(bad)).toBe(false);
  });
});

describe('embedUrl / directionsUrl', () => {
  const withCoords = { name: 'Doble 5', address: null, lat: -34.17, lng: -58.97 };
  const noCoords = { name: 'Doble 5 & Co', address: 'Av. Siempreviva 742', lat: null, lng: null };
  it('con coordenadas usa lat,lng', () => {
    expect(embedUrl(withCoords)).toBe('https://maps.google.com/maps?q=-34.17,-58.97&z=16&output=embed');
    expect(directionsUrl(withCoords)).toBe('https://www.google.com/maps/dir/?api=1&destination=-34.17,-58.97');
  });
  it('sin coordenadas busca por nombre y dirección, codificado', () => {
    expect(embedUrl(noCoords)).toBe('https://maps.google.com/maps?q=Doble%205%20%26%20Co%20Av.%20Siempreviva%20742&z=16&output=embed');
    expect(directionsUrl(noCoords)).toBe('https://www.google.com/maps/dir/?api=1&destination=Doble%205%20%26%20Co%20Av.%20Siempreviva%20742');
  });
  it('mapUrl usa el link guardado o, si no hay, una búsqueda', () => {
    expect(mapUrl({ ...withCoords, maps_url: 'https://maps.app.goo.gl/x' })).toBe('https://maps.app.goo.gl/x');
    expect(mapUrl({ ...withCoords, maps_url: null })).toBe('https://www.google.com/maps/search/?api=1&query=-34.17,-58.97');
    expect(mapUrl(noCoords)).toBe('https://www.google.com/maps/search/?api=1&query=Doble%205%20%26%20Co%20Av.%20Siempreviva%20742');
  });
  it('sin dirección busca solo por nombre', () => {
    expect(embedUrl({ ...noCoords, address: null })).toBe('https://maps.google.com/maps?q=Doble%205%20%26%20Co&z=16&output=embed');
  });
});
