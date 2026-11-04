import { readAll, send } from "./_redis.js";

// GET /api/data -> {players, votes}
export default async function handler(req, res) {
  try {
    send(res, 200, await readAll());
  } catch (e) {
    send(res, 500, { error: e.message });
  }
}
