# Déployer le proxy Green API sur Cloudflare Workers

**Objectif :** contourner le blocage WAF de Green API sur les IP Vercel.
Une seule fois, ~3 minutes. Gratuit à vie (100 000 requêtes/jour).

---

## Étapes

### 1. Créer un compte Cloudflare (30 s)

- Ouvrez [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up).
- Email + mot de passe. **Pas besoin de carte bancaire** pour le plan Workers Free.

### 2. Créer le Worker (1 min)

- Une fois connecté, menu de gauche → **Workers & Pages** → **Create application** → **Create Worker**.
- Nom suggéré : `smartmaint-whatsapp-proxy` (utilisé dans l'URL finale).
- Cliquez **Deploy** (le "hello world" par défaut suffit pour créer l'URL).

### 3. Coller le vrai code (1 min)

- Sur la page du Worker qui vient d'être créé, cliquez **Edit code** (en haut à droite).
- **Supprimez tout** ce qui est dans `worker.js`.
- **Copiez-collez le contenu du fichier `whatsapp-proxy.js`** (à côté de ce README).
- Cliquez **Save and deploy** (en haut à droite).

### 4. Ajouter le secret partagé (30 s)

Sur la page du Worker (pas dans l'éditeur, dans **Settings** → **Variables**) :

- Section **Environment Variables** → **Add variable**
- Name : `PROXY_SHARED_SECRET`
- Value : **générez un mot de passe long et aléatoire** (32 caractères). Exemple : sur un terminal Windows exécutez `[guid]::NewGuid().ToString('n') + [guid]::NewGuid().ToString('n')` — copiez le résultat.
- **Cochez « Encrypt »** avant de sauvegarder.
- Cliquez **Save and deploy**.

**Gardez ce secret sous la main** — on en aura besoin dans Vercel dans une seconde.

### 5. Récupérer l'URL publique du Worker

- En haut de la page du Worker, sous le nom, vous voyez son URL publique.
  Elle ressemble à : `https://smartmaint-whatsapp-proxy.<votre-compte>.workers.dev`
- **Copiez cette URL complète.**

### 6. Coller les deux valeurs dans SmartMaint

Dites-moi les deux :

- **URL du Worker** (ce que vous venez de copier)
- **Secret partagé** (celui de l'étape 4)

Je les colle dans les variables Vercel de SmartMaint (`GREEN_API_PROXY_URL` + `GREEN_API_PROXY_SECRET`), je redéploie, et le bouton « Tester » de la page Alertes commence à envoyer des vrais messages WhatsApp depuis la prod.

---

## Comment ça marche

```
[Vercel /api/whatsapp/test] ──POST──▶ [CF Worker (IP CF)] ──POST──▶ [Green API]
     avec x-proxy-secret          forward path + body           renvoie idMessage
                                                                      ▲
                                            ◀────── response ──────────┘
```

Le Worker :
- Vérifie le secret partagé (rejette si mauvais).
- Forwarde le chemin (`/waInstance.../sendMessage/...`) et le body vers `api.green-api.com`.
- Renvoie la réponse Green API telle quelle.

## Quotas gratuits

Plan Workers Free (aucune carte requise) :
- **100 000 requêtes/jour** — vous en utiliserez ~10-20/jour pour les alertes maintenance.
- **10 ms CPU/requête** — ce proxy en utilise ~2 ms.
- **Pas d'expiration** — le compte reste gratuit à vie.

Cloudflare ne demande *jamais* de carte pour le plan Workers Free tant que vous ne dépassez pas les quotas.
