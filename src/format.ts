export function fmtPrice(amount: number, currency: string): string {
	return `${amount.toFixed(2)} ${currency}`;
}

export function fmtGain(amount: number, currency: string): string {
	const sign = amount >= 0 ? "+" : "";
	return `${sign}${amount.toFixed(2)} ${currency}`;
}

export function fmtPct(pct: number): string {
	const sign = pct >= 0 ? "+" : "";
	return `${sign}${pct.toFixed(2)} %`;
}

export function gainClass(amount: number): string {
	return amount >= 0 ? "sm-positive" : "sm-negative";
}
