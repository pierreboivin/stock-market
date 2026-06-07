# TODO — Stock Market Plugin

## En cours / Priorité haute

### Ajout de transaction via capture Disnat

- [ ] Bouton « Importer depuis Disnat »
- [ ] Modal pour coller / glisser-déposer une capture d'écran du relevé Disnat
- [ ] Extraction OCR des champs (date, ticker, qté, prix, montant, devise) via API vision (Claude ?)
- [ ] Prévisualisation des champs extraits avec possibilité de correction avant confirmation
- [ ] Écriture du fichier de transaction après validation

---

## Améliorations planifiées

- [ ] Mise à jour automatique de `symbols.json` (fetch des prix via Yahoo Finance ou autre API)
- [ ] Afficher la devise de chaque position plus clairement (badge CAD/USD)
- [ ] Gérer les positions partiellement fermées (afficher le gain réalisé partiel dans la section "ouvertes")
- [ ] Trier les positions par gain % (clic sur en-tête de colonne)
- [ ] Afficher la valeur totale du portefeuille en CAD en bas du tableau

---

## Idées à évaluer

- Graphique d'évolution du portefeuille dans le temps
- Vue par secteur / catégorie (ETF, actions, etc.)
- Export CSV des transactions
