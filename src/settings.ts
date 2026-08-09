import { App, PluginSettingTab, Setting } from "obsidian";

export interface StockMarketSettings {
	transactionsFolder: string;
	symbolsPath: string;
}

export const DEFAULT_SETTINGS: StockMarketSettings = {
	transactionsFolder: "090 - Finance/Stocks/Transactions",
	symbolsPath: "090 - Finance/Stocks/symbols.json",
};

interface SettingsHost {
	app: App;
	settings: StockMarketSettings;
	saveSettings(): Promise<void>;
}

export class StockMarketSettingTab extends PluginSettingTab {
	private plugin: SettingsHost;

	constructor(app: App, plugin: SettingsHost) {
		super(app, plugin as any);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Dossier des transactions")
			.setDesc("Chemin relatif au vault (ex. : 090 - Finance/Stocks/Transactions)")
			.addText(text => text
				.setPlaceholder(DEFAULT_SETTINGS.transactionsFolder)
				.setValue(this.plugin.settings.transactionsFolder)
				.onChange(async (value) => {
					this.plugin.settings.transactionsFolder = value.trim();
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Fichier des symboles")
			.setDesc("Chemin relatif au vault vers le fichier JSON des cours (ex. : 090 - Finance/Stocks/symbols.json)")
			.addText(text => text
				.setPlaceholder(DEFAULT_SETTINGS.symbolsPath)
				.setValue(this.plugin.settings.symbolsPath)
				.onChange(async (value) => {
					this.plugin.settings.symbolsPath = value.trim();
					await this.plugin.saveSettings();
				}));
	}
}
