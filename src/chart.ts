import { App } from "obsidian";
import { loadSymbols, loadTransactions } from "./data";
import { fmtCad, fmtGain, fmtPct, gainClass } from "./format";
import { computePortfolioHistory, HistoryFailure, HISTORY_RANGES, HistoryRange, PortfolioPoint } from "./history";
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
		totalEl.textContent = fmtCad(total);
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
			row.createEl("span", { text: fmtCad(item.value), cls: "sm-chart-legend-value" });
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

const HISTORY_CHART_W = 640;
const HISTORY_CHART_H = 220;
const HISTORY_PAD_TOP = 16;
const HISTORY_PAD_BOTTOM = 12;
const HISTORY_PAD_X = 8;

/** Pas « rond » (1, 2, 5 × 10^n) juste au-dessus de `raw`. */
function niceStep(raw: number): number {
	const exp = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
	const frac = raw / exp;
	if (frac <= 1) return exp;
	if (frac <= 2) return 2 * exp;
	if (frac <= 5) return 5 * exp;
	return 10 * exp;
}

/** Valeurs rondes comprises dans [min, max], ~4 graduations. */
function niceTicks(min: number, max: number): number[] {
	const spread = max - min;
	if (spread <= 0) return [min];
	const step = niceStep(spread / 4);
	const ticks: number[] = [];
	for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-6; v += step) {
		ticks.push(v);
	}
	return ticks;
}

