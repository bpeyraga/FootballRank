import { redis, readAll, send } from "./_redis.js";

const POS = ["ARQ", "DEF", "MED", "DEL"];
const MAX_PLAYERS = 60;

// POST /api/players {name,pos}  -> agrega jugador
// DELETE /api/players?id=pXXXX  -> borra jugador agregado desde la app (el plantel fijo vive en index.html)
export default async function handler(req, res) {
  try {
    if (req.method === "POST") {
      const { name, pos } = req.body || {};
      const n = typeof name === "string" ? name.trim().slice(0, 30) : "";
      if (!n || !POS.includes(pos)) return send(res, 400, { error: "Nombre o posición inválidos." });
      if ((await redis("HLEN", "players")) >= MAX_PLAYERS) return send(res, 400, { error: "Se llegó al límite de " + MAX_PLAYERS + " jugadores." });
      const id = "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      await redis("HSET", "players", id, JSON.stringify({ name: n, pos, createdAt: Date.now() }));
    } else if (req.method === "DELETE") {
      const id = String(req.query.id || "");
      if (!/^p[a-z0-9]{4,30}$/.test(id)) return send(res, 400, { error: "Ese jugador no se puede borrar." });
      await redis("HDEL", "players", id);
    } else {
      return send(res, 405, { error: "Método no permitido." });
    }
    send(res, 200, await readAll());
  } catch (e) {
    send(res, 500, { error: e.message });
  }
}
