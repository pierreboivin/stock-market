import { Position, SymbolInfo, Transaction } from "./types";

export function buildSymbolMap(symbols: SymbolInfo[]): Map<string, SymbolInfo> {
	return new Map(symbols.map(s => [s.symbol, s]));
}

export function resolveSymbol(ticker: string, txCurrency: string, map: Map<string, SymbolInfo>): SymbolInfo | undefined {
	// "TSE:VGRO" → "VGRO.TO"
	if (ticker.includes(":")) {
		const base = ticker.split(":")[1];
		return map.get(`${base}.TO`) ?? map.get(base);
	}

	const direct = map.get(ticker);
	if (direct && direct.currency === txCurrency) return direct;

	// Transaction en CAD : préférer les bourses canadiennes
	if (txCurrency === "CAD") {
		return map.get(`${ticker}.TO`) ?? map.get(`${ticker}.NE`) ?? direct;
	}

	return direct;
}

export function computePositions(transactions: Transaction[]): Position[] {
	const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
	const posMap = new Map<string, Position>();

	for (const tx of sorted) {
		if (!posMap.has(tx.ticker)) {
			posMap.set(tx.ticker, {
				ticker: tx.ticker,
				currency: tx.currency,
				openQty: 0,
				pmp: 0,
				totalCost: 0,
				realizedGain: 0,
				totalSoldQty: 0,
				transactions: [],
			});
		}

		const pos = posMap.get(tx.ticker)!;
		pos.transactions.push(tx);

		if (tx.action === "buy") {
			pos.totalCost += tx.quantity * tx.unit_price;
			pos.openQty += tx.quantity;
			pos.pmp = pos.totalCost / pos.openQty;
		} else if (tx.action === "sell" && pos.openQty > 0) {
			const qty = Math.min(tx.quantity, pos.openQty);
			pos.realizedGain += (tx.unit_price - pos.pmp) * qty;
			pos.totalCost -= pos.pmp * qty;
			pos.openQty -= qty;
			pos.totalSoldQty += qty;
		}
	}

	return Array.from(posMap.values());
}
