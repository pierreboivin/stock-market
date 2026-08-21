import { resolveSymbol } from "./positions";
import { SymbolInfo } from "./types";

export type HistoryRange = "7d" | "1mo" | "1y";

export const HISTORY_RANGES: { key: HistoryRange; label: string }[] = [
	{ key: "7d", label: "7 jours" },
	{ key: "1mo", label: "1 mois" },
	{ key: "1y", label: "1 an" },
];

export interface OpenHolding {
	ticker: string;
	currency: string;
	openQty: number;
	/** Achats de la position, du plus ancien au plus récent. */
	buys: { date: string; quantity: number }[];
}

export interface PortfolioPoint {
	date: string;
	valueCad: number;
}

/** Parts achetées pendant la fenêtre affichée, retirées du calcul. */
export interface RecentBuy {
	ticker: string;
	qty: number;
	/** true si la position entière a été achetée pendant la fenêtre. */
	dropped: boolean;
}

/** Titre absent du graphique, avec la raison — affichable telle quelle. */
export interface HistoryFailure {
	ticker: string;
	reason: string;
}

export interface PortfolioHistory {
	points: PortfolioPoint[];
	recentBuys: RecentBuy[];
	failures: HistoryFailure[];
}

function cutoffDate(range: HistoryRange): string {
	const d = new Date();
	if (range === "7d") d.setDate(d.getDate() - 7);
	else if (range === "1mo") d.setMonth(d.getMonth() - 1);
	else d.setFullYear(d.getFullYear() - 1);
	return d.toISOString().slice(0, 10);
}

/*
 * L'historique vient du champ `history` de symbols.json (alimenté par le script python
 * côté serveur), pas d'un appel réseau à chaque rendu : plus de limite de débit, de
 * reprise ni de cache à gérer ici. `price_cad` y est déjà la conversion du jour même -
 * avant, la conversion CAD des titres USD était approximée avec le taux de change
 * courant appliqué à tout l'historique.
 *
 * Ne rejoue que la variation de prix des positions actuellement ouvertes, à quantité
 * constante (celle détenue aujourd'hui) sur toute la période. Ça exclut volontairement
 * l'effet des achats/ventes pendant la période : sans ça, ajouter une position en cours
 * de semaine fait bondir artificiellement la "performance" (l'argent ajouté est compté
 * comme un gain). Ce qu'on affiche ici, c'est purement le gain en capital sur les
 * positions actuelles.
 *
 * Corollaire (plage 7 jours seulement) : les parts achetées PENDANT la fenêtre sont
 * retirées de la quantité, puisque leur variation de prix d'avant l'achat serait comptée
 * comme un gain/perte jamais subi. On retire les parts et non le titre entier - écarter
 * XEQT au complet parce que 130 de ses 1690 parts ont été achetées cette semaine ferait
 * disparaître 92 000 $ du graphique. Les ventes ne sont pas rejouées : réintégrer des
 * parts déjà vendues compterait leur variation post-vente comme un gain, le miroir exact
 * du biais qu'on corrige ici.
 */
