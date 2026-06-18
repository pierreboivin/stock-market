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
var import_obsidian4 = require("obsidian");

// src/modal.ts
var import_obsidian2 = require("obsidian");

// src/data.ts
var import_obsidian = require("obsidian");
function normalizeTicker(ticker) {
  if (ticker.includes(":")) {
    return ticker.split(":")[1] + ".TO";
  }
  return ticker;
}
async function resolveAvailablePath(app, base, ext) {
  let path = `${base}${ext}`;
  let i = 2;
  while (app.vault.getAbstractFileByPath(path)) {
    path = `${base} ${i}${ext}`;
    i++;
  }
  return path;
}
async function createTransaction(app, settings, tx) {
  const safeTicker = tx.ticker.replace(/:/g, "-");
  const base = `${settings.transactionsFolder}/${tx.date} ${safeTicker} ${tx.action}`;
  const path = await resolveAvailablePath(app, base, ".md");
  const lines = [
    "---",
    `date: ${tx.date}`,
    `ticker: ${tx.ticker}`,
    `action: ${tx.action}`,
    `quantity: ${tx.quantity}`,
    `unit_price: ${tx.unit_price}`,
    `total: ${tx.total}`,
    `currency: ${tx.currency}`
  ];
  if (tx.note)
    lines.push(`note: "${tx.note}"`);
  lines.push("---", "");
  await app.vault.create(path, lines.join("\n"));
}
async function addSymbolIfMissing(app, settings, ticker, currency) {
  const file = app.vault.getAbstractFileByPath(settings.symbolsPath);
  if (!(file instanceof import_obsidian.TFile))
    return false;
  const raw = JSON.parse(await app.vault.read(file));
  const normalized = normalizeTicker(ticker);
  const exists = raw.symbols.some((s) => s.symbol === normalized || s.symbol === ticker);
  if (exists)
    return false;
  raw.symbols.push({ symbol: normalized, currency, price: 0, price_cad: 0, updated_at: "" });
  await app.vault.modify(file, JSON.stringify(raw, null, 2));
  return true;
}
async function loadSymbols(app, settings) {
  const { symbolsPath } = settings;
  const file = app.vault.getAbstractFileByPath(symbolsPath);
  if (!(file instanceof import_obsidian.TFile))
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
      const data = (0, import_obsidian.parseYaml)(match[1]);
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

// src/modal.ts
async function validateTickerYahoo(ticker) {
  var _a, _b;
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(ticker)}&quotesCount=1&newsCount=0&enableFuzzyQuery=false`;
    const resp = await (0, import_obsidian2.requestUrl)({ url });
    const quotes = (_b = (_a = resp.json) == null ? void 0 : _a.quotes) != null ? _b : [];
    return quotes.length > 0;
  } catch (e) {
    return false;
  }
}
var AddTransactionModal = class extends import_obsidian2.Modal {
  constructor(app, settings, onSuccess) {
    super(app);
    this.settings = settings;
    this.onSuccess = onSuccess;
  }
  onOpen() {
    const { contentEl } = this;
    this.titleEl.setText("Nouvelle transaction");
    const today = new Date().toISOString().slice(0, 10);
    const tx = {
      date: today,
      action: "buy",
      currency: "CAD"
    };
    let totalComponent = null;
    const syncTotal = () => {
      var _a, _b, _c;
      if (!totalComponent)
        return;
      const val = Math.round(((_a = tx.quantity) != null ? _a : 0) * ((_b = tx.unit_price) != null ? _b : 0) * 100) / 100;
      tx.total = val;
      totalComponent.setValue(val > 0 ? fmtPrice(val, (_c = tx.currency) != null ? _c : "CAD") : "");
    };
    new import_obsidian2.Setting(contentEl).setName("Date").addText((text) => text.setValue(today).onChange((v) => tx.date = v.trim()));
    new import_obsidian2.Setting(contentEl).setName("Ticker").setDesc("Ex : VFV.TO \xB7 NVDA \xB7 TSE:VGRO").addText((text) => {
      text.setPlaceholder("VFV.TO").onChange((v) => {
        tx.ticker = v.trim().toUpperCase();
        text.inputEl.removeClass("sm-ticker-valid", "sm-ticker-invalid");
      });
      text.inputEl.addEventListener("blur", async () => {
        const ticker = tx.ticker;
        if (!ticker)
          return;
        const valid = await validateTickerYahoo(ticker);
        if (tx.ticker !== ticker)
          return;
        text.inputEl.removeClass("sm-ticker-valid", "sm-ticker-invalid");
        text.inputEl.addClass(valid ? "sm-ticker-valid" : "sm-ticker-invalid");
      });
    });
    new import_obsidian2.Setting(contentEl).setName("Action").addDropdown((dd) => dd.addOption("buy", "Achat").addOption("sell", "Vente").setValue("buy").onChange((v) => tx.action = v));
    new import_obsidian2.Setting(contentEl).setName("Devise").addDropdown((dd) => dd.addOption("CAD", "CAD").addOption("USD", "USD").setValue("CAD").onChange((v) => tx.currency = v));
    new import_obsidian2.Setting(contentEl).setName("Quantit\xE9").addText((text) => text.setPlaceholder("0").onChange((v) => {
      tx.quantity = parseFloat(v) || 0;
      syncTotal();
    }));
    new import_obsidian2.Setting(contentEl).setName("Prix unitaire").addText((text) => text.setPlaceholder("0.00").onChange((v) => {
      tx.unit_price = parseFloat(v) || 0;
      syncTotal();
    }));
    new import_obsidian2.Setting(contentEl).setName("Total").setDesc("Calcul\xE9 automatiquement (quantit\xE9 \xD7 prix unitaire)").addText((text) => {
      totalComponent = text;
      text.setPlaceholder("0.00");
      text.inputEl.disabled = true;
      text.inputEl.addClass("sm-total-readonly");
    });
    new import_obsidian2.Setting(contentEl).setName("Note").addText((text) => text.setPlaceholder("Optionnel").onChange((v) => tx.note = v.trim() || void 0));
    const submit = async () => {
      const errors = this.validate(tx);
      if (errors.length > 0) {
        new import_obsidian2.Notice(errors.join("\n"));
        return;
      }
      try {
        const symbolAdded = await addSymbolIfMissing(this.app, this.settings, tx.ticker, tx.currency);
        await createTransaction(this.app, this.settings, tx);
        this.close();
        await this.onSuccess();
        let msg = "Transaction cr\xE9\xE9e.";
        if (symbolAdded)
          msg += `
Symbole "${tx.ticker}" ajout\xE9 \xE0 symbols.json \u2014 pensez \xE0 mettre le prix \xE0 jour.`;
        new import_obsidian2.Notice(msg);
      } catch (e) {
        new import_obsidian2.Notice(`Erreur : ${e.message}`);
      }
    };
    contentEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter")
        submit();
    });
    new import_obsidian2.Setting(contentEl).addButton((btn) => btn.setButtonText("Cr\xE9er la transaction").setCta().onClick(submit));
  }
  validate(tx) {
    const errors = [];
    if (!tx.date || !/^\d{4}-\d{2}-\d{2}$/.test(tx.date))
      errors.push("Date invalide (format attendu : YYYY-MM-DD).");
    if (!tx.ticker)
      errors.push("Le ticker est requis.");
    if (!tx.quantity || tx.quantity <= 0)
      errors.push("La quantit\xE9 doit \xEAtre sup\xE9rieure \xE0 0.");
    if (!tx.unit_price || tx.unit_price <= 0)
      errors.push("Le prix unitaire doit \xEAtre sup\xE9rieur \xE0 0.");
    if (!tx.total || tx.total <= 0)
      errors.push("Le total doit \xEAtre sup\xE9rieur \xE0 0.");
    return errors;
  }
  onClose() {
    this.contentEl.empty();
  }
};

// src/settings.ts
var import_obsidian3 = require("obsidian");
var DEFAULT_SETTINGS = {
  transactionsFolder: "090 - Finance/Stocks/Transactions",
  symbolsPath: "090 - Finance/Stocks/symbols.json"
};
var StockMarketSettingTab = class extends import_obsidian3.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian3.Setting(containerEl).setName("Dossier des transactions").setDesc("Chemin relatif au vault (ex. : 090 - Finance/Stocks/Transactions)").addText((text) => text.setPlaceholder(DEFAULT_SETTINGS.transactionsFolder).setValue(this.plugin.settings.transactionsFolder).onChange(async (value) => {
      this.plugin.settings.transactionsFolder = value.trim();
      await this.plugin.saveSettings();
    }));
    new import_obsidian3.Setting(containerEl).setName("Fichier des symboles").setDesc("Chemin relatif au vault vers le fichier JSON des cours (ex. : 090 - Finance/Stocks/symbols.json)").addText((text) => text.setPlaceholder(DEFAULT_SETTINGS.symbolsPath).setValue(this.plugin.settings.symbolsPath).onChange(async (value) => {
      this.plugin.settings.symbolsPath = value.trim();
      await this.plugin.saveSettings();
    }));
  }
};

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

// src/chart.ts
var PALETTE = [
  "#4f9cf9",
  "#f97316",
  "#22c55e",
  "#a855f7",
  "#ef4444",
  "#06b6d4",
  "#eab308",
  "#ec4899",
  "#14b8a6",
  "#8b5cf6",
  "#84cc16",
  "#f43f5e"
];
function isPriced(sym) {
  return !!sym && sym.price > 0 && sym.updated_at !== "";
}
function svgEl(tag, attrs) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const key of Object.keys(attrs)) {
    el.setAttribute(key, String(attrs[key]));
  }
  return el;
}
function donutSlicePath(cx, cy, outerR, innerR, startAngle, endAngle) {
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
    "Z"
  ].join(" ");
}
async function renderAllocationChart(el, app, settings) {
  try {
    const symbols = await loadSymbols(app, settings);
    const symbolMap = buildSymbolMap(symbols);
    const transactions = await loadTransactions(app, settings);
    const positions = computePositions(transactions);
    const items = positions.filter((p) => p.openQty > 0).map((p) => {
      const sym = resolveSymbol(p.ticker, p.currency, symbolMap);
      if (!isPriced(sym))
        return null;
      return { ticker: p.ticker, value: p.openQty * sym.price_cad };
    }).filter((x) => x !== null).sort((a, b) => b.value - a.value);
    if (items.length === 0) {
      el.createEl("p", { text: "Aucune position ouverte avec un prix connu.", cls: "sm-chart-empty" });
      return;
    }
    const total = items.reduce((sum, item) => sum + item.value, 0);
    const top = items.slice(0, 10);
    const autreValue = items.slice(10).reduce((sum, item) => sum + item.value, 0);
    const displayItems = top.map((item, i) => ({
      ticker: item.ticker,
      value: item.value,
      color: PALETTE[i % PALETTE.length]
    }));
    if (autreValue > 0) {
      displayItems.push({ ticker: "Autre", value: autreValue, color: "#94a3b8" });
    }
    const wrapper = el.createDiv({ cls: "sm-chart-wrapper" });
    wrapper.createEl("h4", { text: "R\xE9partition du portefeuille", cls: "sm-section-title" });
    const inner = wrapper.createDiv({ cls: "sm-chart-donut-wrapper" });
    const CX = 200, CY = 200, OUTER_R = 160, INNER_R = 104;
    const svg = svgEl("svg", { viewBox: "0 0 400 400", width: "400", height: "400" });
    let angle = -(Math.PI / 2);
    for (let i = 0; i < displayItems.length; i++) {
      const slice = displayItems[i].value / total * 2 * Math.PI;
      const path = svgEl("path", {
        d: donutSlicePath(CX, CY, OUTER_R, INNER_R, angle, angle + slice),
        fill: displayItems[i].color,
        stroke: "var(--background-primary)",
        "stroke-width": "2"
      });
      svg.appendChild(path);
      angle += slice;
    }
    const labelEl = svgEl("text", {
      x: CX,
      y: CY - 12,
      "text-anchor": "middle",
      fill: "var(--text-muted)",
      "font-size": "14",
      "font-family": "var(--font-interface)"
    });
    labelEl.textContent = "Valeur totale";
    svg.appendChild(labelEl);
    const totalEl = svgEl("text", {
      x: CX,
      y: CY + 16,
      "text-anchor": "middle",
      fill: "var(--text-normal)",
      "font-size": "17",
      "font-weight": "600",
      "font-family": "var(--font-monospace)"
    });
    totalEl.textContent = `${total.toLocaleString("fr-CA", { maximumFractionDigits: 0 })} CAD`;
    svg.appendChild(totalEl);
    inner.appendChild(svg);
    const legend = inner.createDiv({ cls: "sm-chart-legend" });
    for (let i = 0; i < displayItems.length; i++) {
      const item = displayItems[i];
      const pct = item.value / total * 100;
      const row = legend.createDiv({ cls: "sm-chart-legend-row" });
      const swatch = row.createDiv({ cls: "sm-chart-swatch" });
      swatch.style.background = item.color;
      row.createEl("span", { text: item.ticker, cls: "sm-chart-legend-ticker" });
      row.createEl("span", { text: `${pct.toFixed(1)} %`, cls: "sm-chart-legend-pct" });
      row.createEl("span", { text: `${item.value.toLocaleString("fr-CA", { maximumFractionDigits: 0 })} CAD`, cls: "sm-chart-legend-value" });
    }
  } catch (e) {
    el.createEl("p", { text: `Erreur : ${e.message}`, cls: "sm-error" });
  }
}
async function renderPerformanceChart(el, app, settings) {
  try {
    const symbols = await loadSymbols(app, settings);
    const symbolMap = buildSymbolMap(symbols);
    const transactions = await loadTransactions(app, settings);
    const positions = computePositions(transactions);
    const items = positions.filter((p) => p.openQty > 0).map((p) => {
      const sym = resolveSymbol(p.ticker, p.currency, symbolMap);
      if (!isPriced(sym) || p.pmp === 0)
        return null;
      const gainAmt = (sym.price - p.pmp) * p.openQty;
      const gainPct = (sym.price - p.pmp) / p.pmp * 100;
      return { ticker: p.ticker, gainAmt, gainPct, currency: p.currency };
    }).filter((x) => x !== null).sort((a, b) => b.gainPct - a.gainPct);
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
      const widthPct = maxAbs > 0 ? Math.abs(item.gainPct) / maxAbs * 50 : 0;
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
    el.createEl("p", { text: `Erreur : ${e.message}`, cls: "sm-error" });
  }
}

// src/ui.ts
function formatUpdatedAt(iso) {
  try {
    return new Date(iso).toLocaleString("fr-CA", { dateStyle: "short", timeStyle: "short" });
  } catch (_) {
    return iso;
  }
}
function isPriced2(symbol) {
  return !!symbol && symbol.price > 0 && symbol.updated_at !== "";
}
async function loadData(app, settings) {
  const symbols = await loadSymbols(app, settings);
  const symbolMap = buildSymbolMap(symbols);
  const transactions = await loadTransactions(app, settings);
  const positions = computePositions(transactions);
  return { symbols, symbolMap, positions };
}
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
function renderOpenSection(wrapper, open, symbolMap) {
  if (open.length === 0)
    return;
  wrapper.createEl("h4", { text: "Positions ouvertes", cls: "sm-section-title" });
  const grid = wrapper.createDiv({ cls: "sm-grid" });
  const header = grid.createDiv({ cls: "sm-header sm-cols-open" });
  ["Ticker", "Qt\xE9", "Prix moy.", "Prix actuel", "Valeur", "Gain latent $", "Gain latent %"].forEach(
    (h) => header.createEl("span", { text: h })
  );
  for (const pos of open) {
    const symbol = resolveSymbol(pos.ticker, pos.currency, symbolMap);
    const details = grid.createEl("details", { cls: "sm-position" });
    const summary = details.createEl("summary", { cls: "sm-cols-open" });
    summary.createEl("span", { text: pos.ticker, cls: "sm-ticker" });
    summary.createEl("span", { text: String(pos.openQty) });
    summary.createEl("span", { text: fmtPrice(pos.pmp, pos.currency) });
    if (!isPriced2(symbol)) {
      ["\u2014", "\u2014", "\u2014", "\u2014"].forEach((v) => summary.createEl("span", { text: v }));
    } else {
      summary.createEl("span", { text: fmtPrice(symbol.price, symbol.currency) });
      summary.createEl("span", { text: fmtPrice(symbol.price * pos.openQty, symbol.currency) });
      const gainAmt = (symbol.price - pos.pmp) * pos.openQty;
      const gainPct = (symbol.price - pos.pmp) / pos.pmp * 100;
      summary.createEl("span", { text: fmtGain(gainAmt, symbol.currency), cls: gainClass(gainAmt) });
      summary.createEl("span", { text: fmtPct(gainPct), cls: gainClass(gainPct) });
    }
    buildDetailTable(details.createDiv({ cls: "sm-detail" }), pos, isPriced2(symbol) ? symbol : void 0);
  }
}
function renderClosedSection(wrapper, closed) {
  if (closed.length === 0)
    return;
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
function valueCAD(pos, symbolMap) {
  const sym = resolveSymbol(pos.ticker, pos.currency, symbolMap);
  return sym && sym.price_cad > 0 ? pos.openQty * sym.price_cad : 0;
}
async function renderOpenPositions(el, app, settings) {
  try {
    const { symbols, symbolMap, positions } = await loadData(app, settings);
    const open = positions.filter((p) => p.openQty > 0).sort((a, b) => valueCAD(b, symbolMap) - valueCAD(a, symbolMap));
    const wrapper = el.createDiv({ cls: "sm-wrapper" });
    renderOpenSection(wrapper, open, symbolMap);
    if (symbols.length > 0) {
      wrapper.createEl("p", { text: `Prix mis \xE0 jour : ${formatUpdatedAt(symbols[0].updated_at)}`, cls: "sm-updated" });
    }
  } catch (e) {
    el.createEl("p", { text: `Erreur : ${e.message}`, cls: "sm-error" });
  }
}
async function renderClosedPositions(el, app, settings) {
  try {
    const { positions } = await loadData(app, settings);
    const closed = positions.filter((p) => p.openQty === 0 && p.totalSoldQty > 0).sort((a, b) => a.ticker.localeCompare(b.ticker));
    const wrapper = el.createDiv({ cls: "sm-wrapper" });
    renderClosedSection(wrapper, closed);
  } catch (e) {
    el.createEl("p", { text: `Erreur : ${e.message}`, cls: "sm-error" });
  }
}
async function renderPositions(el, app, settings) {
  try {
    const { symbols, symbolMap, positions } = await loadData(app, settings);
    const open = positions.filter((p) => p.openQty > 0).sort((a, b) => valueCAD(b, symbolMap) - valueCAD(a, symbolMap));
    const closed = positions.filter((p) => p.openQty === 0 && p.totalSoldQty > 0).sort((a, b) => a.ticker.localeCompare(b.ticker));
    const wrapper = el.createDiv({ cls: "sm-wrapper" });
    renderOpenSection(wrapper, open, symbolMap);
    renderClosedSection(wrapper, closed);
    if (symbols.length > 0) {
      wrapper.createEl("p", { text: `Prix mis \xE0 jour : ${formatUpdatedAt(symbols[0].updated_at)}`, cls: "sm-updated" });
    }
  } catch (e) {
    el.createEl("p", { text: `Erreur : ${e.message}`, cls: "sm-error" });
  }
}

// main.ts
var StockMarketPlugin = class extends import_obsidian4.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
    this.actionEl = null;
    this.refreshCallbacks = /* @__PURE__ */ new Map();
  }
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new StockMarketSettingTab(this.app, this));
    this.registerMarkdownCodeBlockProcessor("stock-gains", async (_source, el) => {
      const cb = async () => {
        el.empty();
        await renderPositions(el, this.app, this.settings);
      };
      this.refreshCallbacks.set("stock-gains", cb);
      await renderPositions(el, this.app, this.settings);
    });
    this.registerMarkdownCodeBlockProcessor("stock-gains-open", async (_source, el) => {
      const cb = async () => {
        el.empty();
        await renderOpenPositions(el, this.app, this.settings);
      };
      this.refreshCallbacks.set("stock-gains-open", cb);
      await renderOpenPositions(el, this.app, this.settings);
    });
    this.registerMarkdownCodeBlockProcessor("stock-gains-closed", async (_source, el) => {
      const cb = async () => {
        el.empty();
        await renderClosedPositions(el, this.app, this.settings);
      };
      this.refreshCallbacks.set("stock-gains-closed", cb);
      await renderClosedPositions(el, this.app, this.settings);
    });
    this.registerMarkdownCodeBlockProcessor("stock-chart-allocation", async (_source, el) => {
      const cb = async () => {
        el.empty();
        await renderAllocationChart(el, this.app, this.settings);
      };
      this.refreshCallbacks.set("stock-chart-allocation", cb);
      await renderAllocationChart(el, this.app, this.settings);
    });
    this.registerMarkdownCodeBlockProcessor("stock-chart-performance", async (_source, el) => {
      const cb = async () => {
        el.empty();
        await renderPerformanceChart(el, this.app, this.settings);
      };
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
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  updateAddAction() {
    var _a, _b, _c;
    (_a = this.actionEl) == null ? void 0 : _a.remove();
    this.actionEl = null;
    const file = this.app.workspace.getActiveFile();
    const markdownView = this.app.workspace.getActiveViewOfType(import_obsidian4.MarkdownView);
    if (!file || !markdownView)
      return;
    const frontmatter = (_b = this.app.metadataCache.getFileCache(file)) == null ? void 0 : _b.frontmatter;
    const raw = (_c = frontmatter == null ? void 0 : frontmatter.cssclasses) != null ? _c : [];
    const classes = Array.isArray(raw) ? raw : String(raw).split(/\s+/);
    if (classes.indexOf("stock-transactions") === -1)
      return;
    this.actionEl = markdownView.addAction("circle-plus", "Ajouter une transaction", () => {
      new AddTransactionModal(this.app, this.settings, async () => {
        for (const cb of this.refreshCallbacks.values()) {
          await cb();
        }
      }).open();
    });
  }
  enforcePreviewMode(leaf) {
    var _a, _b;
    if (!leaf)
      return;
    const view = leaf.view;
    if (!(view instanceof import_obsidian4.MarkdownView))
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
  }
};
