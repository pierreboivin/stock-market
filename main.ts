import { MarkdownView, Plugin, TFile, parseYaml } from "obsidian";

const TRANSACTIONS_FOLDER = "090 - Finance/Stocks/Transactions";
const SYMBOLS_PATH = "090 - Finance/Stocks/symbols.json";

interface Transaction {
	date: string;
	ticker: string;
	action: "buy" | "sell";
	quantity: number;
	unit_price: number;
	total: number;
	currency: string;
	note?: string;
}

interface SymbolInfo {
	symbol: string;
	currency: string;
	price: number;
	price_cad: number;
	updated_at: string;
}

interface Position {
	ticker: string;
	currency: string;
	openQty: number;
	pmp: number;
	totalCost: number;
	realizedGain: number;
	totalSoldQty: number;
	transactions: Transaction[];
}

// O(1) lookup par symbol (ex. "VFV.TO", "NVDA")
function buildSymbolMap(symbols: SymbolInfo[]): Map<string, SymbolInfo> {
	return new Map(symbols.map(s => [s.symbol, s]));
}

function resolveSymbol(ticker: string, txCurrency: string, map: Map<string, SymbolInfo>): SymbolInfo | undefined {
	// "TSE:VGRO" → "VGRO.TO"
	if (ticker.includes(":")) {
		const base = ticker.split(":")[1];
		return map.get(`${base}.TO`) ?? map.get(base);
	}

	// Match direct avec même devise
	const direct = map.get(ticker);
	if (direct && direct.currency === txCurrency) return direct;

	// Transaction en CAD : préférer les bourses canadiennes
	if (txCurrency === "CAD") {
		return map.get(`${ticker}.TO`) ?? map.get(`${ticker}.NE`) ?? direct;
	}

	return direct;
}

