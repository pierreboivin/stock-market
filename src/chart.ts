import { App } from "obsidian";
import { loadSymbols, loadTransactions } from "./data";
import { fmtGain, fmtPct, gainClass } from "./format";
import { buildSymbolMap, computePositions, resolveSymbol } from "./positions";
import { StockMarketSettings } from "./settings";
import { SymbolInfo } from "./types";

const PALETTE = [
	"#4f9cf9", "#f97316", "#22c55e", "#a855f7", "#ef4444",
	"#06b6d4", "#eab308", "#ec4899", "#14b8a6", "#8b5cf6", "#84cc16", "#f43f5e",
];

function isPriced(sym: SymbolInfo | undefined): sym is SymbolInfo {
	return !!sym && sym.price > 0 && sym.updated_at !== "";
}

function svgEl(tag: string, attrs: Record<string, string | number>): Element {
	const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
	for (const key of Object.keys(attrs)) {
		el.setAttribute(key, String(attrs[key]));
	}
	return el;
}

function donutSlicePath(
	cx: number, cy: number, outerR: number, innerR: number,
	startAngle: number, endAngle: number
): string {
	const x1 = cx + outerR * Math.cos(startAngle);
	const y1 = cy + outerR * Math.sin(startAngle);
	const x2 = cx + outerR * Math.cos(endAngle);
	const y2 = cy + outerR * Math.sin(endAngle);
	const x3 = cx + innerR * Math.cos(endAngle);
	const y3 = cy + innerR * Math.sin(endAngle);
	const x4 = cx + innerR * Math.cos(startAngle);
	const y4 = cy + innerR * Math.sin(startAngle);
	const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
	return [
		`M ${x1.toFixed(2)} ${y1.toFixed(2)}`,
		`A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`,
		`L ${x3.toFixed(2)} ${y3.toFixed(2)}`,
		`A ${innerR} ${innerR} 0 ${largeArc} 0 ${x4.toFixed(2)} ${y4.toFixed(2)}`,
		"Z",
	].join(" ");
}

export async function renderAllocationChart(el: HTMLElement, app: App, settings: StockMarketSettings): Promise<void> {
	try {
		const symbols = await loadSymbols(app, settings);
		const symbolMap = buildSymbolMap(symbols);
		const transactions = await loadTransactions(app, settings);
		const positions = computePositions(transactions);

		const items = positions
			.filter(p => p.openQty > 0)
			.map(p => {
				const sym = resolveSymbol(p.ticker, p.currency, symbolMap);
				if (!isPriced(sym)) return null;
				return { ticker: p.ticker, value: p.openQty * sym.price_cad };
			})
			.filter((x): x is { ticker: string; value: number } => x !== null)
			.sort((a, b) => b.value - a.value);

		if (items.length === 0) {
			el.createEl("p", { text: "Aucune position ouverte avec un prix connu.", cls: "sm-chart-empty" });
			return;
		}

		const total = items.reduce((sum, item) => sum + item.value, 0);

		const top = items.slice(0, 10);
		const autreValue = items.slice(10).reduce((sum, item) => sum + item.value, 0);
		const displayItems: { ticker: string; value: number; color: string }[] = top.map((item, i) => ({
			ticker: item.ticker,
			value: item.value,
			color: PALETTE[i % PALETTE.length],
		}));
		if (autreValue > 0) {
			displayItems.push({ ticker: "Autre", value: autreValue, color: "#94a3b8" });
		}

		const wrapper = el.createDiv({ cls: "sm-chart-wrapper" });
		wrapper.createEl("h4", { text: "Répartition du portefeuille", cls: "sm-section-title" });
		const inner = wrapper.createDiv({ cls: "sm-chart-donut-wrapper" });

		const CX = 200, CY = 200, OUTER_R = 160, INNER_R = 104;
		const svg = svgEl("svg", { viewBox: "0 0 400 400", width: "400", height: "400" });

		let angle = -(Math.PI / 2);
		for (let i = 0; i < displayItems.length; i++) {
			const slice = (displayItems[i].value / total) * 2 * Math.PI;
			const path = svgEl("path", {
				d: donutSlicePath(CX, CY, OUTER_R, INNER_R, angle, angle + slice),
				fill: displayItems[i].color,
				stroke: "var(--background-primary)",
				"stroke-width": "2",
			});
			svg.appendChild(path);
			angle += slice;
		}

		const labelEl = svgEl("text", {
			x: CX, y: CY - 12,
			"text-anchor": "middle",
			fill: "var(--text-muted)",
			"font-size": "14",
			"font-family": "var(--font-interface)",
		});
		labelEl.textContent = "Valeur totale";
		svg.appendChild(labelEl);

		const totalEl = svgEl("text", {
			x: CX, y: CY + 16,
			"text-anchor": "middle",
			fill: "var(--text-normal)",
			"font-size": "17",
			"font-weight": "600",
			"font-family": "var(--font-monospace)",
		});
		totalEl.textContent = `${total.toLocaleString("fr-CA", { maximumFractionDigits: 0 })} CAD`;
		svg.appendChild(totalEl);

		inner.appendChild(svg);

		const legend = inner.createDiv({ cls: "sm-chart-legend" });
		for (let i = 0; i < displayItems.length; i++) {
			const item = displayItems[i];
			const pct = (item.value / total) * 100;
			const row = legend.createDiv({ cls: "sm-chart-legend-row" });
			const swatch = row.createDiv({ cls: "sm-chart-swatch" });
			swatch.style.background = item.color;
			row.createEl("span", { text: item.ticker, cls: "sm-chart-legend-ticker" });
			row.createEl("span", { text: `${pct.toFixed(1)} %`, cls: "sm-chart-legend-pct" });
			row.createEl("span", { text: `${item.value.toLocaleString("fr-CA", { maximumFractionDigits: 0 })} CAD`, cls: "sm-chart-legend-value" });
		}
	} catch (e) {
		el.createEl("p", { text: `Erreur : ${(e as Error).message}`, cls: "sm-error" });
	}
}

