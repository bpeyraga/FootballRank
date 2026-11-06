// Edge Function `place`: resuelve un link de Google Maps (también los cortos maps.app.goo.gl) y devuelve
// nombre y coordenadas del lugar, para precargar el formulario de "Nueva cancha".
// La llama la app con el token del usuario (verify_jwt activado; además se verifica acá que haya usuario).
// POST { url } -> { name, lat, lng, url } (name/lat/lng pueden ser null). Solo sigue links de Google Maps.
// Sin secretos propios: SUPABASE_URL y SUPABASE_ANON_KEY los pone Supabase solo.
// El parser duplica el de src/lib/maps.ts (una Edge Function no puede importar de src): mantenerlos iguales.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// ---------- hosts permitidos (SSRF: la función hace requests, así que cada salto se valida) ----------
const GOOGLE = /^(?:www\.)?google\.[a-z]{2,3}(?:\.[a-z]{2})?$/;
const GOOGLE_MAPS = /^maps\.google\.[a-z]{2,3}(?:\.[a-z]{2})?$/;
const CONSENT = /^consent\.google\.[a-z]{2,3}(?:\.[a-z]{2})?$/;

function parse(raw: string): URL | null {
  try {
    const u = new URL(raw.trim());
    return u.protocol === 'https:' && !u.username && !u.password && !u.port ? u : null;
  } catch { return null; }
}
function isMapsUrl(raw: string): boolean {
  const u = parse(raw);
  if (!u) return false;
  const h = u.hostname.toLowerCase();
  if (h === 'maps.app.goo.gl' || GOOGLE_MAPS.test(h)) return true;
  if (h === 'goo.gl') return u.pathname === '/maps' || u.pathname.startsWith('/maps/');
  return GOOGLE.test(h) && (u.pathname === '/maps' || u.pathname.startsWith('/maps/'));
}
/** Links que todavía hay que seguir (redirigen); el resto ya es el link largo y no se pide. */
const isShort = (u: URL) => u.hostname === 'maps.app.goo.gl' || u.hostname === 'goo.gl';

// ---------- parser (igual a src/lib/maps.ts) ----------
const NUM = '-?\\d{1,3}(?:\\.\\d+)?';
const COORDS = new RegExp(`^\\s*(${NUM})\\s*,\\s*(${NUM})\\s*$`);
const pair = (a: string, b: string): { lat: number; lng: number } | null => {
  const lat = +a, lng = +b;
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
};

function parseMapsUrl(url: string) {
  const out: { name: string | null; lat: number | null; lng: number | null } = { name: null, lat: null, lng: null };
  let u: URL;
  try { u = new URL(url.trim()); } catch { return out; }

  const place = u.pathname.match(/\/maps\/place\/([^/]+)/);
  let name: string | null = null;
  if (place) {
    try { name = decodeURIComponent(place[1].replace(/\+/g, ' ')).trim(); } catch { name = null; }
  }

  const full = u.pathname + u.search;
  let c: { lat: number; lng: number } | null = null;
  const d = full.match(new RegExp(`!3d(${NUM})!4d(${NUM})`));
  if (d) c = pair(d[1], d[2]);
  if (!c) {
    const at = full.match(new RegExp(`@(${NUM}),(${NUM})`));
    if (at) c = pair(at[1], at[2]);
  }
  let q: string | null = null;
  for (const k of ['q', 'query', 'destination', 'll']) {
    const v = u.searchParams.get(k);
    if (!v) continue;
    const m = v.match(COORDS);
    if (m) { if (!c) c = pair(m[1], m[2]); } else if (!q && k !== 'll') q = v.trim();
  }

  if (name) {
    const m = name.match(COORDS);
    if (m) { if (!c) c = pair(m[1], m[2]); name = null; }
  }
  out.name = name || q || null;
  if (c) { out.lat = c.lat; out.lng = c.lng; }
  return out;
}

// ---------- seguir los redirects a mano (máx. 5 saltos, cada uno validado) ----------
async function resolve(start: string): Promise<string | null> {
  let cur = start.trim();
  for (let hop = 0; hop < 5; hop++) {
    const u = parse(cur);
    if (!u || !isMapsUrl(cur)) return null;
    if (!isShort(u)) return u.toString(); // ya es el link largo
    const res = await fetch(u, {
      redirect: 'manual',
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', 'Accept-Language': 'es-AR,es;q=0.9' },
    });
    await res.body?.cancel();
    const loc = res.headers.get('location');
    if (res.status < 300 || res.status >= 400 || !loc) return u.toString(); // sin más redirects
    let next: URL;
    try { next = new URL(loc, u); } catch { return null; }
    // Desde algunas regiones Google manda primero a una pantalla de consentimiento: el destino real va en ?continue=
    if (CONSENT.test(next.hostname)) {
      const cont = next.searchParams.get('continue');
      if (!cont) return null;
      cur = cont;
    } else cur = next.toString();
  }
  return null; // demasiados saltos
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // Solo usuarios logueados
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.replace(/^Bearer /i, '');
  if (!token) return json({ error: 'unauthorized' }, 401);
  const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: auth } } });
  const { data: u } = await anon.auth.getUser(token);
  if (!u.user) return json({ error: 'unauthorized' }, 401);

  const p = await req.json().catch(() => ({})) as { url?: unknown };
  const url = typeof p.url === 'string' ? p.url.trim() : '';
  if (!url || url.length > 1000 || !isMapsUrl(url)) return json({ error: 'bad_url' }, 400);

  let final: string | null;
  try { final = await resolve(url); }
  catch (e) { console.error('place', (e as Error).message); return json({ error: 'fetch_failed' }, 502); }
  if (!final) return json({ error: 'bad_url' }, 400);

  return json({ ...parseMapsUrl(final), url: final });
});
