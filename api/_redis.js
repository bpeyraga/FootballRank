// Helpers compartidos (los archivos que empiezan con "_" no son rutas en Vercel).
// Usa la REST API de Upstash Redis (Vercel Marketplace → Storage). Sin dependencias.
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export async function redis(...cmd) {
  if (!URL_ || !TOKEN) throw new Error("Falta conectar la base de datos (Upstash Redis) al proyecto en Vercel.");
  const r = await fetch(URL_, {
    method: "POST",
    headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || "Error de base de datos (" + r.status + ")");
  return j.result;
}

// players: hash pid -> {name,pos,createdAt}
// votes:   hash "voter|pid" -> {rit,tir,pas,reg,def,fis}
export async function readAll() {
  const [p, v] = await Promise.all([redis("HGETALL", "players"), redis("HGETALL", "votes")]);
  const players = {}, votes = {};
  for (let i = 0; i < (p || []).length; i += 2) {
    try { players[p[i]] = JSON.parse(p[i + 1]); } catch {}
  }
  for (let i = 0; i < (v || []).length; i += 2) {
    const [voter, pid] = String(v[i]).split("|");
    try { (votes[voter] ??= { ratings: {} }).ratings[pid] = JSON.parse(v[i + 1]); } catch {}
  }
  return { players, votes };
}

export function send(res, status, obj) {
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json(obj);
}
