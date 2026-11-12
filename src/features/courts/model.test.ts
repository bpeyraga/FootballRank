import { describe, expect, it } from 'vitest';
import {
  RADII, bookingErrorText, bookingMinutes, bookingPrice, bookingWhen, canCancel, cancelledByComplex, canUseForMatch, contactWhatsapp, countByRadius, filterComplexes, fmtKm, fmtPrice, isMissingCourts,
  nextBooking, parseOrigin, placeLine, priceFrom, sizeLabel, sizesLine, splitBookings, startsDiffer, statusLabel, surfaceLabel, telUrl, whatsappUrl, whenLocal, widerRadius,
  type ComplexRow, type MyBooking,
} from './model';

const row = (id: string, km: number, sizes: number[], min_price: number | null = null): ComplexRow =>
  ({ id, name: id, address: null, city: null, lat: 0, lng: 0, photo_url: null, phone: null, km, sizes, min_price });

describe('textos', () => {
  it('fmtKm: metros abajo de 1 km, una coma hasta 10 y enteros después', () => {
    expect(fmtKm(0.4)).toBe('400 m');
    expect(fmtKm(0.04)).toBe('50 m');
    expect(fmtKm(1)).toBe('1 km');
    expect(fmtKm(1.3)).toBe('1,3 km');
    expect(fmtKm(9.96)).toBe('10 km');
    expect(fmtKm(12.4)).toBe('12 km');
    expect(fmtKm(null)).toBe('');
    expect(fmtKm(NaN)).toBe('');
    expect(fmtKm(-1)).toBe('');
  });
  it('fmtPrice agrupa los miles con punto, también los de 4 cifras', () => {
    expect(fmtPrice(12000)).toBe('$12.000');
    expect(fmtPrice(1500)).toBe('$1.500');
    expect(fmtPrice(800)).toBe('$800');
    expect(fmtPrice(1234567)).toBe('$1.234.567');
    expect(fmtPrice(12500.5)).toBe('$12.500,50');
    expect(fmtPrice(0)).toBe('$0');
    expect(fmtPrice(null)).toBe('');
  });
  it('priceFrom', () => {
    expect(priceFrom(12000)).toBe('Desde $12.000 / hora');
    expect(priceFrom(null)).toBe('Consultá el precio');
  });
  it('bookingPrice: por hora, igual que el servidor (a centavos)', () => {
    expect(bookingPrice(20000, 60)).toBe(20000);
    expect(bookingPrice(20000, 90)).toBe(30000);
    expect(bookingPrice(20000, 120)).toBe(40000);
    expect(bookingPrice(1000, 45)).toBe(750);
    expect(bookingPrice(1234.56, 90)).toBe(1851.84);
    expect(bookingPrice(null, 60)).toBeNull();
  });
  it('tamaños, superficie, dirección y estado', () => {
    expect(sizeLabel(7)).toBe('F7');
    expect(sizesLine([5, 7, 11])).toBe('F5 · F7 · F11');
    expect(surfaceLabel('sintetico')).toBe('Sintético');
    expect(surfaceLabel('otra')).toBe('otra');
    expect(placeLine({ address: ' Av. Siempreviva 742 ', city: 'Palermo' })).toBe('Av. Siempreviva 742, Palermo');
    expect(placeLine({ address: null, city: 'Palermo' })).toBe('Palermo');
    expect(placeLine({ address: null, city: null })).toBe('');
    expect(statusLabel('pending')).toBe('Pendiente');
    expect(statusLabel('confirmed')).toBe('Confirmada');
    expect(statusLabel('rejected')).toBe('Rechazada');
    expect(statusLabel('cancelled')).toBe('Cancelada');
  });
});

