import { App, TFile, parseYaml } from "obsidian";
import { StockMarketSettings } from "./settings";
import { SymbolInfo, Transaction } from "./types";

// "TSE:VGRO" → "VGRO.TO" pour l'entrée dans symbols.json
function normalizeTicker(ticker: string): string {
	if (ticker.includes(":")) {
		return ticker.split(":")[1] + ".TO";
	}
	return ticker;
}

async function resolveAvailablePath(app: App, base: string, ext: string): Promise<string> {
	let path = `${base}${ext}`;
	let i = 2;
	while (app.vault.getAbstractFileByPath(path)) {
		path = `${base} ${i}${ext}`;
		i++;
	}
	return path;
}

export async function createTransaction(app: App, settings: StockMarketSettings, tx: Transaction): Promise<void> {
	const safeTicker = tx.ticker.replace(/:/g, "-");
	const base = `${settings.transactionsFolder}/${tx.date} ${safeTicker} ${tx.action}`;
	const path = await resolveAvailablePath(app, base, ".md");

	const lines = [
		"---",
		`date: ${tx.date}`,
		`ticker: ${tx.ticker}`,
		`action: ${tx.action}`,
		`quantity: ${tx.quantity}`,
		`unit_price: ${tx.unit_price}`,
		`total: ${tx.total}`,
		`currency: ${tx.currency}`,
	];
	if (tx.note) lines.push(`note: "${tx.note}"`);
	lines.push("---", "");

	await app.vault.create(path, lines.join("\n"));
}

// Retourne true si le symbole a été ajouté
export async function addSymbolIfMissing(app: App, settings: StockMarketSettings, ticker: string, currency: string): Promise<boolean> {
	const file = app.vault.getAbstractFileByPath(settings.symbolsPath);
	if (!(file instanceof TFile)) return false;

	const raw = JSON.parse(await app.vault.read(file)) as { symbols: SymbolInfo[] };
	const normalized = normalizeTicker(ticker);

	const exists = raw.symbols.some(s => s.symbol === normalized || s.symbol === ticker);
	if (exists) return false;

	raw.symbols.push({ symbol: normalized, currency, price: 0, price_cad: 0, updated_at: "" });
	await app.vault.modify(file, JSON.stringify(raw, null, 2));
	return true;
}

export async function loadSymbols(app: App, settings: StockMarketSettings): Promise<SymbolInfo[]> {
	const { symbolsPath } = settings;
	const file = app.vault.getAbstractFileByPath(symbolsPath);
	if (!(file instanceof TFile)) throw new Error(`Fichier introuvable : ${symbolsPath}`);
	const data = JSON.parse(await app.vault.read(file)) as { symbols: SymbolInfo[] };
	return data.symbols;
}

export async function loadTransactions(app: App, settings: StockMarketSettings): Promise<Transaction[]> {
	const { transactionsFolder } = settings;
	const files = app.vault.getMarkdownFiles().filter(f =>
		f.path.startsWith(transactionsFolder + "/")
	);

	const results = await Promise.all(files.map(async (file) => {
		const content = await app.vault.read(file);
		const match = content.match(/^---\n([\s\S]*?)\n---/);
		if (!match) return null;
		try {
			const data = parseYaml(match[1]) as Transaction;
			return (data?.ticker && data?.action) ? data : null;
		} catch {
			return null;
		}
	}));

	return results.filter((t): t is Transaction => t !== null);
}
