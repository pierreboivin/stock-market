import { requestUrl } from "obsidian";
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

export interface PortfolioHistory {
	points: PortfolioPoint[];
	recentBuys: RecentBuy[];
}

interface YahooChartData {
	timestamp: number[];
	close: (number | null)[];
}

function rangeInterval(range: HistoryRange): string {
	return range === "1y" ? "1wk" : "1d";
}

function toDateKey(unixSeconds: number): string {
	return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}


async function fetchYahooChart(symbol: string, range: HistoryRange): Promise<YahooChartData | null> {
	const interval = rangeInterval(range);
	const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
	try {
		const resp = await requestUrl({ url });
		const result = resp.json?.chart?.result?.[0];
		if (!result) {
			console.warn(`[stock-market/history] Réponse vide de Yahoo Finance pour "${symbol}" (range=${range}).`, resp.json);
			return null;
		}
		const timestamp: number[] = result.timestamp ?? [];
		const close: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];
		if (timestamp.length === 0) {
			console.warn(`[stock-market/history] Aucun point de données pour "${symbol}" (range=${range}).`);
			return null;
		}
		return { timestamp, close };
	} catch (e) {
		console.warn(`[stock-market/history] Échec de la requête historique pour "${symbol}" (range=${range}) :`, e);
		return null;
	}
}

/*
 * Ne rejoue que la variation de prix des positions actuellement ouvertes, à
 * quantité constante (celle détenue aujourd'hui) sur toute la période. Ça
 * exclut volontairement l'effet des achats/ventes pendant la période : sans
 * ça, ajouter une position en cours de semaine fait bondir artificiellement
 * la "performance" (l'argent ajouté est compté comme un gain). Ce qu'on
 * affiche ici, c'est purement le gain en capital sur les positions actuelles.
 *
 * Corollaire (plage 7 jours seulement) : les parts achetées PENDANT la fenêtre
 * sont retirées de la quantité, puisque leur variation de prix d'avant l'achat
 * serait comptée comme un gain/perte jamais subi. On retire les parts et non le
 * titre entier — écarter XEQT au complet parce que 130 de ses 1690 parts ont été
 * achetées cette semaine ferait disparaître 92 000 $ du graphique. Les ventes ne
 * sont pas rejouées : réintégrer des parts déjà vendues compterait leur variation
 * post-vente comme un gain, le miroir exact du biais qu'on corrige ici.
 */
export async function computePortfolioHistory(
	openHoldings: OpenHolding[],
	symbolMap: Map<string, SymbolInfo>,
	range: HistoryRange
): Promise<PortfolioHistory> {
	if (openHoldings.length === 0) return { points: [], recentBuys: [] };

	const perHolding = await Promise.all(openHoldings.map(async (holding) => {
		const symbol = resolveSymbol(holding.ticker, holding.currency, symbolMap);
		if (!symbol) {
			console.warn(`[stock-market/history] Aucun symbole résolu pour le ticker "${holding.ticker}" (${holding.currency}) — exclu du graphique.`);
			return null;
		}

		const chart = await fetchYahooChart(symbol.symbol, range);
		if (!chart) return null;

		const fxRatio = symbol.price > 0 ? symbol.price_cad / symbol.price : 1;
		const closesByDate = new Map<string, number>();
		for (let i = 0; i < chart.timestamp.length; i++) {
			const close = chart.close[i];
			if (close == null) continue;
			closesByDate.set(toDateKey(chart.timestamp[i]), close * fxRatio);
		}
		if (closesByDate.size === 0) {
			console.warn(`[stock-market/history] Aucune clôture valide dans la réponse Yahoo Finance pour "${symbol.symbol}".`);
			return null;
		}

		return { ticker: holding.ticker, qty: holding.openQty, buys: holding.buys, closesByDate };
	}));

	type Fetched = { ticker: string; qty: number; buys: { date: string; quantity: number }[]; closesByDate: Map<string, number> };
	const fetched = perHolding.filter((x): x is Fetched => x !== null);

	if (fetched.length < openHoldings.length) {
		const resolved = new Set(fetched.map(v => v.ticker));
		const missing = openHoldings.filter(h => !resolved.has(h.ticker)).map(h => h.ticker);
		console.warn(`[stock-market/history] ${missing.length}/${openHoldings.length} titre(s) exclu(s) du graphique (voir logs ci-dessus) : ${missing.join(", ")}`);
	}

	const recentBuys: RecentBuy[] = [];
	if (fetched.length === 0) return { points: [], recentBuys };

	// Début réel de la fenêtre = plus ancienne clôture retournée par Yahoo, et
	// non "aujourd'hui − 7 jours" : `range=7d` renvoie 8 séances, donc jusqu'à
	// 10 jours calendaires en arrière. Un seuil calendaire laissait passer des
	// achats situés dans la fenêtre affichée.
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

	if (valid.length === 0) return { points: [], recentBuys };

	const allDatesSet = new Set<string>();
	for (const v of valid) {
		for (const d of v.closesByDate.keys()) allDatesSet.add(d);
	}
	const allDates = Array.from(allDatesSet).sort();

	// Remplissage arrière : chaque titre démarre à sa plus ancienne clôture
	// connue, même si celle-ci arrive après le début de la fenêtre. Un titre
	// n'est donc jamais compté à 0 (ce qui ferait exploser le "%" de
	// performance, ex. +527 %) et aucune date n'est perdue. C'est nécessaire
	// pour les titres peu liquides : NVDA.NE, sur 7 jours, ne rapporte qu'une
	// seule clôture non-nulle — jeter les dates antérieures vidait le graphique.
	const lastKnownPrice = new Map<number, number>();
	const backfilled: string[] = [];
	for (let idx = 0; idx < valid.length; idx++) {
		const dates = Array.from(valid[idx].closesByDate.keys()).sort();
		lastKnownPrice.set(idx, valid[idx].closesByDate.get(dates[0])!);
		if (dates[0] !== allDates[0]) backfilled.push(`${valid[idx].ticker} (dès ${dates[0]})`);
	}

	if (backfilled.length > 0) {
		console.warn(`[stock-market/history] ${backfilled.length}/${valid.length} titre(s) sans prix au début de la période — prix le plus ancien reporté en arrière : ${backfilled.join(", ")}`);
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

	return { points, recentBuys };
}