describe('teléfono', () => {
  it('telUrl deja dígitos y +', () => {
    expect(telUrl('+54 (11) 4444-5555')).toBe('tel:+541144445555');
  });
  it('whatsappUrl: solo celulares argentinos claros (con el 9 internacional o con el 15)', () => {
    expect(whatsappUrl('+54 9 11 5555 1234')).toBe('https://wa.me/5491155551234');
    expect(whatsappUrl('5491155551234')).toBe('https://wa.me/5491155551234');
    expect(whatsappUrl('011 15 5555-1234')).toBe('https://wa.me/5491155551234');
    expect(whatsappUrl('11 15 5555 1234')).toBe('https://wa.me/5491155551234');
    expect(whatsappUrl('(0221) 15-555-1234')).toBe('https://wa.me/5492215551234');
    expect(whatsappUrl('0351 15 612 3456')).toBe('https://wa.me/5493516123456');
  });
  it('whatsappUrl: un fijo (o algo dudoso) no genera link', () => {
    expect(whatsappUrl('011 4777-1234')).toBeNull();
    expect(whatsappUrl('4777-1234')).toBeNull();
    expect(whatsappUrl('11 5555 1234')).toBeNull(); // 10 cifras: puede ser fijo o celular sin el 15
    expect(whatsappUrl('011 5555-1234')).toBeNull();
    expect(whatsappUrl('0221 423-4567')).toBeNull();
    expect(whatsappUrl('+54 11 4777 1234')).toBeNull(); // con +54 pero sin el 9: no se sabe
    expect(whatsappUrl('+54 221 423 4567')).toBeNull();
    expect(whatsappUrl('+598 99 123 456')).toBeNull(); // otro país
  });
  it('whatsappUrl: con texto y sin número', () => {
    expect(whatsappUrl('+54 9 11 5555 1234', 'Hola, ¿hay turno?')).toBe('https://wa.me/5491155551234?text=Hola%2C%20%C2%BFhay%20turno%3F');
    expect(whatsappUrl(null)).toBeNull();
    expect(whatsappUrl('')).toBeNull();
    expect(whatsappUrl('123')).toBeNull();
    expect(whatsappUrl('+54 9 11 555')).toBeNull();
  });
});

describe('contactWhatsapp', () => {
  it('prefiere el WhatsApp cargado (solo dígitos, con código de país) y si no, deduce del teléfono', () => {
    expect(contactWhatsapp({ whatsapp: '5491155551234', phone: '4444-5555' })).toBe('https://wa.me/5491155551234'); // el WhatsApp cargado manda
    expect(contactWhatsapp({ whatsapp: '5491155551234' }, 'Hola')).toBe('https://wa.me/5491155551234?text=Hola');
    expect(contactWhatsapp({ whatsapp: null, phone: '011 15 5555-1234' })).toBe('https://wa.me/5491155551234');
    expect(contactWhatsapp({ whatsapp: null, phone: '011 4777-1234' })).toBeNull(); // un fijo no tiene WhatsApp
    expect(contactWhatsapp({ whatsapp: '', phone: '4555-8899' })).toBeNull();
    expect(contactWhatsapp({ whatsapp: '', phone: null })).toBeNull();
    expect(contactWhatsapp({})).toBeNull();
  });
});

describe('búsqueda', () => {
  const rows = [row('a', 0.6, [5]), row('b', 3.2, [5, 7]), row('c', 7, [8]), row('d', 18, [5, 11])];
  it('filtra por radio y tamaño', () => {
    expect(filterComplexes(rows, { km: 5, size: null }).map(r => r.id)).toEqual(['a', 'b']);
    expect(filterComplexes(rows, { km: 25, size: 5 }).map(r => r.id)).toEqual(['a', 'b', 'd']);
    expect(filterComplexes(rows, { km: 2, size: 7 })).toEqual([]);
    expect(filterComplexes(rows, { km: 25, size: null })).toHaveLength(4);
  });
  it('el radio incluye justo el borde', () => {
    expect(filterComplexes([row('x', 5, [5])], { km: 5, size: null })).toHaveLength(1);
  });
  it('countByRadius cuenta por cada radio (con el tamaño elegido)', () => {
    expect(RADII).toEqual([2, 5, 10, 25]);
    expect(countByRadius(rows, null)).toEqual({ 2: 1, 5: 2, 10: 3, 25: 4 });
    expect(countByRadius(rows, 5)).toEqual({ 2: 1, 5: 2, 10: 2, 25: 3 });
  });
  it('widerRadius: el primer radio más grande donde aparece algo', () => {
    expect(widerRadius(rows, 2, 7)).toBe(5);
    expect(widerRadius(rows, 5, 8)).toBe(10);
    expect(widerRadius(rows, 5, 11)).toBe(25);
    expect(widerRadius(rows, 25, null)).toBeNull();
    expect(widerRadius(rows, 10, 7)).toBeNull();
  });
});

