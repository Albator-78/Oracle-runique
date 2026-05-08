// =============================================================
// api/create-checkout.js — Création session Stripe Checkout
// Variables d'environnement Vercel requises :
//   STRIPE_SECRET_KEY   → sk_live_… ou sk_test_…
//   APP_URL             → https://votre-domaine.vercel.app
// =============================================================

import Stripe from "stripe";

export default async function handler(req, res) {

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });

  const { email, pack } = req.body || {};
  if (!email || !pack) return res.status(400).json({ error: "email et pack requis" });

  // --------------------------------------------------------
  // Définition des forfaits
  // --------------------------------------------------------
  const PACKS = {
    eveil:   { tokens: 3,  amount: 199,  label: "Éveil — 3 consultations runiques" },
    vision:  { tokens: 10, amount: 499,  label: "Vision — 10 consultations runiques" },
    maitrise:{ tokens: 30, amount: 1299, label: "Maîtrise — 30 consultations runiques" }
  };

  const chosen = PACKS[pack];
  if (!chosen) return res.status(400).json({ error: "Forfait inconnu" });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const appUrl = process.env.APP_URL || "https://votre-domaine.vercel.app";

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: "eur",
            unit_amount: chosen.amount,           // en centimes
            product_data: {
              name: chosen.label,
              description: `Oracle Runique · ${chosen.tokens} jetons de consultation`,
              images: []
            }
          },
          quantity: 1
        }
      ],
      metadata: {
        email: email.toLowerCase().trim(),
        tokens: String(chosen.tokens),
        pack
      },
      success_url: `${appUrl}/?success=1&email=${encodeURIComponent(email)}&pack=${pack}`,
      cancel_url:  `${appUrl}/?cancelled=1`
    });

    return res.status(200).json({ url: session.url });

  } catch (err) {
    console.error("Stripe error:", err);
    return res.status(500).json({ error: "Erreur Stripe", detail: err.message });
  }
}
