// =============================================================
// api/webhook.js — Réception des événements Stripe
// Variables d'environnement Vercel requises :
//   STRIPE_SECRET_KEY      → sk_live_… (ou sk_test_… en test)
//   STRIPE_WEBHOOK_SECRET  → whsec_… (depuis le dashboard Stripe)
//   KV_REST_API_URL        → URL Vercel KV
//   KV_REST_API_TOKEN      → Token Vercel KV
//
// ⚠️  bodyParser DOIT être désactivé (voir export config ci-dessous)
//     pour que la vérification de signature Stripe fonctionne.
// =============================================================

import Stripe from "stripe";
import { buffer } from "micro";

export const config = {
  api: { bodyParser: false }
};

export default async function handler(req, res) {

  if (req.method !== "POST") return res.status(405).end();

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const secret    = process.env.STRIPE_WEBHOOK_SECRET;
  const kvUrl     = process.env.KV_REST_API_URL;
  const kvToken   = process.env.KV_REST_API_TOKEN;

  // --------------------------------------------------------
  // Vérification de config AVANT tout traitement : mieux vaut
  // un 500 explicite et loggé qu'un crash silencieux.
  // --------------------------------------------------------
  if (!stripeKey || !secret) {
    console.error("Config manquante : STRIPE_SECRET_KEY ou STRIPE_WEBHOOK_SECRET absent");
    return res.status(500).json({ error: "Configuration Stripe manquante" });
  }
  if (!kvUrl || !kvToken) {
    console.error("Config manquante : KV_REST_API_URL ou KV_REST_API_TOKEN absent");
    return res.status(500).json({ error: "Configuration KV manquante" });
  }

  const stripe = new Stripe(stripeKey);

  // Lecture du corps brut (indispensable pour la vérification de signature)
  let rawBody;
  try {
    rawBody = await buffer(req);
  } catch (err) {
    console.error("Erreur lecture body :", err.message);
    return res.status(400).send("Impossible de lire le corps de la requête");
  }
  const sig = req.headers["stripe-signature"];

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    console.error("Signature invalide :", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // --------------------------------------------------------
  // Seul l'événement checkout.session.completed nous intéresse
  // --------------------------------------------------------
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    // Paiement confirmé ?
    if (session.payment_status !== "paid") {
      return res.status(200).json({ received: true, skipped: "not_paid" });
    }

    const email  = session.metadata?.email;
    const tokens = parseInt(session.metadata?.tokens ?? "0", 10);

    if (!email || !tokens) {
      console.error("Métadonnées manquantes :", session.metadata);
      return res.status(200).json({ received: true, skipped: "missing_metadata" });
    }

    // Crédit atomique des jetons dans Vercel KV (Redis INCRBY)
    // Tout ce bloc est maintenant protégé : une panne KV renvoie un
    // 500 clair et loggé (pour que Stripe retente), au lieu de faire
    // planter la fonction avec une exception non gérée.
    const key = `tokens:${email}`;
    try {
      const incrResp = await fetch(`${kvUrl}/incrby/${encodeURIComponent(key)}/${tokens}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${kvToken}` }
      });

      if (!incrResp.ok) {
        const errText = await incrResp.text().catch(() => "");
        console.error(`Erreur KV (${incrResp.status}) pour ${email} :`, errText);
        return res.status(500).json({ error: "Échec écriture KV" });
      }

      const incrData = await incrResp.json();
      const newBalance = incrData?.result ?? "?";

      console.log(`✅ +${tokens} jetons pour ${email} — solde : ${newBalance}`);

    } catch (err) {
      console.error(`Exception KV pour ${email} :`, err.message);
      return res.status(500).json({ error: "Erreur serveur lors du crédit des jetons" });
    }
  }

  return res.status(200).json({ received: true });
}
