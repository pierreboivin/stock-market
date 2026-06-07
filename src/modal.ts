import { App, Modal, Notice, Setting, TextComponent } from "obsidian";
import { createTransaction, addSymbolIfMissing } from "./data";
import { StockMarketSettings } from "./settings";
import { Transaction } from "./types";

export class AddTransactionModal extends Modal {
	private settings: StockMarketSettings;
	private onSuccess: () => Promise<void>;

	constructor(app: App, settings: StockMarketSettings, onSuccess: () => Promise<void>) {
		super(app);
		this.settings = settings;
		this.onSuccess = onSuccess;
	}

	onOpen(): void {
		const { contentEl } = this;
		this.titleEl.setText("Nouvelle transaction");

		const today = new Date().toISOString().slice(0, 10);
		const tx: Partial<Transaction> = {
			date: today,
			action: "buy",
			currency: "CAD",
		};

		let totalComponent: TextComponent | null = null;
		let totalManual = false;

		const syncTotal = () => {
			if (totalManual || !totalComponent) return;
			const val = Math.round((tx.quantity ?? 0) * (tx.unit_price ?? 0) * 100) / 100;
			tx.total = val;
			totalComponent.setValue(val > 0 ? String(val) : "");
		};

		new Setting(contentEl)
			.setName("Date")
			.addText(text => text
				.setValue(today)
				.onChange(v => tx.date = v.trim()));

		new Setting(contentEl)
			.setName("Ticker")
			.setDesc("Ex : VFV.TO · NVDA · TSE:VGRO")
			.addText(text => text
				.setPlaceholder("VFV.TO")
				.onChange(v => tx.ticker = v.trim().toUpperCase()));

		new Setting(contentEl)
			.setName("Action")
			.addDropdown(dd => dd
				.addOption("buy", "Achat")
				.addOption("sell", "Vente")
				.setValue("buy")
				.onChange(v => tx.action = v as "buy" | "sell"));

		new Setting(contentEl)
			.setName("Devise")
			.addDropdown(dd => dd
				.addOption("CAD", "CAD")
				.addOption("USD", "USD")
				.setValue("CAD")
				.onChange(v => tx.currency = v as "CAD" | "USD"));

		new Setting(contentEl)
			.setName("Quantité")
			.addText(text => text
				.setPlaceholder("0")
				.onChange(v => { tx.quantity = parseFloat(v) || 0; syncTotal(); }));

		new Setting(contentEl)
			.setName("Prix unitaire")
			.addText(text => text
				.setPlaceholder("0.00")
				.onChange(v => { tx.unit_price = parseFloat(v) || 0; syncTotal(); }));

		new Setting(contentEl)
			.setName("Total")
			.setDesc("Calculé automatiquement — modifiable si des frais s'appliquent")
			.addText(text => {
				totalComponent = text;
				text.setPlaceholder("0.00").onChange(v => {
					totalManual = true;
					tx.total = parseFloat(v) || 0;
				});
			});

		new Setting(contentEl)
			.setName("Note")
			.addText(text => text
				.setPlaceholder("Optionnel")
				.onChange(v => tx.note = v.trim() || undefined));

		const submit = async () => {
			const errors = this.validate(tx);
			if (errors.length > 0) {
				new Notice(errors.join("\n"));
				return;
			}
			try {
				const symbolAdded = await addSymbolIfMissing(this.app, this.settings, tx.ticker!, tx.currency!);
				await createTransaction(this.app, this.settings, tx as Transaction);
				this.close();
				await this.onSuccess();
				let msg = "Transaction créée.";
				if (symbolAdded) msg += `\nSymbole "${tx.ticker}" ajouté à symbols.json — pensez à mettre le prix à jour.`;
				new Notice(msg);
			} catch (e) {
				new Notice(`Erreur : ${(e as Error).message}`);
			}
		};

		contentEl.addEventListener("keydown", (e: KeyboardEvent) => {
			if (e.key === "Enter") submit();
		});

		new Setting(contentEl)
			.addButton(btn => btn
				.setButtonText("Créer la transaction")
				.setCta()
				.onClick(submit));
	}

	private validate(tx: Partial<Transaction>): string[] {
		const errors: string[] = [];
		if (!tx.date || !/^\d{4}-\d{2}-\d{2}$/.test(tx.date))
			errors.push("Date invalide (format attendu : YYYY-MM-DD).");
		if (!tx.ticker)
			errors.push("Le ticker est requis.");
		if (!tx.quantity || tx.quantity <= 0)
			errors.push("La quantité doit être supérieure à 0.");
		if (!tx.unit_price || tx.unit_price <= 0)
			errors.push("Le prix unitaire doit être supérieur à 0.");
		if (!tx.total || tx.total <= 0)
			errors.push("Le total doit être supérieur à 0.");
		return errors;
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
