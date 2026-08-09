# Stock Market — Notes pour Claude

## Architecture

```
main.ts          — Point d'entrée du plugin (thin shell, ~75 lignes)
src/
  types.ts       — Interfaces : Transaction, SymbolInfo, Position
  settings.ts    — StockMarketSettings, DEFAULT_SETTINGS, StockMarketSettingTab, SettingsHost
  positions.ts   — Logique métier : buildSymbolMap, resolveSymbol, computePositions
  format.ts      — Formatage pur : fmtPrice, fmtGain, fmtPct, gainClass
  data.ts        — I/O vault : loadSymbols, loadTransactions, createTransaction, addSymbolIfMissing
  ui.ts          — Rendu DOM : renderPositions, buildDetailTable
  modal.ts       — AddTransactionModal (formulaire d'ajout de transaction)
  chart.ts       — Graphiques : donut allocation, barres performance, ligne historique portefeuille
  history.ts     — computePortfolioHistory : reconstruit la valeur du portefeuille dans le temps via l'API chart Yahoo Finance
```

## Fichiers vault attendus

- **Transactions :** `090 - Finance/Stocks/Transactions/*.md` — un fichier par transaction, frontmatter YAML
- **Prix :** `090 - Finance/Stocks/symbols.json` — `{ symbols: SymbolInfo[] }`
- **Note principale :** `090 - Finance/Stocks/Liste des transactions.md` — `cssclasses: stock-transactions`

Ces chemins sont configurables dans les réglages du plugin (`settings.transactionsFolder`, `settings.symbolsPath`).

## Points techniques importants

### tsconfig : lib ES6
`Array.prototype.includes` n'est pas disponible — utiliser `indexOf(...) !== -1` partout.

### Bouton toolbar natif
Le bouton `⊕` est ajouté via `markdownView.addAction(...)` (même pattern que le plugin `recette`). Il n'est visible que sur les notes avec `cssclasses: stock-transactions`. La référence à l'élément est stockée dans `this.actionEl` et détruite à chaque changement de fichier actif.

### Rafraîchissement du tableau après création
La fonction `renderPositions` est ré-exécutée après une création de transaction via `this.refreshPositions` — un callback stocké dans le plugin, mis à jour à chaque rendu du code block `stock-gains`.

### Dépendance circulaire settings ↔ main
Résolue avec l'interface `SettingsHost` dans `settings.ts` — `StockMarketSettingTab` accepte un `SettingsHost` (typage structurel) au lieu d'importer `StockMarketPlugin` directement.

### Normalisation des tickers
`TSE:VGRO` → `VGRO.TO` dans `symbols.json` (voir `normalizeTicker` dans `data.ts`).

### Prix non défini
Si un symbole a `price: 0` ou `updated_at: ""` (ajouté récemment, prix pas encore mis à jour), le plugin affiche `—` au lieu de 0 avec -100%. Voir `isPriced()` dans `ui.ts`.

### Historique du portefeuille (`stock-chart-history`)
`symbols.json` ne garde qu'un instantané du prix courant (pas d'historique). Le graphique de performance (7j/1mois/1an) va donc chercher l'historique directement sur l'API chart de Yahoo Finance (`query1.finance.yahoo.com/v8/finance/chart/{symbol}`) au moment du rendu.

**Quantité fixée à la valeur actuelle, pas rejouée transaction par transaction.** `computePortfolioHistory` (dans `history.ts`) ne pondère chaque prix historique que par la quantité **actuellement détenue** (celle d'aujourd'hui), constante sur toute la période — elle ignore volontairement le moment réel des achats/ventes. Une première version rejouait les quantités selon les transactions, mais ça faisait bondir artificiellement le % de performance (ex. +527 % sur 7 jours) dès qu'un achat avait lieu pendant la période : l'argent ajouté était compté comme un gain. Ce graphique n'est donc PAS un rendement réel (money-weighted), seulement le gain/perte en capital des positions actuelles si elles avaient été détenues tout le long.

**Retrait des parts achetées pendant la fenêtre — plage `7d` uniquement.** Corollaire du point précédent : puisque la quantité d'aujourd'hui est appliquée à toute la période, la variation de prix *antérieure* à l'achat serait comptée comme un gain/perte jamais subi. Sur la plage 7 jours, `computePortfolioHistory` soustrait donc de `openQty` les parts achetées après le début de la fenêtre ; une position entièrement achetée pendant la fenêtre tombe à 0 et disparaît.

- **Ce sont les parts qui sont retirées, pas le titre.** Écarter XEQT.TO au complet parce que 130 de ses 1690 parts datent de la semaine ferait disparaître ~92 000 $ du graphique (195 586 $ affichés au lieu de 287 601 $ sur les données de 2026-08-08).
- **Le seuil est la plus ancienne clôture retournée par Yahoo, pas « aujourd'hui − 7 jours ».** `range=7d` renvoie 8 séances, soit jusqu'à 10 jours calendaires en arrière (2026-07-29 pour un rendu du 2026-08-08). Une première version comparait à un seuil calendaire : les achats du 31/07, pourtant dans la fenêtre affichée, passaient à travers et le filtre ne faisait rien.
- **Les ventes ne sont pas rejouées.** Réintégrer des parts vendues pendant la fenêtre compterait leur variation post-vente comme un gain — le miroir exact du biais corrigé ici.
- **1 mois et 1 an ne filtrent rien** : l'achat y pèse proportionnellement moins.

Les parts retirées sont retournées dans `recentBuys` (`{ ticker, qty, dropped }`) et listées sous le graphique. Ordre de grandeur du correctif : +13 439 $ / +4,90 % sans filtre → +13 296 $ / +5,03 % avec — le biais est réel mais modeste, l'essentiel de la variation vient bien du marché.

**Remplissage arrière des titres peu liquides.** Les calendriers de bourse diffèrent (TSX/NASDAQ) et certains titres n'ont que quelques clôtures non-nulles sur une courte période — `NVDA.NE` (Cboe Canada) n'en a qu'**une seule** sur 7 jours. Chaque titre démarre donc à sa plus ancienne clôture connue, reportée en arrière jusqu'au début de la fenêtre. Une version précédente sautait plutôt les dates où un titre n'avait pas encore rapporté de prix (pour ne jamais le compter à 0, ce qui ferait exploser le %) : le graphique 7 jours retombait à 1 point et affichait « Pas assez de données pour cette période. » Un `console.warn` liste les titres remplis en arrière.

**Découpage vertical de l'axe X.** `segmentStarts` (dans `chart.ts`) repère les indices où change la semaine (plage 1 mois) ou le mois (plage 1 an) et y trace un trait pointillé ; le 7 jours n'est pas découpé. Le changement de semaine est détecté via le lundi de la semaine (`weekKey`) plutôt qu'en cherchant les lundis dans les dates : un lundi férié n'a pas de séance et la ligne sauterait. Sur 1 an, une lettre par mois (`MONTH_LETTERS`) est centrée dans sa tranche et **remplace** les dates de début/fin, qui tomberaient pile sous la première et la dernière lettre. Les tranches de bord sont partielles : une plage 1 an couvre 13 mois calendaires, d'où deux lettres identiques aux extrémités.

La conversion CAD des tickers USD est approximée avec le taux de change *courant* (`price_cad / price` du symbole dans `symbols.json`) appliqué à tout l'historique — ce n'est pas le taux réel de chaque date passée.

## Build

```bash
npm run dev      # watch + hot-reload
npm run build    # production (sortie : main.js)
```
