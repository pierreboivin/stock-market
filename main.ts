import { MarkdownView, Plugin } from "obsidian";
import { DEFAULT_SETTINGS, StockMarketSettingTab, StockMarketSettings } from "./src/settings";
import { renderPositions } from "./src/ui";

export default class StockMarketPlugin extends Plugin {
	settings: StockMarketSettings = DEFAULT_SETTINGS;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new StockMarketSettingTab(this.app, this));

		this.registerMarkdownCodeBlockProcessor("stock-gains", async (_source, el) => {
			await renderPositions(el, this.app, this.settings);
		});

		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf) => {
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
			})
		);
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