describe('parseOrigin', () => {
  it('lee lo guardado', () => {
    expect(parseOrigin('{"label":" Palermo, CABA ","lat":-34.58,"lng":-58.43,"source":"gps"}')).toEqual({ label: 'Palermo, CABA', lat: -34.58, lng: -58.43, source: 'gps' });
    expect(parseOrigin('{"label":"X","lat":1,"lng":2}')!.source).toBe('search');
  });
  it('rechaza lo dañado o raro', () => {
    expect(parseOrigin(null)).toBeNull();
    expect(parseOrigin('')).toBeNull();
    expect(parseOrigin('no es json')).toBeNull();
    expect(parseOrigin('{"label":"","lat":1,"lng":2}')).toBeNull();
    expect(parseOrigin('{"label":"X","lat":"a","lng":2}')).toBeNull();
    expect(parseOrigin('{"label":"X","lat":91,"lng":2}')).toBeNull();
    expect(parseOrigin('{"label":"X","lat":1,"lng":181}')).toBeNull();
  });
});

describe('errores', () => {
  const t = (message: string) => bookingErrorText(new Error(message));
  it('traduce los códigos de las funciones de la base', () => {
    expect(t('slot_taken')).toMatch(/ya está reservado/);
    expect(t('duplicate key value violates exclusion constraint "bookings_no_overlap"')).toMatch(/ya está reservado/);
    expect(t('closed')).toMatch(/cerrado/);
    expect(t('past')).toMatch(/ya pasó/);
    expect(t('too_far')).toMatch(/60 días/);
    expect(t('bad_duration')).toMatch(/duración/);
    expect(t('bad_start')).toMatch(/en punto o y media/);
    expect(t('duplicate')).toMatch(/Ya pediste/);
    expect(t('not_editable')).toMatch(/ya no se puede modificar/);
    expect(t('not_confirmed')).toMatch(/todavía no está confirmada/);
    expect(t('no_field')).toMatch(/ya no está disponible/);
    expect(t('too_many_pending')).toMatch(/5 pedidos/);
    expect(t('not_active')).toMatch(/ya no está activa/);
    expect(t('forbidden')).toMatch(/permiso/);
    expect(t('Failed to fetch')).toMatch(/conexión/);
  });
  it('no confunde "past" con otras palabras', () => {
    expect(t('some pasta error')).toMatch(/No se pudo completar/);
  });
  it('lo desconocido queda en un mensaje amable (sin mostrar el error crudo)', () => {
    const m = t('algo raro de postgres 42XXX');
    expect(m).toMatch(/No se pudo completar/);
    expect(m).not.toMatch(/postgres/);
  });
  it('si la migración no está aplicada, lo dice', () => {
    const e = { code: 'PGRST202', message: 'Could not find the function public.search_complexes' };
    expect(isMissingCourts(e)).toBe(true);
    expect(bookingErrorText(e)).toMatch(/todavía no está disponible/);
    expect(isMissingCourts(new Error('slot_taken'))).toBe(false);
  });
});

