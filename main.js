var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => StockMarketPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian3 = require("obsidian");

// src/settings.ts
var import_obsidian = require("obsidian");
var DEFAULT_SETTINGS = {
  transactionsFolder: "090 - Finance/Stocks/Transactions",
  symbolsPath: "090 - Finance/Stocks/symbols.json"
};
var StockMarketSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian.Setting(containerEl).setName("Dossier des transactions").setDesc("Chemin relatif au vault (ex. : 090 - Finance/Stocks/Transactions)").addText((text) => text.setPlaceholder(DEFAULT_SETTINGS.transactionsFolder).setValue(this.plugin.settings.transactionsFolder).onChange(async (value) => {
      this.plugin.settings.transactionsFolder = value.trim();
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("Fichier des symboles").setDesc("Chemin relatif au vault vers le fichier JSON des cours (ex. : 090 - Finance/Stocks/symbols.json)").addText((text) => text.setPlaceholder(DEFAULT_SETTINGS.symbolsPath).setValue(this.plugin.settings.symbolsPath).onChange(async (value) => {
      this.plugin.settings.symbolsPath = value.trim();
      await this.plugin.saveSettings();
    }));
  }
};

// src/data.ts
var import_obsidian2 = require("obsidian");
async function loadSymbols(app, settings) {
  const { symbolsPath } = settings;
  const file = app.vault.getAbstractFileByPath(symbolsPath);
  if (!(file instanceof import_obsidian2.TFile))
    throw new Error(`Fichier introuvable : ${symbolsPath}`);
  const data = JSON.parse(await app.vault.read(file));
  return data.symbols;
}
async function loadTransactions(app, settings) {
  const { transactionsFolder } = settings;
  const files = app.vault.getMarkdownFiles().filter(
    (f) => f.path.startsWith(transactionsFolder + "/")
  );
  const results = await Promise.all(files.map(async (file) => {
    const content = await app.vault.read(file);
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match)
      return null;
    try {
      const data = (0, import_obsidian2.parseYaml)(match[1]);
      return (data == null ? void 0 : data.ticker) && (data == null ? void 0 : data.action) ? data : null;
    } catch (e) {
      return null;
    }
  }));
  return results.filter((t) => t !== null);
}