export function computePortfolioHistory(
	openHoldings: OpenHolding[],
	symbolMap: Map<string, SymbolInfo>,
	range: HistoryRange
): PortfolioHistory {
	if (openHoldings.length === 0) return { points: [], recentBuys: [], failures: [] };

	const cutoff = cutoffDate(range);

	type Fetched = { ticker: string; qty: number; buys: { date: string; quantity: number }[]; closesByDate: Map<string, number> };

	const fetched: Fetched[] = [];
	const failures: HistoryFailure[] = [];

	for (const holding of openHoldings) {
		const symbol = resolveSymbol(holding.ticker, holding.currency, symbolMap);
		if (!symbol) {
			failures.push({ ticker: holding.ticker, reason: "absent de symbols.json" });
			continue;
		}
		if (!symbol.history || symbol.history.length === 0) {
			failures.push({ ticker: holding.ticker, reason: "aucun historique dans symbols.json" });
			continue;
		}

		const closesByDate = new Map<string, number>();
		for (const point of symbol.history) {
			if (point.date >= cutoff) closesByDate.set(point.date, point.price_cad);
		}
		if (closesByDate.size === 0) {
			failures.push({ ticker: holding.ticker, reason: "aucune clôture sur la période" });
			continue;
		}

		fetched.push({ ticker: holding.ticker, qty: holding.openQty, buys: holding.buys, closesByDate });
	}

	if (failures.length > 0) {
		const detail = failures.map(f => `${f.ticker} (${f.reason})`).join(", ");
		console.warn(`[stock-market/history] ${failures.length}/${openHoldings.length} titre(s) exclu(s) du graphique : ${detail}`);
	}

	const recentBuys: RecentBuy[] = [];
	if (fetched.length === 0) return { points: [], recentBuys, failures };

	// Début réel de la fenêtre = plus ancienne clôture disponible parmi les titres
	// détenus, et non "aujourd'hui − 7 jours" : un titre qui n'a pas de séance ce
	// jour-là (jour férié) décale la première date réelle de quelques jours.
	const windowStart = Array.from(new Set(fetched.flatMap(v => Array.from(v.closesByDate.keys())))).sort()[0];

	let valid = fetched;
	if (range === "7d") {
		valid = [];
		for (const v of fetched) {
			const boughtInWindow = v.buys
				.filter(b => b.date > windowStart)
				.reduce((sum, b) => sum + b.quantity, 0);
			const qty = v.qty - boughtInWindow;
			if (boughtInWindow > 0) {
				recentBuys.push({ ticker: v.ticker, qty: boughtInWindow, dropped: qty <= 0 });
			}
			if (qty > 0) valid.push({ ...v, qty });
		}
		if (recentBuys.length > 0) {
			const detail = recentBuys.map(r => `${r.ticker} −${r.qty}${r.dropped ? " (position entière)" : ""}`).join(", ");
			console.warn(`[stock-market/history] Parts achetées depuis le ${windowStart} retirées du graphique 7 jours : ${detail}`);
		}
	}

	if (valid.length === 0) return { points: [], recentBuys, failures };

	const allDatesSet = new Set<string>();
	for (const v of valid) {
		for (const d of v.closesByDate.keys()) allDatesSet.add(d);
	}
	const allDates = Array.from(allDatesSet).sort();

	// Remplissage arrière : un titre plus récent que la fenêtre (ex. entré en bourse
	// depuis) démarre à sa plus ancienne clôture connue plutôt que de laisser un trou -
	// sans ça une date sans lui ferait chuter le total à tort.
	const lastKnownPrice = new Map<number, number>();
	const backfilled: string[] = [];
	for (let idx = 0; idx < valid.length; idx++) {
		const dates = Array.from(valid[idx].closesByDate.keys()).sort();
		lastKnownPrice.set(idx, valid[idx].closesByDate.get(dates[0])!);
		if (dates[0] !== allDates[0]) backfilled.push(`${valid[idx].ticker} (dès ${dates[0]})`);
	}

	if (backfilled.length > 0) {
		console.warn(`[stock-market/history] ${backfilled.length}/${valid.length} titre(s) sans historique au début de la période — prix le plus ancien reporté en arrière : ${backfilled.join(", ")}`);
	}

	const points: PortfolioPoint[] = [];
	for (const date of allDates) {
		for (let idx = 0; idx < valid.length; idx++) {
			const close = valid[idx].closesByDate.get(date);
			if (close != null) lastKnownPrice.set(idx, close);
		}

		let total = 0;
		for (let idx = 0; idx < valid.length; idx++) {
			total += valid[idx].qty * lastKnownPrice.get(idx)!;
		}
		points.push({ date, valueCad: total });
	}

	return { points, recentBuys, failures };
}
