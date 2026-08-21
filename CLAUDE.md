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
  history.ts     — computePortfolioHistory : reconstruit la valeur du portefeuille dans le temps depuis symbols.json
```

## Fichiers vault attendus

- **Transactions :** `090 - Finance/Stocks/Transactions/*.md` — un fichier par transaction, frontmatter YAML
- **Prix :** `090 - Finance/Stocks/symbols.json` — `{ symbols: SymbolInfo[] }`, chaque `SymbolInfo` porte `history?: { date, price, price_cad }[]` (alimenté par un script externe, absent pour un symbole tout juste ajouté)
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

### Les montants ne se coupent pas : espaces insécables, pas seulement du CSS
`format.ts` écrit ses montants « 1 234.56 CAD » — trois groupes séparés par des espaces, donc trois occasions de retour à la ligne. Les cellules du tiroir de détail sont bien en `white-space: nowrap`, mais à (0,1,1) : n'importe quelle feuille de l'app ou du thème visant `.markdown-rendered table td` la bat et remet `normal`, et le montant se coupe en plein milieu — ce qui arrivait en mobile.

Le séparateur de milliers, l'espace avant la devise et celui avant `%` sont donc des **insécables (U+00A0)**. Sans occasion de coupure, aucune feuille de style ne peut couper un montant en deux. La règle CSS reste, remontée à `.sm-detail .sm-detail-table td` avec `!important`, mais en ceinture — le correctif est en amont. `fmtCad()` sert aux graphiques (`toLocaleString` produit des espaces ordinaires, remplacés).

### Prix non défini
Si un symbole a `price: 0` ou `updated_at: ""` (ajouté récemment, prix pas encore mis à jour), le plugin affiche `—` au lieu de 0 avec -100%. Voir `isPriced()` dans `ui.ts`.

### Historique du portefeuille (`stock-chart-history`)
Depuis le 2026-08-20, l'historique vient du champ `history` de `symbols.json` (`{ date, price, price_cad }[]`, alimenté par le script python côté serveur mentionné dans `090 - Finance/Stocks/`) plutôt que d'un appel à l'API chart de Yahoo Finance à chaque rendu. `computePortfolioHistory` (dans `history.ts`) est donc **synchrone** — plus de réseau, plus de rate limit, cache ou reprise à gérer ici (`fetchYahooChart`/`mapThrottled`/`spaceOut`/`clearRateLimitCooldown` ont disparu avec l'ancienne implémentation). `cutoffDate()` calcule une date de coupure calendaire (aujourd'hui − 7 jours / 1 mois / 1 an) et filtre directement les points de `history` dont `date >= cutoff` — pas de notion d'« intervalle » à demander, l'historique local est déjà quotidien.

`price_cad` vient directement de l'historique, déjà converti au taux du jour — plus d'approximation au taux de change *courant* appliqué à tout l'historique (l'ancien défaut documenté ici).

**Quantité fixée à la valeur actuelle, pas rejouée transaction par transaction.** `computePortfolioHistory` ne pondère chaque prix historique que par la quantité **actuellement détenue** (celle d'aujourd'hui), constante sur toute la période — elle ignore volontairement le moment réel des achats/ventes. Une première version rejouait les quantités selon les transactions, mais ça faisait bondir artificiellement le % de performance (ex. +527 % sur 7 jours) dès qu'un achat avait lieu pendant la période : l'argent ajouté était compté comme un gain. Ce graphique n'est donc PAS un rendement réel (money-weighted), seulement le gain/perte en capital des positions actuelles si elles avaient été détenues tout le long.

**Retrait des parts achetées pendant la fenêtre — plage `7d` uniquement.** Corollaire du point précédent : puisque la quantité d'aujourd'hui est appliquée à toute la période, la variation de prix *antérieure* à l'achat serait comptée comme un gain/perte jamais subi. Sur la plage 7 jours, `computePortfolioHistory` soustrait donc de `openQty` les parts achetées après le début de la fenêtre ; une position entièrement achetée pendant la fenêtre tombe à 0 et disparaît.

- **Ce sont les parts qui sont retirées, pas le titre.** Écarter XEQT.TO au complet parce qu'une partie de ses parts datent de la semaine ferait disparaître une grosse fraction du graphique.
- **Le seuil est la plus ancienne clôture disponible dans la fenêtre, pas « aujourd'hui − 7 jours ».** Un jour férié ou un titre inscrit récemment peut décaler la première date réelle de quelques jours.
- **Les ventes ne sont pas rejouées.** Réintégrer des parts vendues pendant la fenêtre compterait leur variation post-vente comme un gain — le miroir exact du biais corrigé ici.
- **1 mois et 1 an ne filtrent rien** : l'achat y pèse proportionnellement moins.

Les parts retirées sont retournées dans `recentBuys` (`{ ticker, qty, dropped }`) et listées sous le graphique.

**Remplissage arrière.** Un titre dont l'historique local démarre après le début de la fenêtre (position entrée en bourse récemment, ex. `LEGO`) part de sa plus ancienne clôture connue, reportée en arrière — jamais compté à 0, ce qui ferait exploser le %. Un `console.warn` liste les titres concernés.

**Découpage vertical de l'axe X.** `segmentStarts` (dans `chart.ts`) repère les indices où change la semaine (plage 1 mois) ou le mois (plage 1 an) et y trace un trait pointillé ; le 7 jours n'est pas découpé. Le changement de semaine est détecté via le lundi de la semaine (`weekKey`) plutôt qu'en cherchant les lundis dans les dates : un lundi férié n'a pas de séance et la ligne sauterait. Sur 1 an, une lettre par mois (`MONTH_LETTERS`) est centrée dans sa tranche et **remplace** les dates de début/fin, qui tomberaient pile sous la première et la dernière lettre. Les tranches de bord sont partielles : une plage 1 an couvre 13 mois calendaires, d'où deux lettres identiques aux extrémités. Fonctionne à l'identique que les points soient quotidiens (le cas maintenant, y compris sur 1 an) ou plus espacés — la logique ne suppose aucune densité de points, seulement des dates triées.

**Les échecs remontent jusqu'à l'écran.** `PortfolioHistory.failures` porte `{ ticker, reason }` — absent de `symbols.json`, `history` absent/vide, ou aucune clôture dans la fenêtre. `describeFailures` regroupe par raison. Plus de bouton « Réessayer » : une même lecture locale donne toujours le même résultat, retenter ne change rien tant que `symbols.json` n'a pas été régénéré (dans ce cas, rouvrir la note suffit).

La recherche de ticker (`query1.finance.yahoo.com/v1/finance/search`, dans `modal.ts`, pour valider un symbole à l'ajout d'une transaction) est un endpoint séparé, toujours en direct — non concerné par ce changement.

## Build

```bash
npm run dev      # watch + hot-reload
npm run build    # production (sortie : main.js)
```
