import { App } from "obsidian";
import { loadSymbols, loadTransactions } from "./data";
import { fmtGain, fmtPct, fmtPrice, gainClass } from "./format";
import { buildSymbolMap, computePositions, resolveSymbol } from "./positions";
import { StockMarketSettings } from "./settings";
import { Position, SymbolInfo } from "./types";

function formatUpdatedAt(iso: string): string {
	try {
		return new Date(iso).toLocaleString("fr-CA", { dateStyle: "short", timeStyle: "short" });
	} catch (_) {
		return iso;
	}
}

function isPriced(symbol: SymbolInfo | undefined): symbol is SymbolInfo {
	return !!symbol && symbol.price > 0 && symbol.updated_at !== "";
}

async function loadData(app: App, settings: StockMarketSettings) {
	const symbols = await loadSymbols(app, settings);
	const symbolMap = buildSymbolMap(symbols);
	const transactions = await loadTransactions(app, settings);
	const positions = computePositions(transactions);
	return { symbols, symbolMap, positions };
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

function renderOpenSection(wrapper: HTMLElement, open: Position[], symbolMap: Map<string, SymbolInfo>): void {
	if (open.length === 0) return;
	wrapper.createEl("h4", { text: "Positions ouvertes", cls: "sm-section-title" });
	const grid = wrapper.createDiv({ cls: "sm-grid" });

	const header = grid.createDiv({ cls: "sm-header sm-cols-open" });
	["Ticker", "Qté", "Prix moy.", "Prix actuel", "Valeur", "Gain latent $", "Gain latent %"].forEach(h =>
		header.createEl("span", { text: h })
	);

	for (const pos of open) {
		const symbol = resolveSymbol(pos.ticker, pos.currency, symbolMap);
		const details = grid.createEl("details", { cls: "sm-position" });
		const summary = details.createEl("summary", { cls: "sm-cols-open" });

		summary.createEl("span", { text: pos.ticker, cls: "sm-ticker" });
		summary.createEl("span", { text: String(pos.openQty) });
		summary.createEl("span", { text: fmtPrice(pos.pmp, pos.currency) });

		if (!isPriced(symbol)) {
			["—", "—", "—", "—"].forEach(v => summary.createEl("span", { text: v }));
		} else {
			summary.createEl("span", { text: fmtPrice(symbol.price, symbol.currency) });
			summary.createEl("span", { text: fmtPrice(symbol.price * pos.openQty, symbol.currency) });
			const gainAmt = (symbol.price - pos.pmp) * pos.openQty;
			const gainPct = ((symbol.price - pos.pmp) / pos.pmp) * 100;
			summary.createEl("span", { text: fmtGain(gainAmt, symbol.currency), cls: gainClass(gainAmt) });
			summary.createEl("span", { text: fmtPct(gainPct), cls: gainClass(gainPct) });
		}

		buildDetailTable(details.createDiv({ cls: "sm-detail" }), pos, isPriced(symbol) ? symbol : undefined);
	}
}

function renderClosedSection(wrapper: HTMLElement, closed: Position[]): void {
	if (closed.length === 0) return;
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

function valueCAD(pos: Position, symbolMap: Map<string, SymbolInfo>): number {
	const sym = resolveSymbol(pos.ticker, pos.currency, symbolMap);
	return (sym && sym.price_cad > 0) ? pos.openQty * sym.price_cad : 0;
}

export async function renderOpenPositions(el: HTMLElement, app: App, settings: StockMarketSettings): Promise<void> {
	try {
		const { symbols, symbolMap, positions } = await loadData(app, settings);
		const open = positions
			.filter(p => p.openQty > 0)
			.sort((a, b) => valueCAD(b, symbolMap) - valueCAD(a, symbolMap));

		const wrapper = el.createDiv({ cls: "sm-wrapper" });
		renderOpenSection(wrapper, open, symbolMap);

		if (symbols.length > 0) {
			wrapper.createEl("p", { text: `Prix mis à jour : ${formatUpdatedAt(symbols[0].updated_at)}`, cls: "sm-updated" });
		}
	} catch (e) {
		el.createEl("p", { text: `Erreur : ${(e as Error).message}`, cls: "sm-error" });
	}
}

export async function renderClosedPositions(el: HTMLElement, app: App, settings: StockMarketSettings): Promise<void> {
	try {
		const { positions } = await loadData(app, settings);
		const closed = positions
			.filter(p => p.openQty === 0 && p.totalSoldQty > 0)
			.sort((a, b) => a.ticker.localeCompare(b.ticker));

		const wrapper = el.createDiv({ cls: "sm-wrapper" });
		renderClosedSection(wrapper, closed);
	} catch (e) {
		el.createEl("p", { text: `Erreur : ${(e as Error).message}`, cls: "sm-error" });
	}
}

export async function renderPositions(el: HTMLElement, app: App, settings: StockMarketSettings): Promise<void> {
	try {
		const { symbols, symbolMap, positions } = await loadData(app, settings);

		const open = positions
			.filter(p => p.openQty > 0)
			.sort((a, b) => valueCAD(b, symbolMap) - valueCAD(a, symbolMap));

		const closed = positions
			.filter(p => p.openQty === 0 && p.totalSoldQty > 0)
			.sort((a, b) => a.ticker.localeCompare(b.ticker));

		const wrapper = el.createDiv({ cls: "sm-wrapper" });
		renderOpenSection(wrapper, open, symbolMap);
		renderClosedSection(wrapper, closed);

		if (symbols.length > 0) {
			wrapper.createEl("p", { text: `Prix mis à jour : ${formatUpdatedAt(symbols[0].updated_at)}`, cls: "sm-updated" });
		}
	} catch (e) {
		el.createEl("p", { text: `Erreur : ${(e as Error).message}`, cls: "sm-error" });
	}
}
