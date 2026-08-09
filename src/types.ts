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

export interface SymbolInfo {
	symbol: string;
	currency: string;
	price: number;
	price_cad: number;
	updated_at: string;
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
