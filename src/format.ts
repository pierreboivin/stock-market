// Insère un espace comme séparateur de milliers (ex. "1234.56" → "1 234.56"),
// en gardant le point décimal utilisé partout ailleurs dans le plugin.
function groupThousands(fixed: string): string {
	const negative = fixed.charAt(0) === "-";
	const unsigned = negative ? fixed.slice(1) : fixed;
	const [intPart, decPart] = unsigned.split(".");
	const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
	return (negative ? "-" : "") + grouped + (decPart !== undefined ? `.${decPart}` : "");
}

export function fmtPrice(amount: number, currency: string): string {
	return `${groupThousands(amount.toFixed(2))} ${currency}`;
}

export function fmtGain(amount: number, currency: string): string {
	const sign = amount >= 0 ? "+" : "";
	return `${sign}${groupThousands(amount.toFixed(2))} ${currency}`;
}

export function fmtPct(pct: number): string {
	const sign = pct >= 0 ? "+" : "";
	return `${sign}${pct.toFixed(2)} %`;
}

export function gainClass(amount: number): string {
	return amount >= 0 ? "sm-positive" : "sm-negative";
}
