import { MarkdownView, Plugin, WorkspaceLeaf } from "obsidian";
import { AddTransactionModal } from "./src/modal";
import { DEFAULT_SETTINGS, StockMarketSettingTab, StockMarketSettings } from "./src/settings";
import { renderPositions } from "./src/ui";

export default class StockMarketPlugin extends Plugin {
	settings: StockMarketSettings = DEFAULT_SETTINGS;
	private actionEl: HTMLElement | null = null;
	private refreshPositions: (() => Promise<void>) | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new StockMarketSettingTab(this.app, this));

		this.registerMarkdownCodeBlockProcessor("stock-gains", async (_source, el) => {
			this.refreshPositions = async () => {
				el.empty();
				await renderPositions(el, this.app, this.settings);
			};
			await renderPositions(el, this.app, this.settings);
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
				await this.refreshPositions?.();
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
