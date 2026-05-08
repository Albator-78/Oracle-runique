// api/webhook.js — CommonJS + ioredis
// ⚠️  bodyParser desactive (signature Stripe)

const Stripe = require("stripe");
const Redis  = require("ioredis");

let redis;
function getRedis() {
  if (!redis) redis = new Redis(process.env.REDIS_URL);
  return redis;
}

module.exports = async function handler(req, res) {

  if (req.method !== "POST") return res.status(405).end();

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: "STRIPE_SECRET_KEY manquante" });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  // Lecture corps brut pour vérification signature
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
    const tokens = parseInt((session.metadata && session.metadata.tokens) || "0", 10);

    if (!email || !tokens) {
      console.error("Metadonnees manquantes :", session.metadata);
      return res.status(200).json({ received: true, skipped: "missing_metadata" });
    }

    try {
      const db  = getRedis();
      const key = "tokens:" + email;
      const newBalance = await db.incrby(key, tokens);
      console.log("+" + tokens + " jetons pour " + email + " — solde : " + newBalance);
    } catch (err) {
      console.error("Redis error:", err.message);
    }
  }

  return res.status(200).json({ received: true });
};

module.exports.config = { api: { bodyParser: false } };