export async function renderPerformanceChart(el: HTMLElement, app: App, settings: StockMarketSettings): Promise<void> {
	try {
		const symbols = await loadSymbols(app, settings);
		const symbolMap = buildSymbolMap(symbols);
		const transactions = await loadTransactions(app, settings);
		const positions = computePositions(transactions);

		const items = positions
			.filter(p => p.openQty > 0)
			.map(p => {
				const sym = resolveSymbol(p.ticker, p.currency, symbolMap);
				if (!isPriced(sym) || p.pmp === 0) return null;
				const gainAmt = (sym.price - p.pmp) * p.openQty;
				const gainPct = ((sym.price - p.pmp) / p.pmp) * 100;
				return { ticker: p.ticker, gainAmt, gainPct, currency: p.currency };
			})
			.filter((x): x is { ticker: string; gainAmt: number; gainPct: number; currency: string } => x !== null)
			.sort((a, b) => b.gainPct - a.gainPct);

		if (items.length === 0) {
			el.createEl("p", { text: "Aucune position ouverte avec un prix connu.", cls: "sm-chart-empty" });
			return;
		}

		const maxAbs = items.reduce((m, item) => Math.max(m, Math.abs(item.gainPct)), 0);
		const wrapper = el.createDiv({ cls: "sm-chart-wrapper" });
		wrapper.createEl("h4", { text: "Performance des positions", cls: "sm-section-title" });
		const inner = wrapper.createDiv({ cls: "sm-chart-bars-wrapper" });

		for (const item of items) {
			const row = inner.createDiv({ cls: "sm-chart-bar-row" });
			row.createEl("span", { text: item.ticker, cls: "sm-chart-bar-label" });

			const track = row.createDiv({ cls: "sm-chart-bar-track" });
			const bar = track.createDiv({ cls: "sm-chart-bar " + gainClass(item.gainPct) });
			const widthPct = maxAbs > 0 ? (Math.abs(item.gainPct) / maxAbs) * 50 : 0;
			if (item.gainPct >= 0) {
				bar.style.left = "50%";
				bar.style.width = `${widthPct.toFixed(2)}%`;
			} else {
				bar.style.right = "50%";
				bar.style.width = `${widthPct.toFixed(2)}%`;
			}

			const values = row.createDiv({ cls: "sm-chart-bar-values" });
			values.createEl("span", { text: fmtPct(item.gainPct), cls: gainClass(item.gainPct) });
			values.createEl("span", { text: fmtGain(item.gainAmt, item.currency), cls: "sm-chart-bar-amount" });
		}
	} catch (e) {
		el.createEl("p", { text: `Erreur : ${(e as Error).message}`, cls: "sm-error" });
	}
}