// src/format.ts
function fmtPrice(amount, currency) {
  return `${amount.toFixed(2)} ${currency}`;
}
function fmtGain(amount, currency) {
  const sign = amount >= 0 ? "+" : "";
  return `${sign}${amount.toFixed(2)} ${currency}`;
}
function fmtPct(pct) {
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)} %`;
}
function gainClass(amount) {
  return amount >= 0 ? "sm-positive" : "sm-negative";
}

// src/positions.ts
function buildSymbolMap(symbols) {
  return new Map(symbols.map((s) => [s.symbol, s]));
}
function resolveSymbol(ticker, txCurrency, map) {
  var _a, _b, _c;
  if (ticker.includes(":")) {
    const base = ticker.split(":")[1];
    return (_a = map.get(`${base}.TO`)) != null ? _a : map.get(base);
  }
  const direct = map.get(ticker);
  if (direct && direct.currency === txCurrency)
    return direct;
  if (txCurrency === "CAD") {
    return (_c = (_b = map.get(`${ticker}.TO`)) != null ? _b : map.get(`${ticker}.NE`)) != null ? _c : direct;
  }
  return direct;
}
function computePositions(transactions) {
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  const posMap = /* @__PURE__ */ new Map();
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
        transactions: []
      });
    }
    const pos = posMap.get(tx.ticker);
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

// src/ui.ts
function buildDetailTable(container, pos, symbol) {
  const table = container.createEl("table", { cls: "sm-detail-table" });
  const hr = table.createEl("thead").createEl("tr");
  ["Date", "Action", "Qt\xE9", "Prix unitaire", "Co\xFBt total", "Gain latent $", "Gain latent %"].forEach(
    (h) => hr.createEl("th", { text: h })
  );
  const tbody = table.createEl("tbody");
  for (const tx of pos.transactions) {
    const row = tbody.createEl("tr");
    const dateTd = row.createEl("td", { text: tx.date });
    if (tx.note) {
      dateTd.createEl("span", { text: "\u24D8", cls: "sm-note-indicator", attr: { title: tx.note } });
    }
    const actionTd = row.createEl("td", { text: tx.action === "buy" ? "Achat" : "Vente" });
    actionTd.addClass(tx.action === "buy" ? "sm-buy" : "sm-sell");
    row.createEl("td", { text: String(tx.quantity) });
    row.createEl("td", { text: fmtPrice(tx.unit_price, tx.currency) });
    row.createEl("td", { text: fmtPrice(tx.unit_price * tx.quantity, tx.currency) });
    if (tx.action === "buy" && symbol) {
      const gainAmt = (symbol.price - tx.unit_price) * tx.quantity;
      const gainPct = (symbol.price - tx.unit_price) / tx.unit_price * 100;
      row.createEl("td", { text: fmtGain(gainAmt, symbol.currency), cls: gainClass(gainAmt) });
      row.createEl("td", { text: fmtPct(gainPct), cls: gainClass(gainPct) });
    } else {
      row.createEl("td", { text: "\u2014" });
      row.createEl("td", { text: "\u2014" });
    }
  }
}
async function renderPositions(el, app, settings) {
  try {
    const symbols = await loadSymbols(app, settings);
    const symbolMap = buildSymbolMap(symbols);
    const transactions = await loadTransactions(app, settings);
    const positions = computePositions(transactions);
    const open = positions.filter((p) => p.openQty > 0).sort((a, b) => a.ticker.localeCompare(b.ticker));
    const closed = positions.filter((p) => p.openQty === 0 && p.totalSoldQty > 0).sort((a, b) => a.ticker.localeCompare(b.ticker));
    const wrapper = el.createDiv({ cls: "sm-wrapper" });
    if (open.length > 0) {
      wrapper.createEl("h4", { text: "Positions ouvertes", cls: "sm-section-title" });
      const grid = wrapper.createDiv({ cls: "sm-grid" });
      const header = grid.createDiv({ cls: "sm-header sm-cols-open" });
      ["Ticker", "Qt\xE9", "Prix moy.", "Prix actuel", "Gain latent $", "Gain latent %"].forEach(
        (h) => header.createEl("span", { text: h })
      );
      for (const pos of open) {
        const symbol = resolveSymbol(pos.ticker, pos.currency, symbolMap);
        const details = grid.createEl("details", { cls: "sm-position" });
        const summary = details.createEl("summary", { cls: "sm-cols-open" });
        summary.createEl("span", { text: pos.ticker, cls: "sm-ticker" });
        summary.createEl("span", { text: String(pos.openQty) });
        summary.createEl("span", { text: fmtPrice(pos.pmp, pos.currency) });
        if (!symbol) {
          ["\u2014", "\u2014", "\u2014"].forEach((v) => summary.createEl("span", { text: v }));
        } else {
          summary.createEl("span", { text: fmtPrice(symbol.price, symbol.currency) });
          const gainAmt = (symbol.price - pos.pmp) * pos.openQty;
          const gainPct = (symbol.price - pos.pmp) / pos.pmp * 100;
          summary.createEl("span", { text: fmtGain(gainAmt, symbol.currency), cls: gainClass(gainAmt) });
          summary.createEl("span", { text: fmtPct(gainPct), cls: gainClass(gainPct) });
        }
        buildDetailTable(details.createDiv({ cls: "sm-detail" }), pos, symbol);
      }
    }
    if (closed.length > 0) {
      wrapper.createEl("h4", { text: "Positions ferm\xE9es", cls: "sm-section-title" });
      const grid = wrapper.createDiv({ cls: "sm-grid" });
      const header = grid.createDiv({ cls: "sm-header sm-cols-closed" });
      ["Ticker", "Qt\xE9 vendue", "Prix moy.", "Gain r\xE9alis\xE9 $", "Gain r\xE9alis\xE9 %"].forEach(
        (h) => header.createEl("span", { text: h })
      );
      for (const pos of closed) {
        const details = grid.createEl("details", { cls: "sm-position" });
        const summary = details.createEl("summary", { cls: "sm-cols-closed" });
        summary.createEl("span", { text: pos.ticker, cls: "sm-ticker" });
        summary.createEl("span", { text: String(pos.totalSoldQty) });
        summary.createEl("span", { text: fmtPrice(pos.pmp, pos.currency) });
        const gainPct = pos.pmp > 0 ? pos.realizedGain / (pos.pmp * pos.totalSoldQty) * 100 : 0;
        summary.createEl("span", { text: fmtGain(pos.realizedGain, pos.currency), cls: gainClass(pos.realizedGain) });
        summary.createEl("span", { text: fmtPct(gainPct), cls: gainClass(gainPct) });
        buildDetailTable(details.createDiv({ cls: "sm-detail" }), pos, void 0);
      }
    }
    if (symbols.length > 0) {
      wrapper.createEl("p", { text: `Prix mis \xE0 jour : ${symbols[0].updated_at}`, cls: "sm-updated" });
    }
  } catch (e) {
    el.createEl("p", { text: `Erreur : ${e.message}`, cls: "sm-error" });
  }
}

// main.ts
var StockMarketPlugin = class extends import_obsidian3.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
  }
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new StockMarketSettingTab(this.app, this));
    this.registerMarkdownCodeBlockProcessor("stock-gains", async (_source, el) => {
      await renderPositions(el, this.app, this.settings);
    });
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        var _a, _b;
        if (!leaf)
          return;
        const view = leaf.view;
        if (!(view instanceof import_obsidian3.MarkdownView))
          return;
        const file = view.file;
        if (!file)
          return;
        const frontmatter = (_a = this.app.metadataCache.getFileCache(file)) == null ? void 0 : _a.frontmatter;
        const raw = (_b = frontmatter == null ? void 0 : frontmatter.cssclasses) != null ? _b : [];
        const classes = Array.isArray(raw) ? raw : String(raw).split(/\s+/);
        if (classes.indexOf("stock-transactions") !== -1 && view.getMode() !== "preview") {
          view.setState({ mode: "preview" }, { history: false });
        }
      })
    );
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
};
