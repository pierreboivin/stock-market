import { App, TFile, parseYaml } from "obsidian";
import { StockMarketSettings } from "./settings";
import { SymbolInfo, Transaction } from "./types";

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