function computePositions(transactions: Transaction[]): Position[] {
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

function fmtPrice(amount: number, currency: string): string {
	return `${amount.toFixed(2)} ${currency}`;
}

function fmtGain(amount: number, currency: string): string {
	const sign = amount >= 0 ? "+" : "";
	return `${sign}${amount.toFixed(2)} ${currency}`;
}

function fmtPct(pct: number): string {
	const sign = pct >= 0 ? "+" : "";
	return `${sign}${pct.toFixed(2)} %`;
}

function gainClass(amount: number): string {
	return amount >= 0 ? "sm-positive" : "sm-negative";
}

function buildDetailTable(container: HTMLElement, pos: Position, symbol: SymbolInfo | undefined): void {
	const table = container.createEl("table", { cls: "sm-detail-table" });
	const hr = table.createEl("thead").createEl("tr");
	["Date", "Action", "Qté", "Prix unitaire", "Coût total", "Gain latent $", "Gain latent %"].forEach(h =>
		hr.createEl("th", { text: h })
	);
	const tbody = table.createEl("tbody");

	for (const tx of pos.transactions) {
		const row = tbody.createEl("tr");

		const dateTd = row.createEl("td", { text: tx.date });
		if (tx.note) {
			dateTd.createEl("span", { text: "ⓘ", cls: "sm-note-indicator", attr: { title: tx.note } });
		}

		const actionTd = row.createEl("td", { text: tx.action === "buy" ? "Achat" : "Vente" });
		actionTd.addClass(tx.action === "buy" ? "sm-buy" : "sm-sell");

		row.createEl("td", { text: String(tx.quantity) });
		row.createEl("td", { text: fmtPrice(tx.unit_price, tx.currency) });
		row.createEl("td", { text: fmtPrice(tx.unit_price * tx.quantity, tx.currency) });

		if (tx.action === "buy" && symbol) {
			const gainAmt = (symbol.price - tx.unit_price) * tx.quantity;
			const gainPct = ((symbol.price - tx.unit_price) / tx.unit_price) * 100;
			row.createEl("td", { text: fmtGain(gainAmt, symbol.currency), cls: gainClass(gainAmt) });
			row.createEl("td", { text: fmtPct(gainPct), cls: gainClass(gainPct) });
		} else {
			row.createEl("td", { text: "—" });
			row.createEl("td", { text: "—" });
		}
	}
}

export default class StockMarketPlugin extends Plugin {
	async onload(): Promise<void> {
		this.registerMarkdownCodeBlockProcessor("stock-gains", async (source, el) => {
			await this.renderPositions(el);
		});

		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf) => {
				if (!leaf) return;
				const view = leaf.view;
				if (!(view instanceof MarkdownView)) return;
				const file = view.file;
				if (!file) return;
				const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
				// cssclasses peut être une string ou un tableau selon le YAML
				const raw = frontmatter?.cssclasses ?? [];
				const classes: string[] = Array.isArray(raw) ? raw : String(raw).split(/\s+/);
				if (classes.indexOf("stock-transactions") !== -1 && view.getMode() !== "preview") {
					view.setState({ mode: "preview" }, { history: false });
				}
			})
		);
	}

	private async renderPositions(el: HTMLElement): Promise<void> {
		try {
			const symbols = await this.loadSymbols();
			const symbolMap = buildSymbolMap(symbols);
			const transactions = await this.loadTransactions();
			const positions = computePositions(transactions);

			const open = positions
				.filter(p => p.openQty > 0)
				.sort((a, b) => a.ticker.localeCompare(b.ticker));

			const closed = positions
				.filter(p => p.openQty === 0 && p.totalSoldQty > 0)
				.sort((a, b) => a.ticker.localeCompare(b.ticker));

			const wrapper = el.createDiv({ cls: "sm-wrapper" });

			// ── Positions ouvertes ──
			if (open.length > 0) {
				wrapper.createEl("h4", { text: "Positions ouvertes", cls: "sm-section-title" });
				const grid = wrapper.createDiv({ cls: "sm-grid" });

				const header = grid.createDiv({ cls: "sm-header sm-cols-open" });
				["Ticker", "Qté", "Prix moy.", "Prix actuel", "Gain latent $", "Gain latent %"].forEach(h =>
					header.createEl("span", { text: h })
				);

				for (const pos of open) {
					const symbol = resolveSymbol(pos.ticker, pos.currency, symbolMap);
					const details = grid.createEl("details", { cls: "sm-position" });
					const summary = details.createEl("summary", { cls: "sm-cols-open" });

					summary.createEl("span", { text: pos.ticker, cls: "sm-ticker" });
					summary.createEl("span", { text: String(pos.openQty) });
					summary.createEl("span", { text: fmtPrice(pos.pmp, pos.currency) });

					if (!symbol) {
						["—", "—", "—"].forEach(v => summary.createEl("span", { text: v }));
					} else {
						summary.createEl("span", { text: fmtPrice(symbol.price, symbol.currency) });
						const gainAmt = (symbol.price - pos.pmp) * pos.openQty;
						const gainPct = ((symbol.price - pos.pmp) / pos.pmp) * 100;
						summary.createEl("span", { text: fmtGain(gainAmt, symbol.currency), cls: gainClass(gainAmt) });
						summary.createEl("span", { text: fmtPct(gainPct), cls: gainClass(gainPct) });
					}

					buildDetailTable(details.createDiv({ cls: "sm-detail" }), pos, symbol);
				}
			}

			// ── Positions fermées ──
			if (closed.length > 0) {
				wrapper.createEl("h4", { text: "Positions fermées", cls: "sm-section-title" });
				const grid = wrapper.createDiv({ cls: "sm-grid" });

				const header = grid.createDiv({ cls: "sm-header sm-cols-closed" });
				["Ticker", "Qté vendue", "Prix moy.", "Gain réalisé $", "Gain réalisé %"].forEach(h =>
					header.createEl("span", { text: h })
				);

				for (const pos of closed) {
					const details = grid.createEl("details", { cls: "sm-position" });
					const summary = details.createEl("summary", { cls: "sm-cols-closed" });

					summary.createEl("span", { text: pos.ticker, cls: "sm-ticker" });
					summary.createEl("span", { text: String(pos.totalSoldQty) });
					summary.createEl("span", { text: fmtPrice(pos.pmp, pos.currency) });

					const gainPct = pos.pmp > 0
						? (pos.realizedGain / (pos.pmp * pos.totalSoldQty)) * 100
						: 0;
					summary.createEl("span", { text: fmtGain(pos.realizedGain, pos.currency), cls: gainClass(pos.realizedGain) });
					summary.createEl("span", { text: fmtPct(gainPct), cls: gainClass(gainPct) });

					buildDetailTable(details.createDiv({ cls: "sm-detail" }), pos, undefined);
				}
			}

			// ── Horodatage ──
			if (symbols.length > 0) {
				wrapper.createEl("p", { text: `Prix mis à jour : ${symbols[0].updated_at}`, cls: "sm-updated" });
			}

		} catch (e) {
			el.createEl("p", { text: `Erreur : ${(e as Error).message}`, cls: "sm-error" });
		}
	}

	private async loadSymbols(): Promise<SymbolInfo[]> {
		const file = this.app.vault.getAbstractFileByPath(SYMBOLS_PATH);
		if (!(file instanceof TFile)) throw new Error(`Fichier introuvable : ${SYMBOLS_PATH}`);
		const data = JSON.parse(await this.app.vault.read(file)) as { symbols: SymbolInfo[] };
		return data.symbols;
	}

	private async loadTransactions(): Promise<Transaction[]> {
		const files = this.app.vault.getMarkdownFiles().filter(f =>
			f.path.startsWith(TRANSACTIONS_FOLDER + "/")
		);

		// Lecture parallèle de tous les fichiers
		const results = await Promise.all(files.map(async (file) => {
			const content = await this.app.vault.read(file);
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
}
