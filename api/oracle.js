// api/oracle.js — CommonJS + ioredis (REDIS_URL)

const Redis = require("ioredis");

let redis;
function getRedis() {
  if (!redis) redis = new Redis(process.env.REDIS_URL);
  return redis;
}

module.exports = async function handler(req, res) {

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Methode non autorisee" });

  const { email, payload } = req.body || {};
  if (!email)   return res.status(400).json({ error: "Email requis" });
  if (!payload) return res.status(400).json({ error: "Payload manquant" });

  if (!process.env.REDIS_URL) {
    console.error("REDIS_URL absente");
    return res.status(500).json({ error: "REDIS_URL manquante dans Vercel" });
  }

  const key = "tokens:" + email.toLowerCase().trim();

  try {
    const db      = getRedis();
    const val     = await db.get(key);
    const balance = parseInt(val || "0", 10) || 0;

    if (balance <= 0) {
      return res.status(402).json({ error: "Solde insuffisant", code: "NO_TOKENS", balance: 0 });
    }

    const apiKey = process.env.ANTHROPIC_KEY;
    if (!apiKey) return res.status(500).json({ error: "ANTHROPIC_KEY manquante" });

    const anthropicResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify(payload)
    });

    const data = await anthropicResp.json();

    if (!anthropicResp.ok) {
      return res.status(anthropicResp.status).json(data);
    }

    // Décrémenter jeton atomiquement
    await db.decrby(key, 1);

    return res.status(200).json(Object.assign({}, data, { tokenBalance: balance - 1 }));

  } catch (err) {
    console.error("Erreur:", err.message);
    return res.status(502).json({ error: err.message });
  }
};
