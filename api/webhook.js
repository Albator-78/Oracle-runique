// api/webhook.js — bodyParser:false déclaré en premier

const Stripe = require("stripe");
const Redis  = require("ioredis");

// ⚠️  DOIT être déclaré avant module.exports pour que Vercel le lise
const config = { api: { bodyParser: false } };

let redis;
function getRedis() {
  if (!redis) redis = new Redis(process.env.REDIS_URL);
  return redis;
}

// Lecture fiable du corps brut depuis un stream Node.js
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data",  chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end",   ()    => resolve(Buffer.concat(chunks)));
    req.on("error", err   => reject(err));
  });
}

async function handler(req, res) {

  if (req.method !== "POST") return res.status(405).end();

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: "STRIPE_SECRET_KEY manquante" });
  }
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(500).json({ error: "STRIPE_WEBHOOK_SECRET manquante" });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const sig    = req.headers["stripe-signature"];

  if (!sig) {
    console.error("Header stripe-signature absent");
    return res.status(400).json({ error: "stripe-signature manquant" });
  }

  let rawBody;
  try {
    rawBody = await getRawBody(req);
  } catch (err) {
    console.error("Erreur lecture body:", err.message);
    return res.status(400).json({ error: "Impossible de lire le body" });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Signature invalide:", err.message);
    console.error("Body reçu (64 premiers octets):", rawBody.slice(0, 64).toString());
    console.error("Signature header:", sig ? sig.substring(0, 40) + "..." : "absent");
    return res.status(400).send("Webhook Error: " + err.message);
  }

  console.log("Evenement Stripe reçu:", event.type);

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    if (session.payment_status !== "paid") {
      console.log("Paiement non confirmé, ignoré:", session.payment_status);
      return res.status(200).json({ received: true, skipped: "not_paid" });
    }

    const email  = session.metadata && session.metadata.email;
    const tokens = parseInt((session.metadata && session.metadata.tokens) || "0", 10);

    if (!email || !tokens) {
      console.error("Metadonnees manquantes:", JSON.stringify(session.metadata));
      return res.status(200).json({ received: true, skipped: "missing_metadata" });
    }

    try {
      const db         = getRedis();
      const key        = "tokens:" + email;
      const newBalance = await db.incrby(key, tokens);
      console.log("OK +" + tokens + " jetons pour " + email + " — solde: " + newBalance);
    } catch (err) {
      console.error("Redis error:", err.message);
      return res.status(500).json({ error: "Erreur Redis" });
    }
  }

  return res.status(200).json({ received: true });
}

// Export CommonJS avec config attachée à la fonction
handler.config = config;
module.exports = handler;
