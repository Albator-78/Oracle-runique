// =============================================================
// api/oracle.js — Vérification jetons + relais Anthropic
// Variables d'environnement Vercel requises :
//   ANTHROPIC_KEY        → clé API Anthropic
//   KV_REST_API_URL      → URL Vercel KV  (auto si KV connecté)
//   KV_REST_API_TOKEN    → Token Vercel KV (auto si KV connecté)
// =============================================================

export default async function handler(req, res) {

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });

  const { email, payload } = req.body || {};

  if (!email || typeof email !== "string") {
    return res.status(400).json({ error: "Email requis" });
  }
  if (!payload) {
    return res.status(400).json({ error: "Payload manquant" });
  }

  // --------------------------------------------------------
  // 1. Vérification du solde de jetons via Vercel KV (Redis)
  // --------------------------------------------------------
  const kvUrl   = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  if (!kvUrl || !kvToken) {
    console.error("Variables KV manquantes");
    return res.status(500).json({ error: "Configuration KV incomplète" });
  }

  const key = `tokens:${email.toLowerCase().trim()}`;

  // Lecture du solde actuel
  const getResp = await fetch(`${kvUrl}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${kvToken}` }
  });
  const getData = await getResp.json();
  const balance = parseInt(getData?.result ?? "0", 10) || 0;

  if (balance <= 0) {
    return res.status(402).json({
      error: "Solde insuffisant",
      code: "NO_TOKENS",
      balance: 0
    });
  }

  // --------------------------------------------------------
  // 2. Appel API Anthropic
  // --------------------------------------------------------
  const apiKey = process.env.ANTHROPIC_KEY;
  if (!apiKey) return res.status(500).json({ error: "Clé Anthropic manquante" });

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

    // --------------------------------------------------------
    // 3. Déduire 1 jeton (décrémentation atomique Redis DECRBY)
    // --------------------------------------------------------
    await fetch(`${kvUrl}/decrby/${encodeURIComponent(key)}/1`, {
      method: "POST",
      headers: { Authorization: `Bearer ${kvToken}` }
    });

    // Retour : réponse Claude + nouveau solde
    return res.status(200).json({
      ...data,
      tokenBalance: balance - 1
    });

  } catch (err) {
    console.error("Erreur Anthropic :", err);
    return res.status(502).json({ error: "Impossible de joindre Anthropic", detail: err.message });
  }
}
