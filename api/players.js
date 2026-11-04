import { redis, readAll, send } from "./_redis.js";

const POS = ["ARQ", "DEF", "MED", "DEL"];
const MAX_PLAYERS = 60;
const MAX_PHOTO_B64 = 300000; // ~220 KB; el front manda ~20 KB (256x256 JPEG)

// POST   /api/players {name,pos}            -> agrega jugador
// PATCH  /api/players {id,name?,pos?,photo?} -> edita (photo: dataURL JPEG, o null para quitarla).
//        Sirve también para el plantel fijo: guarda un override con el mismo id.
// DELETE /api/players?id=pXXXX              -> borra jugador agregado desde la app (el plantel fijo vive en index.html)
export default async function handler(req, res) {
  try {
    if (req.method === "POST") {
      const { name, pos } = req.body || {};
      const n = typeof name === "string" ? name.trim().slice(0, 30) : "";
      if (!n || !POS.includes(pos)) return send(res, 400, { error: "Nombre o posición inválidos." });
      if ((await redis("HLEN", "players")) >= MAX_PLAYERS) return send(res, 400, { error: "Se llegó al límite de " + MAX_PLAYERS + " jugadores." });
      const id = "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      await redis("HSET", "players", id, JSON.stringify({ name: n, pos, createdAt: Date.now() }));
    } else if (req.method === "PATCH") {
      const { id, name, pos, photo } = req.body || {};
      if (!/^[a-z0-9]{2,40}$/.test(id || "")) return send(res, 400, { error: "Jugador inválido." });
      let cur = {};
      try { cur = JSON.parse((await redis("HGET", "players", id)) || "{}") || {}; } catch {}
      if (name !== undefined) {
        const n = typeof name === "string" ? name.trim().slice(0, 30) : "";
        if (!n) return send(res, 400, { error: "El nombre no puede quedar vacío." });
        cur.name = n;
      }
      if (pos !== undefined) {
        if (!POS.includes(pos)) return send(res, 400, { error: "Posición inválida." });
        cur.pos = pos;
      }
      if (photo === null) {
        await redis("HDEL", "photos", id);
        delete cur.photoV;
      } else if (photo !== undefined) {
        const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(typeof photo === "string" ? photo : "");
        if (!m || m[1].length > MAX_PHOTO_B64) return send(res, 400, { error: "La foto no es válida o es muy grande." });
        await redis("HSET", "photos", id, m[1]);
        cur.photoV = Date.now();
      }
      await redis("HSET", "players", id, JSON.stringify(cur));
    } else if (req.method === "DELETE") {
      const id = String(req.query.id || "");
      if (!/^p[a-z0-9]{4,30}$/.test(id)) return send(res, 400, { error: "Ese jugador no se puede borrar." });
      await Promise.all([redis("HDEL", "players", id), redis("HDEL", "photos", id)]);
    } else {
      return send(res, 405, { error: "Método no permitido." });
    }
    send(res, 200, await readAll());
  } catch (e) {
    send(res, 500, { error: e.message });
  }
}
