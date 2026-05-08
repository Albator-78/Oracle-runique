// =============================================================
// api/tokens.js — CommonJS (Vercel compatible)
// =============================================================

module.exports = async function handler(req, res) {

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const email = req.query && req.query.email;
  if (!email) return res.status(400).json({ error: "Email requis" });

  const kvUrl   = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  if (!kvUrl || !kvToken) {
    console.error("Variables KV manquantes - connecter Vercel KV au projet");
    return res.status(500).json({ error: "KV non configure", balance: 0 });
  }

  const key = "tokens:" + email.toLowerCase().trim();
  try {
    const resp = await fetch(kvUrl + "/get/" + encodeURIComponent(key), {
      headers: { Authorization: "Bearer " + kvToken }
    });
    const data = await resp.json();
    const balance = parseInt(data && data.result ? data.result : "0", 10) || 0;
    return res.status(200).json({ balance: balance });
  } catch (err) {
    console.error("KV error:", err.message);
    return res.status(500).json({ error: "Erreur KV", balance: 0 });
  }
};
