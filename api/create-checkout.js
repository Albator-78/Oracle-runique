// =============================================================
// api/create-checkout.js — CommonJS (Vercel compatible)
// =============================================================

const Stripe = require("stripe");

module.exports = async function handler(req, res) {

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });

  const { email, pack } = req.body || {};
  if (!email || !pack) return res.status(400).json({ error: "email et pack requis" });

  const PACKS = {
    eveil:    { tokens: 3,  amount: 199,  label: "Eveil - 3 consultations runiques" },
    vision:   { tokens: 10, amount: 499,  label: "Vision - 10 consultations runiques" },
    maitrise: { tokens: 30, amount: 1299, label: "Maitrise - 30 consultations runiques" }
  };

  const chosen = PACKS[pack];
  if (!chosen) return res.status(400).json({ error: "Forfait inconnu : " + pack });

  if (!process.env.STRIPE_SECRET_KEY) {
    console.error("STRIPE_SECRET_KEY absente");
    return res.status(500).json({ error: "STRIPE_SECRET_KEY manquante dans Vercel" });
  }

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const appUrl = (process.env.APP_URL || "https://oracle-runique.vercel.app").replace(/\/$/, "");

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      customer_email: email,
      line_items: [{
        price_data: {
          currency: "eur",
          unit_amount: chosen.amount,
          product_data: {
            name: chosen.label,
            description: "Oracle Runique - " + chosen.tokens + " jetons"
          }
        },
        quantity: 1
      }],
      metadata: {
        email: email.toLowerCase().trim(),
        tokens: String(chosen.tokens),
        pack: pack
      },
      success_url: appUrl + "/?success=1&email=" + encodeURIComponent(email) + "&pack=" + pack,
      cancel_url:  appUrl + "/?cancelled=1"
    });

    return res.status(200).json({ url: session.url });

  } catch (err) {
    console.error("Stripe error:", err.message);
    return res.status(500).json({ error: "Erreur Stripe", detail: err.message });
  }
};
