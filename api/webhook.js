// =============================================================
// api/webhook.js — CommonJS (Vercel compatible)
// ⚠️  bodyParser desactive obligatoirement (signature Stripe)
// =============================================================

const Stripe = require("stripe");

module.exports = async function handler(req, res) {

  if (req.method !== "POST") return res.status(405).end();

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: "STRIPE_SECRET_KEY manquante" });
  }

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const kvUrl  = process.env.KV_REST_API_URL;
  const kvToken= process.env.KV_REST_API_TOKEN;

  // Lecture corps brut
  const chunks = [];
  for await (const chunk of req) { chunks.push(chunk); }
  const rawBody = Buffer.concat(chunks);
  const sig = req.headers["stripe-signature"];

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    console.error("Signature invalide :", err.message);
    return res.status(400).send("Webhook Error: " + err.message);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    if (session.payment_status !== "paid") {
      return res.status(200).json({ received: true, skipped: "not_paid" });
    }

    const email  = session.metadata && session.metadata.email;
    const tokens = parseInt(session.metadata && session.metadata.tokens ? session.metadata.tokens : "0", 10);

    if (!email || !tokens) {
      console.error("Metadonnees manquantes :", session.metadata);
      return res.status(200).json({ received: true, skipped: "missing_metadata" });
    }

    const key = "tokens:" + email;
    const incrResp = await fetch(kvUrl + "/incrby/" + encodeURIComponent(key) + "/" + tokens, {
      method: "POST",
      headers: { Authorization: "Bearer " + kvToken }
    });
    const incrData = await incrResp.json();
    console.log("+" + tokens + " jetons pour " + email + " — solde : " + (incrData && incrData.result));
  }

  return res.status(200).json({ received: true });
};

module.exports.config = { api: { bodyParser: false } };
