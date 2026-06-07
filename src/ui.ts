import { App } from "obsidian";
import { loadSymbols, loadTransactions } from "./data";
import { fmtGain, fmtPct, fmtPrice, gainClass } from "./format";
import { buildSymbolMap, computePositions, resolveSymbol } from "./positions";
import { StockMarketSettings } from "./settings";
import { Position, SymbolInfo } from "./types";

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

export async function renderPositions(el: HTMLElement, app: App, settings: StockMarketSettings): Promise<void> {
	try {
		const symbols = await loadSymbols(app, settings);
		const symbolMap = buildSymbolMap(symbols);
		const transactions = await loadTransactions(app, settings);
		const positions = computePositions(transactions);

		const open = positions
			.filter(p => p.openQty > 0)
			.sort((a, b) => a.ticker.localeCompare(b.ticker));

		const closed = positions
			.filter(p => p.openQty === 0 && p.totalSoldQty > 0)
			.sort((a, b) => a.ticker.localeCompare(b.ticker));

		const wrapper = el.createDiv({ cls: "sm-wrapper" });

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

		if (symbols.length > 0) {
			wrapper.createEl("p", { text: `Prix mis à jour : ${symbols[0].updated_at}`, cls: "sm-updated" });
		}

	} catch (e) {
		el.createEl("p", { text: `Erreur : ${(e as Error).message}`, cls: "sm-error" });
	}
}
