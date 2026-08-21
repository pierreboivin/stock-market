export interface Transaction {
	date: string;
	ticker: string;
	action: "buy" | "sell";
	quantity: number;
	unit_price: number;
	total: number;
	currency: string;
	note?: string;
}

export interface SymbolHistoryPoint {
	date: string;
	price: number;
	price_cad: number;
}

export interface SymbolInfo {
	symbol: string;
	currency: string;
	price: number;
	price_cad: number;
	updated_at: string;
	/** Alimenté par le script python côté serveur — absent pour un symbole tout juste ajouté. */
	history?: SymbolHistoryPoint[];
}

export interface Position {
	ticker: string;
	currency: string;
	openQty: number;
	pmp: number;
	totalCost: number;
	realizedGain: number;
	totalSoldQty: number;
	transactions: Transaction[];
}
