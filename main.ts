import { MarkdownView, Plugin, WorkspaceLeaf } from "obsidian";
import { AddTransactionModal } from "./src/modal";
import { DEFAULT_SETTINGS, StockMarketSettingTab, StockMarketSettings } from "./src/settings";
import { renderAllocationChart, renderPerformanceChart } from "./src/chart";
import { renderClosedPositions, renderOpenPositions, renderPositions } from "./src/ui";

export default class StockMarketPlugin extends Plugin {
	settings: StockMarketSettings = DEFAULT_SETTINGS;
	private actionEl: HTMLElement | null = null;
	private refreshCallbacks: Map<string, () => Promise<void>> = new Map();

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new StockMarketSettingTab(this.app, this));

		this.registerMarkdownCodeBlockProcessor("stock-gains", async (_source, el) => {
			const cb = async () => { el.empty(); await renderPositions(el, this.app, this.settings); };
			this.refreshCallbacks.set("stock-gains", cb);
			await renderPositions(el, this.app, this.settings);
		});

		this.registerMarkdownCodeBlockProcessor("stock-gains-open", async (_source, el) => {
			const cb = async () => { el.empty(); await renderOpenPositions(el, this.app, this.settings); };
			this.refreshCallbacks.set("stock-gains-open", cb);
			await renderOpenPositions(el, this.app, this.settings);
		});

		this.registerMarkdownCodeBlockProcessor("stock-gains-closed", async (_source, el) => {
			const cb = async () => { el.empty(); await renderClosedPositions(el, this.app, this.settings); };
			this.refreshCallbacks.set("stock-gains-closed", cb);
			await renderClosedPositions(el, this.app, this.settings);
		});

		this.registerMarkdownCodeBlockProcessor("stock-chart-allocation", async (_source, el) => {
			const cb = async () => { el.empty(); await renderAllocationChart(el, this.app, this.settings); };
			this.refreshCallbacks.set("stock-chart-allocation", cb);
			await renderAllocationChart(el, this.app, this.settings);
		});

		this.registerMarkdownCodeBlockProcessor("stock-chart-performance", async (_source, el) => {
			const cb = async () => { el.empty(); await renderPerformanceChart(el, this.app, this.settings); };
			this.refreshCallbacks.set("stock-chart-performance", cb);
			await renderPerformanceChart(el, this.app, this.settings);
		});

		this.app.workspace.onLayoutReady(() => this.updateAddAction());

		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf) => {
				this.enforcePreviewMode(leaf);
				this.updateAddAction();
			})
		);
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private updateAddAction(): void {
		this.actionEl?.remove();
		this.actionEl = null;

		const file = this.app.workspace.getActiveFile();
		const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!file || !markdownView) return;

		const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
		const raw = frontmatter?.cssclasses ?? [];
		const classes: string[] = Array.isArray(raw) ? raw : String(raw).split(/\s+/);
		if (classes.indexOf("stock-transactions") === -1) return;

		this.actionEl = markdownView.addAction("circle-plus", "Ajouter une transaction", () => {
			new AddTransactionModal(this.app, this.settings, async () => {
				for (const cb of this.refreshCallbacks.values()) {
					await cb();
				}
			}).open();
		});
	}

	private enforcePreviewMode(leaf: WorkspaceLeaf | null): void {
		if (!leaf) return;
		const view = leaf.view;
		if (!(view instanceof MarkdownView)) return;
		const file = view.file;
		if (!file) return;
		const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
		const raw = frontmatter?.cssclasses ?? [];
		const classes: string[] = Array.isArray(raw) ? raw : String(raw).split(/\s+/);
		if (classes.indexOf("stock-transactions") !== -1 && view.getMode() !== "preview") {
			view.setState({ mode: "preview" }, { history: false });
		}
	}
}