function formatAxisValue(v: number, step: number): string {
	const decimals = step >= 10 ? 0 : step >= 1 ? 1 : 2;
	return v.toLocaleString("fr-CA", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

const MONTH_LETTERS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

function parseDay(dateStr: string): Date {
	return new Date(`${dateStr}T00:00:00`);
}

/** Identifiant du lundi de la semaine — robuste aux lundis fériés (pas de séance). */
function weekKey(d: Date): string {
	const monday = new Date(d);
	monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
	return monday.toDateString();
}

/**
 * Indices où commence une nouvelle semaine (1 mois) ou un nouveau mois (1 an).
 * Le 7 jours n'est pas découpé : une seule semaine à l'écran.
 */
function segmentStarts(points: PortfolioPoint[], range: HistoryRange): number[] {
	if (range === "7d") return [];
	const starts: number[] = [];
	for (let i = 1; i < points.length; i++) {
		const cur = parseDay(points[i].date);
		const prev = parseDay(points[i - 1].date);
		const changed = range === "1y"
			? cur.getMonth() !== prev.getMonth()
			: weekKey(cur) !== weekKey(prev);
		if (changed) starts.push(i);
	}
	return starts;
}

function formatHistoryDate(dateStr: string, range: HistoryRange): string {
	const d = new Date(`${dateStr}T00:00:00`);
	if (range === "1y") return d.toLocaleDateString("fr-CA", { month: "short", year: "2-digit" });
	return d.toLocaleDateString("fr-CA", { day: "2-digit", month: "short" });
}

function drawPortfolioLine(container: HTMLElement, points: PortfolioPoint[], range: HistoryRange): void {
	const values = points.map(p => p.valueCad);
	const min = Math.min(...values);
	const max = Math.max(...values);
	const spread = max - min || 1;

	const plotW = HISTORY_CHART_W - HISTORY_PAD_X * 2;
	const plotH = HISTORY_CHART_H - HISTORY_PAD_TOP - HISTORY_PAD_BOTTOM;

	const xAt = (i: number) => HISTORY_PAD_X + (points.length > 1 ? (i / (points.length - 1)) * plotW : plotW / 2);
	const yAt = (v: number) => HISTORY_PAD_TOP + plotH - ((v - min) / spread) * plotH;

	const first = values[0];
	const last = values[values.length - 1];
	const changeAmt = last - first;
	const changePct = first > 0 ? (changeAmt / first) * 100 : 0;
	const cls = gainClass(changeAmt);

	const summary = container.createDiv({ cls: "sm-history-summary" });
	summary.createEl("span", { text: fmtCad(last), cls: "sm-history-value" });
	summary.createEl("span", { text: `${fmtGain(changeAmt, "CAD")} (${fmtPct(changePct)})`, cls });

	const svg = svgEl("svg", {
		viewBox: `0 0 ${HISTORY_CHART_W} ${HISTORY_CHART_H}`,
		preserveAspectRatio: "none",
		class: "sm-history-svg",
	});

	const linePoints = points.map((p, i) => `${xAt(i).toFixed(2)},${yAt(p.valueCad).toFixed(2)}`).join(" ");
	const baseline = (HISTORY_PAD_TOP + plotH).toFixed(2);
	const areaPoints = `${xAt(0).toFixed(2)},${baseline} ${linePoints} ${xAt(points.length - 1).toFixed(2)},${baseline}`;

	const ticks = niceTicks(min, max);
	const tickStep = ticks.length > 1 ? ticks[1] - ticks[0] : spread;
	for (const tick of ticks) {
		const y = yAt(tick).toFixed(2);
		svg.appendChild(svgEl("line", {
			x1: HISTORY_PAD_X, x2: HISTORY_CHART_W - HISTORY_PAD_X, y1: y, y2: y,
			class: "sm-history-grid",
		}));
	}

	const starts = segmentStarts(points, range);
	for (const i of starts) {
		const x = xAt(i).toFixed(2);
		svg.appendChild(svgEl("line", {
			x1: x, x2: x, y1: HISTORY_PAD_TOP, y2: HISTORY_PAD_TOP + plotH,
			class: "sm-history-sep",
		}));
	}

	svg.appendChild(svgEl("polygon", { points: areaPoints, class: `sm-history-area ${cls}` }));
	svg.appendChild(svgEl("polyline", { points: linePoints, class: `sm-history-line ${cls}`, fill: "none" }));

	// L'axe Y est en HTML (et non dans le SVG) : `preserveAspectRatio: none`
	// étire le viewBox horizontalement, ce qui déformerait le texte.
	const plot = container.createDiv({ cls: "sm-history-plot" });
	const yAxis = plot.createDiv({ cls: "sm-history-yaxis" });
	for (const tick of ticks) {
		const label = yAxis.createEl("span", { text: formatAxisValue(tick, tickStep) });
		label.style.top = `${(yAt(tick) / HISTORY_CHART_H) * 100}%`;
	}
	plot.appendChild(svg);

	if (range === "1y") {
		// Une lettre par mois, centrée dans sa tranche. Elle remplace les dates
		// de début/fin, qui tomberaient pile sous la première et la dernière.
		const months = container.createDiv({ cls: "sm-history-months" });
		const bounds = [0].concat(starts, [points.length - 1]);
		for (let s = 0; s < bounds.length - 1; s++) {
			const from = bounds[s];
			const to = bounds[s + 1];
			const letter = MONTH_LETTERS[parseDay(points[from].date).getMonth()];
			const label = months.createEl("span", { text: letter });
			label.style.left = `${((xAt(from) + xAt(to)) / 2 / HISTORY_CHART_W) * 100}%`;
		}
		return;
	}

	const axis = container.createDiv({ cls: "sm-history-axis" });
	axis.createEl("span", { text: formatHistoryDate(points[0].date, range) });
	axis.createEl("span", { text: formatHistoryDate(points[points.length - 1].date, range) });
}

/**
 * Regroupe les échecs par raison — « 429 » sur seize titres est UNE panne, pas
 * seize. La liste des tickers reste, pour distinguer un symbole fautif d'une
 * limitation générale.
 */
function describeFailures(failures: HistoryFailure[]): string {
	const byReason = new Map<string, string[]>();
	for (const failure of failures) {
		const tickers = byReason.get(failure.reason);
		if (tickers) tickers.push(failure.ticker);
		else byReason.set(failure.reason, [failure.ticker]);
	}
	const parts: string[] = [];
	byReason.forEach((tickers, reason) => parts.push(`${reason} : ${tickers.join(", ")}`));
	return parts.join(" — ");
}

export async function renderNetWorthHistoryChart(el: HTMLElement, app: App, settings: StockMarketSettings): Promise<void> {
	const wrapper = el.createDiv({ cls: "sm-chart-wrapper" });
	wrapper.createEl("h4", { text: "Performance du portefeuille", cls: "sm-section-title" });

	const controls = wrapper.createDiv({ cls: "sm-history-controls" });
	const body = wrapper.createDiv({ cls: "sm-history-body" });

	let currentRange: HistoryRange = "7d";
	const buttons = new Map<HistoryRange, HTMLElement>();

	function setActive(range: HistoryRange): void {
		buttons.forEach((btn, key) => btn.toggleClass("is-active", key === range));
	}

	async function renderForRange(): Promise<void> {
		setActive(currentRange);
		body.empty();
		body.createEl("p", { text: "Chargement…", cls: "sm-chart-empty" });
		try {
			const transactions = await loadTransactions(app, settings);
			const symbols = await loadSymbols(app, settings);
			const symbolMap = buildSymbolMap(symbols);
			const openHoldings = computePositions(transactions)
				.filter(p => p.openQty > 0)
				.map(p => ({
					ticker: p.ticker,
					currency: p.currency,
					openQty: p.openQty,
					buys: p.transactions
						.filter(t => t.action === "buy")
						.map(t => ({ date: t.date, quantity: t.quantity })),
				}));
			const { points, recentBuys, failures } = computePortfolioHistory(openHoldings, symbolMap, currentRange);

			body.empty();
			if (points.length < 2) {
				if (failures.length > 0) {
					body.createEl("p", {
						text: `Cours indisponibles pour ${failures.length} titre(s) sur ${openHoldings.length}. ${describeFailures(failures)}`,
						cls: "sm-error",
					});
					return;
				}
				const allRecent = recentBuys.length > 0 && recentBuys.every(r => r.dropped)
					&& recentBuys.length === openHoldings.length;
				body.createEl("p", {
					text: allRecent
						? "Tous les titres ont été achetés pendant cette période."
						: "Pas assez de données pour cette période.",
					cls: "sm-chart-empty",
				});
				return;
			}
			drawPortfolioLine(body, points, currentRange);
			if (recentBuys.length > 0) {
				const detail = recentBuys
					.map(r => `${r.ticker} −${r.qty}${r.dropped ? " (position entière)" : ""}`)
					.join(", ");
				body.createEl("p", {
					text: `Parts achetées pendant la période, exclues du calcul : ${detail}`,
					cls: "sm-history-note",
				});
			}
			// Un titre manquant fausse la courbe en silence — le dire même quand
			// le graphique a pu être tracé avec les autres.
			if (failures.length > 0) {
				body.createEl("p", {
					text: `Absents du graphique — ${describeFailures(failures)}`,
					cls: "sm-history-note",
				});
			}
		} catch (e) {
			body.empty();
			body.createEl("p", { text: `Erreur : ${(e as Error).message}`, cls: "sm-error" });
		}
	}

	for (const range of HISTORY_RANGES) {
		const btn = controls.createEl("button", { text: range.label, cls: "sm-history-btn" });
		buttons.set(range.key, btn);
		btn.addEventListener("click", () => {
			if (currentRange === range.key) return;
			currentRange = range.key;
			void renderForRange();
		});
	}

	await renderForRange();
}
