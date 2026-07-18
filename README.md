# Oracle Runique — Déploiement Vercel + Stripe

## Structure du projet

```
oracle-runique/
├── index.html                  ← Application frontale (HTML unique)
├── package.json
└── api/
    ├── oracle.js               ← Relais Claude + gestion jetons
    ├── tokens.js               ← Lecture du solde
    ├── create-checkout.js      ← Création session Stripe
    └── webhook.js              ← Réception paiements Stripe
```

---

## Étape 1 — Stripe

1. Créer un compte sur https://stripe.com
2. Mode Test d'abord : récupérer la clé `sk_test_…` dans **Developers → API keys**
3. Dans **Developers → Webhooks** : ajouter un endpoint
   - URL : `https://VOTRE-PROJET.vercel.app/api/webhook`
   - Événement : `checkout.session.completed`
   - Récupérer le **Webhook secret** `whsec_…`

---

## Étape 2 — GitHub

```bash
git init
git add .
git commit -m "Oracle Runique initial"
git remote add origin https://github.com/VOUS/oracle-runique.git
git push -u origin main
```

---

## Étape 3 — Vercel

1. https://vercel.com → **New Project** → importer votre dépôt GitHub
2. Dans **Settings → Environment Variables**, ajouter :

| Nom                    | Valeur                                    |
|------------------------|-------------------------------------------|
| `ANTHROPIC_KEY`        | `sk-ant-api03-…`                          |
| `STRIPE_SECRET_KEY`    | `sk_test_…` (puis `sk_live_…` en prod)    |
| `STRIPE_WEBHOOK_SECRET`| `whsec_…`                                 |
| `APP_URL`              | `https://votre-projet.vercel.app`         |

3. Dans **Storage → Create Database → KV** : créer une base Vercel KV
   - Les variables `KV_REST_API_URL` et `KV_REST_API_TOKEN` sont ajoutées automatiquement

4. Déployer → votre app est en ligne

---

## Étape 4 — Passer en production Stripe

1. Activer votre compte Stripe (vérification KYB)
2. Remplacer `sk_test_…` par `sk_live_…` dans les variables Vercel
3. Créer un nouveau webhook Stripe avec la même URL et nouveau `whsec_…`
4. Mettre à jour `STRIPE_WEBHOOK_SECRET` dans Vercel

---

## Test en local

```bash
npm install
npx vercel dev          # lance le serveur local avec les fonctions API
# Ouvrir http://localhost:3000
```

Pour tester Stripe en local, installer la CLI Stripe :
```bash
stripe listen --forward-to localhost:3000/api/webhook
```

---

## Carte de test Stripe

- Numéro : `4242 4242 4242 4242`
- Date : n'importe quelle date future
- CVC : `123`

- Copyright 2026 NETSCHUSS-LAB

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
