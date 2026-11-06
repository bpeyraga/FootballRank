// Compartir una convocatoria (WhatsApp) y agendarla (Google Calendar / .ics). Funciones puras: no tocan Supabase.

export interface ShareMatch { id: string; title: string; starts_at: string; location: string | null; slots: number }

/** Duración que se agenda para el partido (el calendario necesita un fin). */
export const MATCH_MINUTES = 60;

/** Link al partido dentro de la app. */
export const matchUrl = (origin: string, slug: string, id: string) => `${origin}/#/c/${slug}/m/${id}`;

/** "Jueves 12 de noviembre, 21:00 hs" (hora local del navegador). */
export function longDate(iso: string): string {
  const s = new Date(iso).toLocaleString('es-AR',
    { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hour12: false });
  return s.charAt(0).toUpperCase() + s.slice(1) + ' hs';
}

/** Texto de la convocatoria para pegar en el grupo. */
export function shareText(m: ShareMatch, taken: number, url: string): string {
  const where = m.location?.trim();
  return [
    `⚽ ${m.title}`,
    `📅 ${longDate(m.starts_at)}`,
    where ? `📍 ${where}` : null,
    `👥 ${taken}/${m.slots} anotados`,
    `Anotate acá: ${url}`,
  ].filter(Boolean).join('\n');
}

export const whatsappUrl = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;

/** "20261112T000000Z": formato UTC que piden Google Calendar y los .ics. */
export const calStamp = (t: string | number | Date) =>
  new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

const endOf = (iso: string) => new Date(+new Date(iso) + MATCH_MINUTES * 60e3);

/** Link para agendar en Google Calendar (usa el aviso por defecto del calendario). */
export function gcalUrl(m: ShareMatch, url: string): string {
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: `⚽ ${m.title}`,
    dates: `${calStamp(m.starts_at)}/${calStamp(endOf(m.starts_at))}`,
    details: `Anotate acá: ${url}`,
  });
  if (m.location?.trim()) p.set('location', m.location.trim());
  return `https://calendar.google.com/calendar/render?${p}`;
}

/** Escapa texto para un valor ICS (RFC 5545). */
export const icsEscape = (s: string) =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Parte una línea en tramos de hasta 75 bytes UTF-8 (sin cortar un carácter), como pide el RFC. */
export function icsFold(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = '', bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch; bytes += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

/** Archivo .ics con un aviso (VALARM) 1 hora antes del partido. */
export function buildIcs(m: ShareMatch, url: string, now: Date = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Futbol Rank//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${m.id}@futbol-rank`,
    `DTSTAMP:${calStamp(now)}`,
    `DTSTART:${calStamp(m.starts_at)}`,
    `DTEND:${calStamp(endOf(m.starts_at))}`,
    `SUMMARY:${icsEscape(`⚽ ${m.title}`)}`,
    m.location?.trim() ? `LOCATION:${icsEscape(m.location.trim())}` : null,
    `DESCRIPTION:${icsEscape(`Anotate acá: ${url}`)}`,
    `URL:${url}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${icsEscape(`${m.title}: arranca en 1 hora`)}`,
    'TRIGGER:-PT1H',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter((l): l is string => !!l);
  return lines.map(icsFold).join('\r\n') + '\r\n';
}

/** Descarga el .ics (en celulares lo abre el calendario). */
export function downloadIcs(m: ShareMatch, url: string) {
  const blob = new Blob([buildIcs(m, url)], { type: 'text/calendar;charset=utf-8' });
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href; a.download = 'partido.ics';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
