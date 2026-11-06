// Keep-alive: Vercel Cron llama a esta ruta una vez por día (ver "crons" en vercel.json)
// para que el proyecto gratis de Supabase no se pause por 7 días sin actividad.
// Hace una lectura mínima con la clave pública (anon); no expone ni devuelve datos.
export default async function handler(_req, res) {
  const url = process.env.VITE_SUPABASE_URL, key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return res.status(500).json({ ok: false, error: 'faltan variables de entorno' });
  try {
    const r = await fetch(`${url.replace(/\/+$/, '')}/rest/v1/communities?select=id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
    });
    return res.status(r.ok ? 200 : 502).json({ ok: r.ok, status: r.status, at: new Date().toISOString() });
  } catch (e) {
    return res.status(502).json({ ok: false, error: String(e?.message ?? e) });
  }
}
