import { redis, readAll, send } from "./_redis.js";

const KEYS = ["rit", "tir", "pas", "reg", "def", "fis"];

// PUT /api/vote {voter, pid, ratings:{rit,tir,pas,reg,def,fis}}
// Un campo por votante y jugador: escribir es atómico, sin leer-modificar-escribir.
export default async function handler(req, res) {
  try {
    if (req.method !== "PUT") return send(res, 405, { error: "Método no permitido." });
    const { voter, pid, ratings } = req.body || {};
    if (!/^v[a-z0-9]{8,40}$/.test(voter || "") || !/^[a-z0-9]{2,40}$/.test(pid || "")) {
      return send(res, 400, { error: "Voto inválido." });
    }
    const r = {};
    for (const k of KEYS) {
      const v = Math.round(Number(ratings?.[k]));
      if (!(v >= 1 && v <= 99)) return send(res, 400, { error: "Los puntajes van de 1 a 99." });
      r[k] = v;
    }
    await redis("HSET", "votes", voter + "|" + pid, JSON.stringify(r));
    send(res, 200, await readAll());
  } catch (e) {
    send(res, 500, { error: e.message });
  }
}
