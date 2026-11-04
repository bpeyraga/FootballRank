import { redis } from "./_redis.js";

// GET /api/photo?id=<pid>&v=<photoV> -> JPEG. La URL cambia con cada foto nueva (v), así que se cachea para siempre.
export default async function handler(req, res) {
  try {
    const id = String(req.query.id || "");
    if (!/^[a-z0-9]{2,40}$/.test(id)) return res.status(400).end();
    const b64 = await redis("HGET", "photos", id);
    if (!b64) {
      res.setHeader("Cache-Control", "no-store");
      return res.status(404).end();
    }
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=31536000, s-maxage=31536000, immutable");
    res.status(200).send(Buffer.from(b64, "base64"));
  } catch {
    res.status(500).end();
  }
}
