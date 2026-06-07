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

## Build

```bash
npm run dev      # watch + hot-reload
npm run build    # production (sortie : main.js)
```
