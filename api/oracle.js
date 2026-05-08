// =============================================================
// api/oracle.js — CommonJS (Vercel compatible)
// =============================================================

module.exports = async function handler(req, res) {

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Methode non autorisee" });

  const { email, payload } = req.body || {};
  if (!email) return res.status(400).json({ error: "Email requis" });
  if (!payload) return res.status(400).json({ error: "Payload manquant" });

  const kvUrl   = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  if (!kvUrl || !kvToken) {
    console.error("Variables KV manquantes");
    return res.status(500).json({ error: "KV non configure - connecter Vercel KV au projet" });
  }

  const key = "tokens:" + email.toLowerCase().trim();

  // Lecture solde
  const getResp = await fetch(kvUrl + "/get/" + encodeURIComponent(key), {
    headers: { Authorization: "Bearer " + kvToken }
  });
  const getData = await getResp.json();
  const balance = parseInt(getData && getData.result ? getData.result : "0", 10) || 0;

  if (balance <= 0) {
    return res.status(402).json({ error: "Solde insuffisant", code: "NO_TOKENS", balance: 0 });
  }

  const apiKey = process.env.ANTHROPIC_KEY;
  if (!apiKey) return res.status(500).json({ error: "ANTHROPIC_KEY manquante" });

  try {
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

    // Decrémenter jeton
    await fetch(kvUrl + "/decrby/" + encodeURIComponent(key) + "/1", {
      method: "POST",
      headers: { Authorization: "Bearer " + kvToken }
    });

    return res.status(200).json(Object.assign({}, data, { tokenBalance: balance - 1 }));

  } catch (err) {
    console.error("Erreur Anthropic :", err);
    return res.status(502).json({ error: "Impossible de joindre Anthropic", detail: err.message });
  }
};
