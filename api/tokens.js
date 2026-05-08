// api/tokens.js — CommonJS + ioredis (REDIS_URL)

const Redis = require("ioredis");

let redis;
function getRedis() {
  if (!redis) redis = new Redis(process.env.REDIS_URL);
  return redis;
}

module.exports = async function handler(req, res) {

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const email = req.query && req.query.email;
  if (!email) return res.status(400).json({ error: "Email requis" });

  if (!process.env.REDIS_URL) {
    console.error("REDIS_URL absente");
    return res.status(500).json({ error: "REDIS_URL manquante", balance: 0 });
  }

  try {
    const db  = getRedis();
    const key = "tokens:" + email.toLowerCase().trim();
    const val = await db.get(key);
    const balance = parseInt(val || "0", 10) || 0;
    return res.status(200).json({ balance });
  } catch (err) {
    console.error("Redis error:", err.message);
    return res.status(500).json({ error: "Erreur Redis", balance: 0 });
  }
};
