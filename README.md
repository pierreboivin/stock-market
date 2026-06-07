# Stock Market — Plugin Obsidian

Affiche un tableau de positions boursières calculées à partir de tes fichiers de transactions. Le plugin regroupe les achats et ventes par ticker, calcule le **prix moyen pondéré (PMP)**, et affiche les gains latents (positions ouvertes) et réalisés (positions fermées).

---

## Installation

1. Copier le dossier `stock-market/` dans `.obsidian/plugins/`
2. Dans Obsidian → Réglages → Plugins communautaires → désactiver le mode sans échec → activer **Stock Market**

---

## Prérequis

Le plugin s'attend à deux éléments dans le vault :

### 1. Fichiers de transactions

Chaque transaction est une note Markdown dans `090 - Finance/Stocks/Transactions/` avec ce frontmatter :

```yaml
---
date: 2024-08-12
ticker: VFV
action: buy          # "buy" ou "sell"
quantity: 10
unit_price: 160.00
total: 1600.00
currency: CAD        # "CAD" ou "USD"
note: Achat mensuel  # optionnel — affiché en tooltip (ⓘ)
---
```

### 2. Fichier de prix actuels

Le fichier `090 - Finance/Stocks/symbols.json` contient les cours en temps réel :

```json
{
  "symbols": [
    {
      "symbol": "VFV.TO",
      "currency": "CAD",
      "price": 182.90,
      "price_cad": 182.90,
      "updated_at": "2026-06-07T02:32:46Z"
    },
    {
      "symbol": "NVDA",
      "currency": "USD",
      "price": 205.10,
      "price_cad": 285.77,
      "updated_at": "2026-06-07T02:32:46Z"
    }
  ]
}
```

---

## Utilisation

Dans n'importe quelle note Obsidian, insère ce bloc de code :

````markdown
```stock-gains

```
````

Le tableau s'affiche automatiquement avec toutes les positions.

### Affichage pleine largeur + mode lecture automatique

Pour la note dédiée, ajouter en frontmatter :

```yaml
---
cssclasses: stock-transactions
---
```

Cela active :
- **Largeur pleine page** — le tableau utilise tout l'espace disponible
- **Mode lecture automatique** — la note s'ouvre toujours en consultation (jamais en édition)
- **Propriétés masquées** — le frontmatter n'est pas affiché

---

## Résolution des tickers

Le plugin fait correspondre le `ticker` de la transaction à un symbole dans `symbols.json` selon ces règles, dans l'ordre :

| Ticker dans la transaction | Logique | Exemple de match |
|---|---|---|
| `TSE:VGRO` | Préfixe `XXX:` → `BASE.TO` | `VGRO.TO` |
| `VFV` + CAD | Cherche `VFV.TO` puis `VFV.NE` | `VFV.TO` |
| `NVDA` + CAD | Cherche `NVDA.TO` puis `NVDA.NE` | `NVDA.NE` |
| `NVDA` + USD | Match direct | `NVDA` |

---

## Calcul du Prix Moyen Pondéré (PMP)

Pour chaque ticker, les transactions sont traitées chronologiquement :

**Achat :**
```
totalCost += quantité × prix_unitaire
openQty   += quantité
pmp        = totalCost / openQty
```

**Vente :**
```
gainRéalisé += (prix_vente - pmp) × quantité
totalCost   -= pmp × quantité
openQty     -= quantité
```

Le PMP reste inchangé lors d'une vente — seul le coût total est ajusté proportionnellement. C'est la méthode recommandée par l'ARC pour le calcul des gains en capital.

---

## Structure du tableau

### Positions ouvertes

| Ticker | Qté | Prix moy. | Prix actuel | Gain latent $ | Gain latent % |
|---|---|---|---|---|---|

Cliquer sur une position déroule le détail de chaque transaction individuelle.

### Positions fermées

Apparaît uniquement si tu as vendu la totalité d'une position.

| Ticker | Qté vendue | Prix moy. | Gain réalisé $ | Gain réalisé % |
|---|---|---|---|---|

### Détail (tiroir)

Visible en cliquant sur le `▶` d'une position :

| Date | Action | Qté | Prix unitaire | Coût total | Gain latent $ | Gain latent % |
|---|---|---|---|---|---|---|

Les transactions avec un champ `note` affichent un indicateur `ⓘ` — survoler avec la souris révèle la note.

---

## Développement

```bash
npm install
npm run dev      # mode watch (hot-reload)
npm run build    # build de production
```

Prérequis : Node.js ≥ 18