describe('mis reservas', () => {
  const NOW = Date.parse('2026-11-12T12:00:00Z');
  const mk = (id: string, startsH: number, status: MyBooking['status'], extra: Partial<MyBooking> = {}): MyBooking => ({
    id, complex_id: 'c', complex_name: 'La Terraza', field_name: 'Cancha 1',
    starts_at: new Date(NOW + startsH * 3_600_000).toISOString(), ends_at: new Date(NOW + (startsH + 1) * 3_600_000).toISOString(),
    status, price: 20000, community_id: null, match_id: null, mine: true, ...extra,
  });

  it('splitBookings: próximas (pendientes y confirmadas que no terminaron) de la más cercana, e historial de la más reciente', () => {
    const list = [
      mk('late', 48, 'confirmed'), mk('soon', 2, 'pending'), mk('rej', 5, 'rejected'), mk('old', -30, 'confirmed'),
      mk('canc', -3, 'cancelled'), mk('running', -0.5, 'confirmed'),
    ];
    const { upcoming, past } = splitBookings(list, NOW);
    expect(upcoming.map(b => b.id)).toEqual(['running', 'soon', 'late']); // la que está en juego todavía cuenta
    expect(past.map(b => b.id)).toEqual(['rej', 'canc', 'old']);
  });
  it('canCancel: solo la mía, pendiente o confirmada, antes de que empiece', () => {
    expect(canCancel(mk('a', 2, 'pending'), NOW)).toBe(true);
    expect(canCancel(mk('a', 2, 'confirmed'), NOW)).toBe(true);
    expect(canCancel(mk('a', 2, 'rejected'), NOW)).toBe(false);
    expect(canCancel(mk('a', 2, 'cancelled'), NOW)).toBe(false);
    expect(canCancel(mk('a', -0.5, 'confirmed'), NOW)).toBe(false);
    expect(canCancel(mk('a', 2, 'confirmed', { mine: false }), NOW)).toBe(false);
  });
  it('cancelledByComplex: solo si está cancelada y la canceló el complejo', () => {
    expect(cancelledByComplex(mk('a', 2, 'cancelled', { cancel_role: 'staff' }))).toBe(true);
    expect(cancelledByComplex(mk('a', 2, 'cancelled', { cancel_role: 'requester' }))).toBe(false);
    expect(cancelledByComplex(mk('a', 2, 'cancelled'))).toBe(false); // cancelaciones anteriores a la migración: no se adivina
    expect(cancelledByComplex(mk('a', 2, 'confirmed', { cancel_role: 'staff' }))).toBe(false);
  });
  it('canUseForMatch: la mía, confirmada y que no terminó', () => {
    expect(canUseForMatch(mk('a', 2, 'confirmed'), NOW)).toBe(true);
    expect(canUseForMatch(mk('a', -0.5, 'confirmed'), NOW)).toBe(true);
    expect(canUseForMatch(mk('a', 2, 'pending'), NOW)).toBe(false);
    expect(canUseForMatch(mk('a', -3, 'confirmed'), NOW)).toBe(false);
    expect(canUseForMatch(mk('a', 2, 'confirmed', { mine: false }), NOW)).toBe(false);
  });
  it('nextBooking: la próxima confirmada; si no hay, la próxima pendiente', () => {
    expect(nextBooking([mk('p', 1, 'pending'), mk('c', 30, 'confirmed')], NOW)!.id).toBe('c');
    expect(nextBooking([mk('p2', 5, 'pending'), mk('p1', 1, 'pending')], NOW)!.id).toBe('p1');
    expect(nextBooking([mk('x', 1, 'rejected'), mk('y', -40, 'confirmed')], NOW)).toBeNull();
    expect(nextBooking([], NOW)).toBeNull();
  });
  it('startsDiffer: vincular no cambia la hora del partido, y si no coincide hay que avisar', () => {
    expect(startsDiffer('2026-11-13T00:00:00Z', '2026-11-13T00:00:30Z')).toBe(false);
    expect(startsDiffer('2026-11-13T00:00:00Z', '2026-11-13T01:00:00Z')).toBe(true);
    expect(startsDiffer('2026-11-13T00:00:00Z', '2026-11-12T23:58:00Z')).toBe(true);
  });
  it('whenLocal', () => {
    expect(whenLocal('2026-11-13T00:00:00Z', 'America/Argentina/Buenos_Aires')).toBe('jue 12 nov, 21:00');
  });
  it('bookingWhen y bookingMinutes', () => {
    const b = { starts_at: '2026-11-13T00:00:00Z', ends_at: '2026-11-13T01:30:00Z' }; // 21:00 a 22:30 en Argentina
    expect(bookingWhen(b, 'America/Argentina/Buenos_Aires')).toBe('jue 12 nov, 21:00 a 22:30');
    expect(bookingMinutes(b)).toBe(90);
  });
});
