// Espace insécable. Les montants sont écrits « 1 234.56 CAD » : trois mots
// séparés par des espaces, donc trois occasions de retour à la ligne. Les
// cellules sont pourtant en `white-space: nowrap` — sauf que cette règle est
// à la merci du thème et de l'app (une feuille plus spécifique qui remet
// `normal` sur les cellules de tableau suffit, ce qui arrive en mobile).
// L'insécable règle le problème en amont : sans occasion de coupure, aucune
// feuille de style ne peut couper un montant en deux.
const NBSP = " ";

// Insère un espace insécable comme séparateur de milliers (ex. "1234.56" →
// "1 234.56"), en gardant le point décimal utilisé partout ailleurs dans le
// plugin.
function groupThousands(fixed: string): string {
	const negative = fixed.charAt(0) === "-";
	const unsigned = negative ? fixed.slice(1) : fixed;
	const [intPart, decPart] = unsigned.split(".");
	const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
	return (negative ? "-" : "") + grouped + (decPart !== undefined ? `.${decPart}` : "");
}

export function fmtPrice(amount: number, currency: string): string {
	return `${groupThousands(amount.toFixed(2))}${NBSP}${currency}`;
}

export function fmtGain(amount: number, currency: string): string {
	const sign = amount >= 0 ? "+" : "";
	return `${sign}${groupThousands(amount.toFixed(2))}${NBSP}${currency}`;
}

export function fmtPct(pct: number): string {
	const sign = pct >= 0 ? "+" : "";
	return `${sign}${pct.toFixed(2)}${NBSP}%`;
}

/** Montant CAD arrondi au dollar, pour les graphiques. */
export function fmtCad(amount: number): string {
	return `${amount.toLocaleString("fr-CA", { maximumFractionDigits: 0 }).replace(/\s/g, NBSP)}${NBSP}CAD`;
}

export function gainClass(amount: number): string {
	return amount >= 0 ? "sm-positive" : "sm-negative";
}
