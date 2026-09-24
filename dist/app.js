import {
  ITEM_PRESETS,
  STORAGE_KEY,
  calculateCostScenario,
  calculateItem,
  calculateQuote,
  cloneDefaultState,
  finiteNumber,
  formatCurrency,
  formatDate,
  formatTime,
  quoteFilename,
} from "./quote-core.js?v=6";
import { createQuotePdfBlob } from "./pdf-export.js?v=6";
import {
  COSTING_MODEL_REVISION,
  calculateCocktailCost,
  calculateConsumptionPercentTotal,
  calculateFixedCostTotal,
  calculateFoodCostFromProfiles,
  calculateWeightedDrinkCost,
  cloneCostingModelDefaults,
  formatEditableNumber,
  normalizeBeverageProfiles,
  normalizeFixedCostItems,
  parseBeverageRows,
  parseFixedCostRows,
  recalculateIngredient,
} from "./costing-model.js?v=1";

const dom = {
  saveStatus: document.querySelector("#save-status"),
  saveButton: document.querySelector("#save-button"),
  resetButton: document.querySelector("#reset-button"),
  previewButton: document.querySelector("#preview-button"),
  downloadButton: document.querySelector("#download-button"),
  dialogDownloadButton: document.querySelector("#dialog-download-button"),
  closeDialogButton: document.querySelector("#close-dialog-button"),
  previewDialog: document.querySelector("#preview-dialog"),
  dialogPreview: document.querySelector("#dialog-preview"),
  dialogQuoteNumber: document.querySelector("#dialog-quote-number"),
  quoteDocument: document.querySelector("#quote-document"),
  previewSummary: document.querySelector("#preview-summary"),
  itemsEditor: document.querySelector("#items-editor"),
  costingEditor: document.querySelector("#costing-editor"),
  fixedCostTotal: document.querySelector("#fixed-cost-total"),
  costingFileInput: document.querySelector("#costing-file-input"),
  costingImportStatus: document.querySelector("#costing-import-status"),
  costingModelSummary: document.querySelector("#costing-model-summary"),
  fixedCostsEditor: document.querySelector("#fixed-costs-editor"),
  beverageEditor: document.querySelector("#beverage-editor"),
  termsEditor: document.querySelector("#terms-editor"),
  servicesEditor: document.querySelector("#services-editor"),
  itemCount: document.querySelector("#item-count"),
  presetSelect: document.querySelector("#preset-select"),
  addItemButton: document.querySelector("#add-item-button"),
  toast: document.querySelector("#toast"),
};

let state = loadInitialState();
let dirty = false;
let toastTimer;
let webMcpLifecycle;

initialize();

function initialize() {
  populateBoundFields();
  renderItemsEditor();
  renderCostingEditor();
  renderCostModelEditor();
  renderOrderedEditors();
  renderPreview();
  wireEvents();
  registerWebMcpTools();
  setSaveStatus(localStorage.getItem(STORAGE_KEY) ? "Borrador local cargado" : "Borrador sin guardar");
}

function registerWebMcpTools() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  webMcpLifecycle?.abort();
  webMcpLifecycle = new AbortController();
  const options = { signal: webMcpLifecycle.signal };
  const tools = [
    {
      name: "read_quote_summary",
      title: "Leer resumen de la cotización",
      description: "Lee los datos y totales actuales de la cotización FuelBar sin modificarlos.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute() {
        return getQuoteSummary();
      },
    },
    {
      name: "configure_quote_basics",
      title: "Configurar datos básicos",
      description: "Actualiza en la interfaz el número, cliente, evento, pax o IGV de la cotización.",
      inputSchema: {
        type: "object",
        properties: {
          quoteNumber: { type: "string" },
          customerName: { type: "string" },
          eventTitle: { type: "string" },
          pax: { type: "integer", minimum: 1 },
          taxRate: { type: "number", minimum: 0, maximum: 100 },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        const values = requirePlainObject(input);
        if (Object.hasOwn(values, "quoteNumber")) state.quote.number = String(values.quoteNumber);
        if (Object.hasOwn(values, "customerName")) state.customer.name = String(values.customerName);
        if (Object.hasOwn(values, "eventTitle")) state.event.title = String(values.eventTitle);
        if (Object.hasOwn(values, "pax")) {
          const pax = finiteNumber(values.pax, 0);
          if (!Number.isInteger(pax) || pax <= 0) throw new Error("pax debe ser un entero mayor que cero");
          state.event.pax = pax;
        }
        if (Object.hasOwn(values, "taxRate")) {
          const taxRate = finiteNumber(values.taxRate, -1);
          if (taxRate < 0 || taxRate > 100) throw new Error("taxRate debe estar entre 0 y 100");
          state.quote.taxRate = taxRate;
        }
        populateBoundFields();
        markDirty();
        renderItemsEditor();
        renderCostingEditor();
        renderPreview();
        return getQuoteSummary();
      },
    },
    {
      name: "add_quote_item",
      title: "Añadir artículo",
      description: "Añade un artículo editable a la cotización visible y recalcula sus totales.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 1 },
          description: { type: "string" },
          quantity: { type: "number", exclusiveMinimum: 0 },
          unitPrice: { type: "number", minimum: 0 },
          useEventPax: { type: "boolean" },
          discountPercent: { type: "number", minimum: 0, maximum: 100 },
        },
        required: ["name", "unitPrice"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        const values = requirePlainObject(input);
        const name = String(values.name || "").trim();
        const unitPrice = finiteNumber(values.unitPrice, -1);
        const quantity = Object.hasOwn(values, "quantity") ? finiteNumber(values.quantity, 0) : 1;
        const discountPercent = Object.hasOwn(values, "discountPercent")
          ? finiteNumber(values.discountPercent, -1)
          : 0;
        if (!name) throw new Error("name es obligatorio");
        if (unitPrice < 0) throw new Error("unitPrice no puede ser negativo");
        if (quantity <= 0) throw new Error("quantity debe ser mayor que cero");
        if (discountPercent < 0 || discountPercent > 100) throw new Error("discountPercent debe estar entre 0 y 100");
        const item = normalizeItem({
          name,
          description: String(values.description || ""),
          quantity,
          unitPrice,
          usePax: Boolean(values.useEventPax),
          discountType: discountPercent > 0 ? "percent" : "none",
          discountValue: discountPercent,
        });
        item.id = createId();
        state.items.push(item);
        markDirty();
        renderItemsEditor();
        renderPreview();
        return { itemId: item.id, ...getQuoteSummary() };
      },
    },
    {
      name: "apply_costing_combination",
      title: "Aplicar combinación de costeo",
      description: "Aplica uno de los nueve cruces entre precio y consumo estimado al artículo Barra Libre.",
      inputSchema: {
        type: "object",
        properties: {
          priceOption: { type: "integer", minimum: 1, maximum: 3 },
          consumptionOption: { type: "integer", minimum: 1, maximum: 3 },
        },
        required: ["priceOption", "consumptionOption"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        const values = requirePlainObject(input);
        const priceIndex = finiteNumber(values.priceOption, 0) - 1;
        const consumptionIndex = finiteNumber(values.consumptionOption, 0) - 1;
        if (!Number.isInteger(priceIndex) || !state.costing.priceOptions[priceIndex]) {
          throw new Error("priceOption debe ser 1, 2 o 3");
        }
        if (!Number.isInteger(consumptionIndex) || !state.costing.consumptionOptions[consumptionIndex]) {
          throw new Error("consumptionOption debe ser 1, 2 o 3");
        }
        if (!hasValidConsumptionDistribution()) {
          throw new Error("Los porcentajes de consumo deben sumar 100% antes de aplicar una combinación");
        }
        selectCostCombination(priceIndex, consumptionIndex);
        applyCostCombination(priceIndex, consumptionIndex);
        return {
          appliedPriceOption: priceIndex + 1,
          appliedConsumptionOption: consumptionIndex + 1,
          ...getQuoteSummary(),
        };
      },
    },
    {
      name: "save_quote_draft",
      title: "Guardar borrador local",
      description: "Guarda el estado actual del cotizador en este navegador y dispositivo.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        dirty = false;
        setSaveStatus("Guardado en este dispositivo");
        showToast("Borrador guardado localmente");
        return { saved: true, storage: "local", quoteNumber: state.quote.number };
      },
    },
    {
      name: "export_quote_pdf",
      title: "Exportar cotización PDF",
      description: "Valida la cotización visible y descarga el documento final en formato PDF.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      async execute() {
        const errors = validateState();
        if (errors.length) throw new Error(errors[0].message);
        await exportPdf();
        return { downloaded: true, filename: quoteFilename(state.quote.number) };
      },
    },
  ];

  tools.forEach((tool) => {
    try {
      void Promise.resolve(context.registerTool(tool, options)).catch((error) => {
        console.warn(`No se pudo registrar ${tool.name}`, error);
      });
    } catch (error) {
      console.warn(`No se pudo registrar ${tool.name}`, error);
    }
  });
}

function requirePlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("La entrada debe ser un objeto");
  }
  return value;
}

function getQuoteSummary() {
  const result = calculateQuote(state);
  return {
    quoteNumber: state.quote.number,
    customerName: state.customer.name,
    eventTitle: state.event.title,
    pax: state.event.pax,
    itemCount: state.items.length,
    currency: state.quote.currency,
    subtotal: result.taxableSubtotal,
    taxRate: result.taxRate,
    taxAmount: result.taxAmount,
    total: result.total,
  };
}

function loadInitialState() {
  const base = cloneDefaultState();
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return normalizeState(base);
    return normalizeState(deepMerge(base, JSON.parse(stored)));
  } catch (error) {
    console.warn("No se pudo cargar el borrador local", error);
    return normalizeState(base);
  }
}

function normalizeState(candidate) {
  const normalized = candidate && typeof candidate === "object" ? candidate : cloneDefaultState();
  normalized.items = Array.isArray(normalized.items) ? normalized.items.map(normalizeItem) : [];
  normalized.terms = Array.isArray(normalized.terms) ? normalized.terms.map(String) : [];
  normalized.includedServices = Array.isArray(normalized.includedServices)
    ? normalized.includedServices.map(String)
    : [];
  normalized.additionalNotes = String(normalized.additionalNotes || "");
  normalized.costing = normalized.costing && typeof normalized.costing === "object"
    ? normalized.costing
    : cloneDefaultState().costing;
  const defaultCosting = cloneDefaultState().costing;
  if (!Array.isArray(normalized.costing.priceOptions)) {
    normalized.costing.priceOptions = Array.isArray(normalized.costing.scenarios)
      ? normalized.costing.scenarios.map((scenario) => scenario.pricePerPax)
      : defaultCosting.priceOptions;
  }
  if (!Array.isArray(normalized.costing.consumptionOptions)) {
    normalized.costing.consumptionOptions = Array.isArray(normalized.costing.scenarios)
      ? normalized.costing.scenarios.map((scenario, index) => ({
          id: `consumption-${index + 1}`,
          drinksPerPax: scenario.drinksPerPax,
          foodCostPerPax: scenario.foodCostPerPax,
        }))
      : defaultCosting.consumptionOptions;
  }
  if (normalized.costing.priceOptions.length !== 3) normalized.costing.priceOptions = defaultCosting.priceOptions;
  if (normalized.costing.consumptionOptions.length !== 3) normalized.costing.consumptionOptions = defaultCosting.consumptionOptions;
  normalized.costing.priceOptions = normalized.costing.priceOptions.map((value) => Math.max(0, finiteNumber(value)));
  const modelDefaults = cloneCostingModelDefaults();
  if (Array.isArray(normalized.costing.fixedCostItems)) {
    normalized.costing.fixedCostItems = normalizeFixedCostItems(normalized.costing.fixedCostItems);
  } else {
    const legacyFixedCost = Math.max(0, finiteNumber(normalized.costing.fixedCost, defaultCosting.fixedCost));
    const legacyWasStandard = Math.abs(legacyFixedCost - finiteNumber(defaultCosting.fixedCost)) < 0.01;
    const pax = Math.max(0, finiteNumber(normalized.event?.pax));
    const additionalCharge = Math.max(0, finiteNumber(normalized.costing.additionalCharge));
    const legacyWasGrossAmount = normalized.costing.priceOptions.some((price) => (
      legacyFixedCost > 0
      && Math.abs(legacyFixedCost - (pax * Math.max(0, finiteNumber(price)) + additionalCharge)) < 0.01
    ));
    normalized.costing.fixedCostItems = normalizeFixedCostItems(
      legacyWasStandard || legacyWasGrossAmount
        ? modelDefaults.fixedCostItems
        : [{
            id: "fixed-cost-migrated",
            name: "Costo fijo migrado",
            quantity: 1,
            unitPrice: legacyFixedCost,
            total: legacyFixedCost,
          }],
    );
  }
  normalized.costing.beverageProfiles = normalizeBeverageProfiles(
    Array.isArray(normalized.costing.beverageProfiles)
      ? normalized.costing.beverageProfiles
      : modelDefaults.beverageProfiles,
  );
  normalized.costing.fixedCost = calculateFixedCostTotal(normalized.costing.fixedCostItems);
  normalized.costing.consumptionOptions = normalized.costing.consumptionOptions.map((option, index) => {
    const drinksPerPax = Math.max(0, finiteNumber(option.drinksPerPax));
    return {
      id: option.id || `consumption-${index + 1}`,
      drinksPerPax,
      foodCostPerPax: calculateFoodCostFromProfiles(drinksPerPax, normalized.costing.beverageProfiles),
    };
  });
  normalized.costing.modelRevision = COSTING_MODEL_REVISION;
  normalized.costing.selectedPriceIndex = clampOptionIndex(normalized.costing.selectedPriceIndex, 1);
  normalized.costing.selectedConsumptionIndex = clampOptionIndex(normalized.costing.selectedConsumptionIndex, 1);
  delete normalized.costing.scenarios;
  return normalized;
}

function syncCostingModel() {
  state.costing.fixedCost = calculateFixedCostTotal(state.costing.fixedCostItems);
  state.costing.consumptionOptions.forEach((option) => {
    option.foodCostPerPax = calculateFoodCostFromProfiles(
      option.drinksPerPax,
      state.costing.beverageProfiles,
    );
  });
  state.costing.modelRevision = COSTING_MODEL_REVISION;
}

function clampOptionIndex(value, fallback) {
  const index = finiteNumber(value, fallback);
  return Number.isInteger(index) && index >= 0 && index <= 2 ? index : fallback;
}

function normalizeItem(item = {}) {
  const legacyDiscount = finiteNumber(item.discountPercent, 0);
  return {
    id: item.id || createId(),
    presetKey: String(item.presetKey || ""),
    name: String(item.name || ""),
    description: String(item.description || ""),
    quantity: Math.max(0, finiteNumber(item.quantity, 1)),
    unitPrice: Math.max(0, finiteNumber(item.unitPrice, 0)),
    discountType: ["none", "percent", "fixed"].includes(item.discountType)
      ? item.discountType
      : legacyDiscount > 0
        ? "percent"
        : "none",
    discountValue: Math.max(0, finiteNumber(item.discountValue, legacyDiscount)),
    usePax: Boolean(item.usePax),
  };
}

function deepMerge(target, source) {
  if (!source || typeof source !== "object") return target;
  for (const [key, value] of Object.entries(source)) {
    if (Array.isArray(value)) {
      target[key] = value;
    } else if (value && typeof value === "object" && target[key] && typeof target[key] === "object") {
      deepMerge(target[key], value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

function createId() {
  return globalThis.crypto?.randomUUID?.() || `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function makeBlankItem() {
  return normalizeItem({
    name: "Nuevo artículo",
    description: "",
    quantity: 1,
    unitPrice: 0,
    discountType: "none",
    discountValue: 0,
    usePax: false,
  });
}

function wireEvents() {
  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => activateTab(button.dataset.tab));
  });

  document.querySelector(".editor-tabs")?.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const tabs = [...document.querySelectorAll("[data-tab]")];
    const currentIndex = tabs.indexOf(document.activeElement);
    if (currentIndex < 0) return;
    event.preventDefault();
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabs.length - 1
        : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    tabs[nextIndex].focus();
    activateTab(tabs[nextIndex].dataset.tab);
  });

  document.addEventListener("input", (event) => {
    const target = event.target;
    if (target.matches("[data-bind]")) {
      setByPath(state, target.dataset.bind, readInputValue(target));
      markDirty();
      renderPreview();
      if (target.dataset.bind === "event.pax") renderItemsEditor();
      if (["event.pax", "quote.taxRate"].includes(target.dataset.bind) || target.dataset.bind.startsWith("costing.")) {
        refreshCostCalculator();
      }
      return;
    }

    if (target.matches("[data-cost-price]")) {
      const index = Number(target.dataset.costPrice);
      if (!Number.isInteger(index) || !Object.hasOwn(state.costing.priceOptions, index)) return;
      state.costing.priceOptions[index] = Math.max(0, readInputValue(target));
      markDirty();
      refreshCostCalculator();
      return;
    }

    if (target.matches("[data-consumption-field]")) {
      const index = Number(target.dataset.consumptionIndex);
      const option = state.costing.consumptionOptions[index];
      if (!option) return;
      option.drinksPerPax = Math.max(0, readInputValue(target));
      option.foodCostPerPax = calculateFoodCostFromProfiles(
        option.drinksPerPax,
        state.costing.beverageProfiles,
      );
      const foodCostField = document.querySelector(`[data-consumption-cost="${index}"]`);
      if (foodCostField) foodCostField.value = option.foodCostPerPax;
      markDirty();
      refreshCostCalculator();
      return;
    }

    if (target.matches("[data-fixed-cost-field]")) {
      handleFixedCostInput(target);
      return;
    }

    if (target.matches("[data-beverage-field], [data-ingredient-field]")) {
      handleBeverageInput(target);
      return;
    }

    if (target.matches("[data-item-field]")) {
      const index = Number(target.dataset.itemIndex);
      const item = state.items[index];
      if (!item) return;
      item[target.dataset.itemField] = readInputValue(target);
      markDirty();
      renderPreview();
      updateItemCalculation(index);
      updateItemCardTitle(index);
      return;
    }

    if (target.matches("[data-list-field]")) {
      const list = state[target.dataset.listField];
      const index = Number(target.dataset.listIndex);
      if (!Array.isArray(list) || index < 0 || index >= list.length) return;
      list[index] = target.value;
      markDirty();
      renderPreview();
    }
  });

  document.addEventListener("change", (event) => {
    const target = event.target;
    if (target === dom.costingFileInput) {
      void importCostingWorkbook(target.files?.[0]);
      return;
    }
    if (target.matches("[data-bind]")) {
      setByPath(state, target.dataset.bind, readInputValue(target));
      markDirty();
      renderPreview();
      if (target.dataset.bind === "event.pax") renderItemsEditor();
      if (target.dataset.bind === "quote.currency") {
        renderItemsEditor();
        renderCostingEditor();
        renderCostModelEditor();
      }
      if (["event.pax", "quote.taxRate"].includes(target.dataset.bind) || target.dataset.bind.startsWith("costing.")) {
        refreshCostCalculator();
      }
      return;
    }

    if (target.matches("[data-item-field]")) {
      const index = Number(target.dataset.itemIndex);
      const item = state.items[index];
      if (!item) return;
      item[target.dataset.itemField] = readInputValue(target);
      if (target.dataset.itemField === "usePax" && !item.usePax) {
        item.quantity = Math.max(1, finiteNumber(state.event.pax, 1));
      }
      if (target.dataset.itemField === "discountType" && item.discountType === "none") {
        item.discountValue = 0;
      }
      markDirty();
      renderItemsEditor();
      renderPreview();
    }
  });

  document.addEventListener("click", (event) => {
    const itemAction = event.target.closest("[data-item-action]");
    if (itemAction) handleItemAction(itemAction);

    const listAction = event.target.closest("[data-list-action]");
    if (listAction) handleListAction(listAction);

    const addList = event.target.closest("[data-add-list]");
    if (addList) {
      state[addList.dataset.addList].push("");
      markDirty();
      renderOrderedEditors();
      renderPreview();
    }

    const costAction = event.target.closest("[data-cost-action]");
    if (costAction?.dataset.costAction === "select") {
      selectCostCombination(Number(costAction.dataset.priceIndex), Number(costAction.dataset.consumptionIndex));
    }
    if (costAction?.dataset.costAction === "apply-selected") {
      applyCostCombination(state.costing.selectedPriceIndex, state.costing.selectedConsumptionIndex);
    }
    if (costAction?.dataset.costAction === "open-cost-model") {
      activateTab("cost-model", { focusPanel: true });
    }

    const modelAction = event.target.closest("[data-model-action]");
    if (modelAction) handleCostModelAction(modelAction);
  });

  dom.addItemButton.addEventListener("click", addSelectedItem);
  dom.saveButton.addEventListener("click", saveDraft);
  dom.resetButton.addEventListener("click", resetDraft);
  dom.previewButton.addEventListener("click", openPreviewDialog);
  dom.closeDialogButton.addEventListener("click", () => dom.previewDialog.close());
  dom.previewDialog.addEventListener("click", (event) => {
    if (event.target === dom.previewDialog) dom.previewDialog.close();
  });
  dom.downloadButton.addEventListener("click", exportPdf);
  dom.dialogDownloadButton.addEventListener("click", exportPdf);
  window.addEventListener("beforeunload", (event) => {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = "";
  });
}

function renderCostingEditor() {
  if (!dom.costingEditor) return;
  const priceFields = state.costing.priceOptions.map((price, index) => `
    <label class="field">Precio ${index + 1}<input type="number" min="0" step="0.01" data-cost-price="${index}" value="${escapeAttribute(price)}" /></label>`).join("");
  const consumptionFields = state.costing.consumptionOptions.map((option, index) => `
    <div class="consumption-option">
      <span class="scenario-pill">Probabilidad ${index + 1}</span>
      <label class="field">Bebidas por pax<input type="number" min="0" step="1" data-consumption-index="${index}" data-consumption-field="drinksPerPax" value="${escapeAttribute(option.drinksPerPax)}" /></label>
      <label class="field">Food cost por pax<input type="number" min="0" step="0.00001" data-consumption-cost="${index}" value="${escapeAttribute(option.foodCostPerPax)}" readonly aria-readonly="true" /><span class="field-help">Calculado automáticamente</span></label>
    </div>`).join("");

  dom.costingEditor.innerHTML = `
    <article class="form-card">
      <h3>Precios a comparar</h3>
      <div class="price-options">${priceFields}</div>
    </article>
    <article class="form-card">
      <h3>Probabilidades de consumo</h3>
      <div class="consumption-options">${consumptionFields}</div>
    </article>
    <article class="form-card matrix-card">
      <div class="card-heading-row">
        <div>
          <p class="eyebrow">9 combinaciones</p>
          <h3>Matriz de utilidad y margen</h3>
        </div>
        <span class="calculation-note">IGV separado de la utilidad</span>
      </div>
      <div id="cost-matrix" class="matrix-scroll"></div>
    </article>
    <article id="selected-cost-summary" class="selected-cost-summary"></article>`;
  refreshCostCalculator();
}

function renderCostModelEditor() {
  if (!dom.fixedCostsEditor || !dom.beverageEditor) return;
  dom.fixedCostsEditor.innerHTML = state.costing.fixedCostItems.map((item, index) => `
    <div class="model-row fixed-cost-row">
      <label class="field model-name"><span>Concepto</span><input data-fixed-cost-index="${index}" data-fixed-cost-field="name" value="${escapeAttribute(item.name)}" /></label>
      <label class="field"><span>Cantidad</span><input type="number" min="0" step="0.01" data-fixed-cost-index="${index}" data-fixed-cost-field="quantity" value="${escapeAttribute(formatEditableNumber(item.quantity))}" /></label>
      <label class="field"><span>Precio unitario</span><input type="number" min="0" step="0.01" data-fixed-cost-index="${index}" data-fixed-cost-field="unitPrice" value="${escapeAttribute(formatEditableNumber(item.unitPrice))}" /></label>
      <label class="field"><span>Precio total</span><input type="number" min="0" step="0.01" data-fixed-cost-index="${index}" data-fixed-cost-field="total" value="${escapeAttribute(formatEditableNumber(item.total))}" /></label>
      <div class="inline-actions model-row-actions" aria-label="Acciones de ${escapeAttribute(item.name || `costo ${index + 1}`)}">
        <button class="icon-button" type="button" data-model-action="fixed-up" data-fixed-cost-index="${index}" aria-label="Subir costo" ${index === 0 ? "disabled" : ""}>↑</button>
        <button class="icon-button" type="button" data-model-action="fixed-down" data-fixed-cost-index="${index}" aria-label="Bajar costo" ${index === state.costing.fixedCostItems.length - 1 ? "disabled" : ""}>↓</button>
        <button class="icon-button danger" type="button" data-model-action="fixed-remove" data-fixed-cost-index="${index}" aria-label="Eliminar costo">×</button>
      </div>
    </div>`).join("");

  dom.beverageEditor.innerHTML = state.costing.beverageProfiles.map((profile, profileIndex) => {
    const ingredientRows = profile.ingredients.map((ingredient, ingredientIndex) => `
      <div class="model-row ingredient-row">
        <label class="field model-name"><span>Insumo</span><input data-profile-index="${profileIndex}" data-ingredient-index="${ingredientIndex}" data-ingredient-field="name" value="${escapeAttribute(ingredient.name)}" /></label>
        <label class="field"><span>Cantidad</span><input type="number" min="0" step="any" data-profile-index="${profileIndex}" data-ingredient-index="${ingredientIndex}" data-ingredient-field="quantity" value="${escapeAttribute(formatEditableNumber(ingredient.quantity))}" /></label>
        <label class="field"><span>Unidad</span><input data-profile-index="${profileIndex}" data-ingredient-index="${ingredientIndex}" data-ingredient-field="unit" value="${escapeAttribute(ingredient.unit)}" /></label>
        <label class="field"><span>Precio base</span><input type="number" min="0" step="any" data-profile-index="${profileIndex}" data-ingredient-index="${ingredientIndex}" data-ingredient-field="basePrice" value="${escapeAttribute(formatEditableNumber(ingredient.basePrice))}" /></label>
        <label class="field"><span>Precio por cóctel</span><input type="number" min="0" step="any" data-profile-index="${profileIndex}" data-ingredient-index="${ingredientIndex}" data-ingredient-field="lineCost" value="${escapeAttribute(formatEditableNumber(ingredient.lineCost))}" /></label>
        <button class="icon-button danger ingredient-remove" type="button" data-model-action="ingredient-remove" data-profile-index="${profileIndex}" data-ingredient-index="${ingredientIndex}" aria-label="Eliminar insumo">×</button>
      </div>`).join("");
    return `
      <article class="beverage-card">
        <div class="beverage-heading">
          <span class="item-number">${profileIndex + 1}</span>
          <label class="field beverage-percent"><span>Consumo (%)</span><input type="number" min="0" step="0.01" data-profile-index="${profileIndex}" data-beverage-field="consumptionPercent" value="${escapeAttribute(formatEditableNumber(profile.consumptionPercent))}" /></label>
          <label class="field beverage-name"><span>Cóctel</span><input data-profile-index="${profileIndex}" data-beverage-field="name" value="${escapeAttribute(profile.name)}" /></label>
          <div class="inline-actions" aria-label="Acciones de ${escapeAttribute(profile.name || `cóctel ${profileIndex + 1}`)}">
            <button class="icon-button" type="button" data-model-action="beverage-up" data-profile-index="${profileIndex}" aria-label="Subir cóctel" ${profileIndex === 0 ? "disabled" : ""}>↑</button>
            <button class="icon-button" type="button" data-model-action="beverage-down" data-profile-index="${profileIndex}" aria-label="Bajar cóctel" ${profileIndex === state.costing.beverageProfiles.length - 1 ? "disabled" : ""}>↓</button>
            <button class="icon-button danger" type="button" data-model-action="beverage-remove" data-profile-index="${profileIndex}" aria-label="Eliminar cóctel">×</button>
          </div>
        </div>
        <div class="ingredient-list">${ingredientRows || '<p class="empty-model-message">Añade al menos un insumo para calcular este cóctel.</p>'}</div>
        <div class="beverage-footer">
          <button class="text-button" type="button" data-model-action="ingredient-add" data-profile-index="${profileIndex}">Añadir insumo</button>
          <p>Costo del cóctel <strong data-cocktail-total="${profileIndex}">${formatCurrency(calculateCocktailCost(profile), state.quote.currency)}</strong></p>
        </div>
      </article>`;
  }).join("");
  if (!state.costing.beverageProfiles.length) {
    dom.beverageEditor.innerHTML = '<p class="empty-model-message">Añade un cóctel para calcular el Food Cost por pax.</p>';
  }
  updateCostModelOutputs();
}

function updateCostModelOutputs(changedProfileIndex = null) {
  syncCostingModel();
  const currency = state.quote.currency;
  const fixedTotal = state.costing.fixedCost;
  const percentTotal = calculateConsumptionPercentTotal(state.costing.beverageProfiles);
  const weightedCost = calculateWeightedDrinkCost(state.costing.beverageProfiles);
  const percentagesValid = Math.abs(percentTotal - 100) <= 0.01;

  if (dom.costingModelSummary) {
    dom.costingModelSummary.innerHTML = `
      <div class="model-summary-cell"><span>Costos fijos</span><strong>${formatCurrency(fixedTotal, currency)}</strong></div>
      <div class="model-summary-cell ${percentagesValid ? "is-valid" : "is-warning"}"><span>Porcentajes</span><strong>${formatEditableNumber(percentTotal, 2)}%</strong><small>${percentagesValid ? "Distribución completa" : "Debe sumar 100%"}</small></div>
      <div class="model-summary-cell"><span>Costo ponderado / bebida</span><strong>${formatDetailedCurrency(weightedCost, currency)}</strong></div>`;
  }
  if (dom.fixedCostTotal) dom.fixedCostTotal.textContent = formatCurrency(fixedTotal, currency);
  if (changedProfileIndex !== null) {
    const cocktailTotal = document.querySelector(`[data-cocktail-total="${changedProfileIndex}"]`);
    if (cocktailTotal && state.costing.beverageProfiles[changedProfileIndex]) {
      cocktailTotal.textContent = formatCurrency(
        calculateCocktailCost(state.costing.beverageProfiles[changedProfileIndex]),
        currency,
      );
    }
  }
  state.costing.consumptionOptions.forEach((option, index) => {
    const input = document.querySelector(`[data-consumption-cost="${index}"]`);
    if (input) input.value = formatEditableNumber(option.foodCostPerPax, 5);
  });
  refreshCostCalculator();
}

function hasValidConsumptionDistribution() {
  const percentTotal = calculateConsumptionPercentTotal(state.costing.beverageProfiles);
  return Math.abs(percentTotal - 100) <= 0.01;
}

function handleFixedCostInput(target) {
  const index = Number(target.dataset.fixedCostIndex);
  const item = state.costing.fixedCostItems[index];
  if (!item) return;
  const field = target.dataset.fixedCostField;
  if (field === "name") item.name = target.value;
  else item[field] = Math.max(0, readInputValue(target));

  if (field === "quantity" || field === "unitPrice") {
    item.total = item.quantity * item.unitPrice;
    const totalInput = document.querySelector(`[data-fixed-cost-index="${index}"][data-fixed-cost-field="total"]`);
    if (totalInput) totalInput.value = formatEditableNumber(item.total);
  }
  markDirty();
  updateCostModelOutputs();
}

function handleBeverageInput(target) {
  const profileIndex = Number(target.dataset.profileIndex);
  const profile = state.costing.beverageProfiles[profileIndex];
  if (!profile) return;

  if (target.matches("[data-beverage-field]")) {
    const field = target.dataset.beverageField;
    profile[field] = field === "name" ? target.value : Math.max(0, readInputValue(target));
  } else {
    const ingredientIndex = Number(target.dataset.ingredientIndex);
    const ingredient = profile.ingredients[ingredientIndex];
    if (!ingredient) return;
    const field = target.dataset.ingredientField;
    if (field === "name" || field === "unit") ingredient[field] = target.value;
    else ingredient[field] = Math.max(0, readInputValue(target));
    if (field === "quantity" || field === "basePrice") {
      recalculateIngredient(ingredient);
      const lineCostInput = document.querySelector(`[data-profile-index="${profileIndex}"][data-ingredient-index="${ingredientIndex}"][data-ingredient-field="lineCost"]`);
      if (lineCostInput) lineCostInput.value = formatEditableNumber(ingredient.lineCost);
    }
  }
  markDirty();
  updateCostModelOutputs(profileIndex);
}

function handleCostModelAction(button) {
  const action = button.dataset.modelAction;
  const fixedIndex = Number(button.dataset.fixedCostIndex);
  const profileIndex = Number(button.dataset.profileIndex);
  const ingredientIndex = Number(button.dataset.ingredientIndex);

  if (action === "fixed-add") {
    state.costing.fixedCostItems.push({ id: createId(), name: "Nuevo costo", quantity: 1, unitPrice: 0, total: 0 });
  } else if (action === "fixed-up" && fixedIndex > 0) {
    swapItems(state.costing.fixedCostItems, fixedIndex, fixedIndex - 1);
  } else if (action === "fixed-down" && fixedIndex < state.costing.fixedCostItems.length - 1) {
    swapItems(state.costing.fixedCostItems, fixedIndex, fixedIndex + 1);
  } else if (action === "fixed-remove" && state.costing.fixedCostItems[fixedIndex]) {
    state.costing.fixedCostItems.splice(fixedIndex, 1);
  } else if (action === "beverage-add") {
    state.costing.beverageProfiles.push({
      id: createId(),
      name: "Nuevo cóctel",
      consumptionPercent: 0,
      ingredients: [],
    });
  } else if (action === "beverage-up" && profileIndex > 0) {
    swapItems(state.costing.beverageProfiles, profileIndex, profileIndex - 1);
  } else if (action === "beverage-down" && profileIndex < state.costing.beverageProfiles.length - 1) {
    swapItems(state.costing.beverageProfiles, profileIndex, profileIndex + 1);
  } else if (action === "beverage-remove" && state.costing.beverageProfiles[profileIndex]) {
    state.costing.beverageProfiles.splice(profileIndex, 1);
  } else if (action === "ingredient-add" && state.costing.beverageProfiles[profileIndex]) {
    state.costing.beverageProfiles[profileIndex].ingredients.push({
      id: createId(),
      name: "Nuevo insumo",
      quantity: 1,
      unit: "unidad",
      basePrice: 0,
      lineCost: 0,
    });
  } else if (action === "ingredient-remove" && state.costing.beverageProfiles[profileIndex]?.ingredients[ingredientIndex]) {
    state.costing.beverageProfiles[profileIndex].ingredients.splice(ingredientIndex, 1);
  } else if (action === "reset-model") {
    if (!window.confirm("¿Restaurar los costos y bebidas del modelo oficial de Excel?")) return;
    const defaults = cloneCostingModelDefaults();
    state.costing.fixedCostItems = normalizeFixedCostItems(defaults.fixedCostItems);
    state.costing.beverageProfiles = normalizeBeverageProfiles(defaults.beverageProfiles);
    setCostingImportStatus("Modelo oficial restaurado.", false);
  } else {
    return;
  }

  syncCostingModel();
  markDirty();
  renderCostModelEditor();
  renderCostingEditor();
}

function swapItems(list, from, to) {
  [list[from], list[to]] = [list[to], list[from]];
}

async function importCostingWorkbook(file) {
  if (!file) return;
  if (!file.name.toLocaleLowerCase("es").endsWith(".xlsx")) {
    setCostingImportStatus("Selecciona un archivo .xlsx basado en el modelo Costeos_FB.", true);
    dom.costingFileInput.value = "";
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    setCostingImportStatus("El archivo supera el límite de 8 MB.", true);
    dom.costingFileInput.value = "";
    return;
  }

  setCostingImportStatus(`Leyendo ${file.name}…`, false);
  dom.costingFileInput.disabled = true;
  try {
    const XLSX = await import("./vendor/xlsx.mjs?v=0.20.3");
    const workbook = XLSX.read(await file.arrayBuffer(), { dense: true, cellFormula: true });
    const requiredSheets = ["Costeo Fijo", "Costeo Bebidas"];
    const missingSheets = requiredSheets.filter((name) => !workbook.SheetNames.includes(name));
    if (missingSheets.length) {
      throw new Error(`Falta ${missingSheets.map((name) => `«${name}»`).join(" y ")}. Usa el libro modelo Costeos_FB.xlsx.`);
    }
    const fixedRows = XLSX.utils.sheet_to_json(workbook.Sheets["Costeo Fijo"], {
      header: 1,
      raw: true,
      defval: null,
      blankrows: true,
    });
    const beverageRows = XLSX.utils.sheet_to_json(workbook.Sheets["Costeo Bebidas"], {
      header: 1,
      raw: true,
      defval: null,
      blankrows: true,
    });
    if (fixedRows.length > 500 || beverageRows.length > 5000) {
      throw new Error("El libro contiene demasiadas filas para este cotizador.");
    }
    const fixedResult = parseFixedCostRows(fixedRows);
    const beverageResult = parseBeverageRows(beverageRows);
    state.costing.fixedCostItems = normalizeFixedCostItems(fixedResult.items);
    state.costing.beverageProfiles = normalizeBeverageProfiles(beverageResult.profiles);
    syncCostingModel();
    markDirty();
    renderCostModelEditor();
    renderCostingEditor();
    const warnings = [...fixedResult.warnings, ...beverageResult.warnings];
    setCostingImportStatus(
      warnings.length
        ? `Importación completa con ${warnings.length} aviso${warnings.length === 1 ? "" : "s"}: ${warnings.join(" ")}`
        : `${file.name} importado: ${state.costing.fixedCostItems.length} costos y ${state.costing.beverageProfiles.length} cócteles.`,
      warnings.length > 0,
    );
    showToast("Costos importados y calculadora actualizada");
  } catch (error) {
    console.error(error);
    setCostingImportStatus(error?.message || "No se pudo leer el archivo.", true);
    showToast("No se pudo importar el Excel", true);
  } finally {
    dom.costingFileInput.disabled = false;
    dom.costingFileInput.value = "";
  }
}

function setCostingImportStatus(message, isError) {
  if (!dom.costingImportStatus) return;
  dom.costingImportStatus.textContent = message;
  dom.costingImportStatus.classList.toggle("is-error", Boolean(isError));
}

function refreshCostCalculator() {
  const matrix = document.querySelector("#cost-matrix");
  const summary = document.querySelector("#selected-cost-summary");
  if (!matrix || !summary) return;
  const formatter = (value) => formatCurrency(value, state.quote.currency);
  if (dom.fixedCostTotal) dom.fixedCostTotal.textContent = formatter(state.costing.fixedCost);
  if (!hasValidConsumptionDistribution()) {
    const percentTotal = calculateConsumptionPercentTotal(state.costing.beverageProfiles);
    const message = `La distribución actual suma ${formatEditableNumber(percentTotal, 2)}%. Complétala hasta 100% para calcular y aplicar una utilidad válida.`;
    matrix.innerHTML = `
      <div class="calculator-blocked" role="status">
        <strong>Completa los porcentajes de consumo</strong>
        <p>${escapeHtml(message)}</p>
        <button class="button button-secondary" type="button" data-cost-action="open-cost-model">Editar bebidas</button>
      </div>`;
    summary.innerHTML = `
      <div class="calculator-blocked-summary">
        <p class="eyebrow">Cálculo pendiente</p>
        <h3>La matriz se habilitará cuando los porcentajes sumen 100%.</h3>
      </div>`;
    return;
  }
  const selectedPrice = state.costing.selectedPriceIndex;
  const selectedConsumption = state.costing.selectedConsumptionIndex;
  const headerCells = state.costing.consumptionOptions.map((option) => `
    <th><strong>${formatQuantity(option.drinksPerPax)} bebidas</strong><span>${formatter(option.foodCostPerPax)} food cost / pax</span></th>`).join("");
  const rows = state.costing.priceOptions.map((price, priceIndex) => {
    const cells = state.costing.consumptionOptions.map((option, consumptionIndex) => {
      const result = calculateCostScenario(state, { pricePerPax: price, foodCostPerPax: option.foodCostPerPax });
      const selected = priceIndex === selectedPrice && consumptionIndex === selectedConsumption;
      const profitClass = result.profit < 0 ? "is-loss" : "is-profit";
      const accessibleLabel = `Precio ${formatter(price)}, ${formatQuantity(option.drinksPerPax)} bebidas por pax, utilidad ${formatter(result.profit)}, margen ${formatPercent(result.margin)}`;
      return `<td>
        <button class="matrix-choice ${selected ? "is-selected" : ""}" type="button" data-cost-action="select" data-price-index="${priceIndex}" data-consumption-index="${consumptionIndex}" aria-label="${escapeAttribute(accessibleLabel)}" aria-pressed="${selected}">
          <span class="matrix-choice-label">Utilidad</span>
          <strong class="${profitClass}">${formatter(result.profit)}</strong>
          <span>Margen ${formatPercent(result.margin)}</span>
        </button>
      </td>`;
    }).join("");
    return `<tr><th class="price-heading" scope="row"><span>Precio / pax</span><strong>${formatter(price)}</strong></th>${cells}</tr>`;
  }).join("");
  matrix.innerHTML = `<table class="cost-matrix"><caption class="sr-only">Utilidad y margen para cada cruce de precio y bebidas estimadas por pax</caption><thead><tr><th scope="col">Precio</th>${headerCells.replaceAll("<th>", '<th scope="col">')}</tr></thead><tbody>${rows}</tbody></table>`;

  const price = state.costing.priceOptions[selectedPrice];
  const option = state.costing.consumptionOptions[selectedConsumption];
  const result = calculateCostScenario(state, { pricePerPax: price, foodCostPerPax: option.foodCostPerPax });
  const profitClass = result.profit < 0 ? "is-loss" : "is-profit";
  summary.innerHTML = `
    <div class="selected-summary-heading">
      <div>
        <p class="eyebrow">Combinación seleccionada</p>
        <h3>${formatter(price)} · ${formatQuantity(option.drinksPerPax)} bebidas por pax</h3>
      </div>
      <span class="scenario-pill">${formatQuantity(state.event.pax)} pax</span>
    </div>
    <div class="cost-metrics">
      <div class="cost-metric"><span>Monto antes del descuento</span><strong>${formatter(result.grossRevenue)}</strong></div>
      <div class="cost-metric"><span>Descuento (${formatPercent(result.advertisingDiscount)})</span><strong>− ${formatter(result.discount)}</strong></div>
      <div class="cost-metric"><span>Venta después del descuento</span><strong>${formatter(result.netRevenue)}</strong></div>
      <div class="cost-metric"><span>Costo total</span><strong>${formatter(result.totalCost)}</strong></div>
      <div class="cost-metric ${profitClass}"><span>Utilidad estimada</span><strong>${formatter(result.profit)}</strong></div>
      <div class="cost-metric ${profitClass}"><span>Margen real</span><strong>${formatPercent(result.margin)}</strong></div>
      <div class="cost-metric"><span>IGV (${formatPercent(result.taxRate)})</span><strong>${formatter(result.taxAmount)}</strong></div>
      <div class="cost-metric"><span>Total del servicio con IGV</span><strong>${formatter(result.totalWithTax)}</strong></div>
    </div>
    <p class="calculation-explainer">Monto bruto = precio × pax + cobro adicional. Utilidad = monto bruto − descuento − food cost − costos fijos operativos. El IGV no se considera ganancia. Los demás artículos se suman en la cotización.</p>
    <button class="button button-primary" type="button" data-cost-action="apply-selected">Aplicar ${formatter(price)} a Barra Libre</button>`;
}

function selectCostCombination(priceIndex, consumptionIndex) {
  if (!Number.isFinite(state.costing.priceOptions[priceIndex]) || !state.costing.consumptionOptions[consumptionIndex]) return;
  state.costing.selectedPriceIndex = priceIndex;
  state.costing.selectedConsumptionIndex = consumptionIndex;
  markDirty();
  refreshCostCalculator();
}

function applyCostCombination(priceIndex, consumptionIndex) {
  if (!hasValidConsumptionDistribution()) {
    showToast("Completa los porcentajes de consumo hasta 100%", true);
    activateTab("cost-model", { focusPanel: true });
    return false;
  }
  const price = state.costing.priceOptions[priceIndex];
  const consumption = state.costing.consumptionOptions[consumptionIndex];
  if (!Number.isFinite(price) || !consumption) return false;
  let barItem = state.items.find((item) => item.presetKey === "openBar")
    || state.items.find((item) => item.name.toLocaleLowerCase("es").includes("barra libre"));
  if (!barItem) {
    barItem = normalizeItem({ ...ITEM_PRESETS.openBar });
    barItem.id = createId();
    state.items.push(barItem);
  }
  barItem.unitPrice = Math.max(0, finiteNumber(price));
  barItem.usePax = true;
  barItem.quantity = Math.max(1, finiteNumber(state.event.pax, 1));
  barItem.discountType = finiteNumber(state.costing.advertisingDiscount) > 0 ? "percent" : "none";
  barItem.discountValue = Math.min(100, Math.max(0, finiteNumber(state.costing.advertisingDiscount)));

  const extraAmount = Math.max(0, finiteNumber(state.costing.additionalCharge));
  let extraItem = state.items.find((item) => item.presetKey === "additionalCharge")
    || state.items.find((item) => item.name.trim().toLocaleLowerCase("es") === "cobro adicional");
  if (extraAmount > 0 || extraItem) {
    if (!extraItem) {
      extraItem = normalizeItem({ ...ITEM_PRESETS.additionalCharge });
      extraItem.id = createId();
      state.items.push(extraItem);
    }
    extraItem.unitPrice = extraAmount;
    extraItem.discountType = barItem.discountType;
    extraItem.discountValue = barItem.discountValue;
  }

  markDirty();
  renderItemsEditor();
  renderPreview();
  showToast(`${formatCurrency(price, state.quote.currency)} y ${formatQuantity(consumption.drinksPerPax)} bebidas/pax aplicados`);
  return true;
}

function activateTab(tabName, { focusPanel = false } = {}) {
  document.querySelectorAll("[data-tab]").forEach((button) => {
    const active = button.dataset.tab === tabName;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  });

  document.querySelectorAll(".tab-panel").forEach((panel) => {
    const active = panel.id === `panel-${tabName}`;
    panel.classList.toggle("is-active", active);
    panel.hidden = !active;
  });

  if (focusPanel) {
    requestAnimationFrame(() => {
      const heading = document.querySelector(`#panel-${tabName} h2`);
      if (!heading) return;
      heading.tabIndex = -1;
      heading.focus();
    });
  }
}

function populateBoundFields() {
  document.querySelectorAll("[data-bind]").forEach((input) => {
    const value = getByPath(state, input.dataset.bind);
    if (input.type === "checkbox") input.checked = Boolean(value);
    else input.value = value ?? "";
  });
}

function readInputValue(input) {
  if (input.type === "checkbox") return input.checked;
  if (input.type === "number") {
    const normalized = input.value.replace(",", ".");
    return normalized === "" ? 0 : finiteNumber(normalized, 0);
  }
  return input.value;
}

function getByPath(object, path) {
  return path.split(".").reduce((value, segment) => value?.[segment], object);
}

function setByPath(object, path, value) {
  const segments = path.split(".");
  const last = segments.pop();
  const parent = segments.reduce((current, segment) => current[segment], object);
  parent[last] = value;
}

function renderItemsEditor() {
  const formatter = (value) => formatCurrency(value, state.quote.currency);
  dom.itemCount.textContent = String(state.items.length);
  dom.itemsEditor.innerHTML = state.items.map((item, index) => {
    const calc = calculateItem(item, state.event.pax);
    const quantityValue = item.usePax ? state.event.pax : item.quantity;
    const discountDisabled = item.discountType === "none";
    const discountLabel = item.discountType === "fixed" ? "Descuento (monto)" : "Descuento (%)";
    return `
      <article class="item-card" data-item-card="${index}">
        <div class="item-card-header">
          <div class="item-card-title">
            <span class="item-number">${index + 1}</span>
            <h3 data-item-card-title="${index}">${escapeHtml(item.name || "Artículo sin nombre")}</h3>
          </div>
          <div class="item-actions" aria-label="Acciones del artículo ${index + 1}">
            <button class="icon-button" type="button" data-item-action="up" data-item-index="${index}" aria-label="Subir artículo" ${index === 0 ? "disabled" : ""}>↑</button>
            <button class="icon-button" type="button" data-item-action="down" data-item-index="${index}" aria-label="Bajar artículo" ${index === state.items.length - 1 ? "disabled" : ""}>↓</button>
            <button class="icon-button" type="button" data-item-action="duplicate" data-item-index="${index}" aria-label="Duplicar artículo">⧉</button>
            <button class="icon-button danger" type="button" data-item-action="remove" data-item-index="${index}" aria-label="Eliminar artículo">×</button>
          </div>
        </div>
        <div class="field-grid cols-2">
          <label class="field span-2">Nombre<input data-item-index="${index}" data-item-field="name" value="${escapeAttribute(item.name)}" /></label>
          <label class="field span-2">Descripción<textarea rows="7" data-item-index="${index}" data-item-field="description">${escapeHtml(item.description)}</textarea></label>
          <label class="field">Cantidad
            <input type="number" min="0.01" step="0.01" data-item-index="${index}" data-item-field="quantity" value="${escapeAttribute(quantityValue)}" ${item.usePax ? "disabled" : ""} />
          </label>
          <label class="field">Precio unitario
            <input type="number" min="0" step="0.01" data-item-index="${index}" data-item-field="unitPrice" value="${escapeAttribute(item.unitPrice)}" />
          </label>
          <label class="field">Tipo de descuento
            <select data-item-index="${index}" data-item-field="discountType">
              <option value="none" ${item.discountType === "none" ? "selected" : ""}>Sin descuento</option>
              <option value="percent" ${item.discountType === "percent" ? "selected" : ""}>Porcentaje</option>
              <option value="fixed" ${item.discountType === "fixed" ? "selected" : ""}>Monto fijo</option>
            </select>
          </label>
          <label class="field">${discountLabel}
            <input type="number" min="0" step="0.01" data-item-index="${index}" data-item-field="discountValue" value="${escapeAttribute(item.discountValue)}" ${discountDisabled ? "disabled" : ""} />
          </label>
          <label class="toggle-field span-2">
            <input type="checkbox" data-item-index="${index}" data-item-field="usePax" ${item.usePax ? "checked" : ""} />
            Usar el pax del evento como cantidad
          </label>
        </div>
        <div class="item-calculation" data-item-calculation="${index}">
          <div class="calculation-cell"><span>Bruto</span><strong>${formatter(calc.gross)}</strong></div>
          <div class="calculation-cell"><span>Descuento</span><strong>${formatter(calc.discount)}</strong></div>
          <div class="calculation-cell"><span>Importe</span><strong>${formatter(calc.net)}</strong></div>
        </div>
      </article>`;
  }).join("");
}

function updateItemCalculation(index) {
  const container = document.querySelector(`[data-item-calculation="${index}"]`);
  if (!container || !state.items[index]) return;
  const calc = calculateItem(state.items[index], state.event.pax);
  const values = [calc.gross, calc.discount, calc.net];
  container.querySelectorAll("strong").forEach((node, valueIndex) => {
    node.textContent = formatCurrency(values[valueIndex], state.quote.currency);
  });
}

function updateItemCardTitle(index) {
  const title = document.querySelector(`[data-item-card-title="${index}"]`);
  if (title) title.textContent = state.items[index]?.name || "Artículo sin nombre";
}

function handleItemAction(button) {
  const index = Number(button.dataset.itemIndex);
  if (!Number.isInteger(index) || !state.items[index]) return;
  const action = button.dataset.itemAction;

  if (action === "up" && index > 0) {
    [state.items[index - 1], state.items[index]] = [state.items[index], state.items[index - 1]];
  } else if (action === "down" && index < state.items.length - 1) {
    [state.items[index + 1], state.items[index]] = [state.items[index], state.items[index + 1]];
  } else if (action === "duplicate") {
    const copy = normalizeItem(JSON.parse(JSON.stringify(state.items[index])));
    copy.id = createId();
    copy.presetKey = "";
    copy.name = `${copy.name} (copia)`;
    state.items.splice(index + 1, 0, copy);
  } else if (action === "remove") {
    state.items.splice(index, 1);
  } else {
    return;
  }

  markDirty();
  renderItemsEditor();
  renderPreview();
}

function addSelectedItem() {
  const key = dom.presetSelect.value;
  const source = key === "blank" ? makeBlankItem() : normalizeItem({ ...ITEM_PRESETS[key] });
  source.id = createId();
  state.items.push(source);
  markDirty();
  renderItemsEditor();
  renderPreview();
  showToast(`${source.name || "Artículo"} añadido`);
  requestAnimationFrame(() => {
    dom.itemsEditor.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

function renderOrderedEditors() {
  dom.termsEditor.innerHTML = orderedListEditorHtml("terms", state.terms, true);
  dom.servicesEditor.innerHTML = orderedListEditorHtml("includedServices", state.includedServices, false);
}

function orderedListEditorHtml(listName, values, numbered) {
  return values.map((value, index) => `
    <div class="ordered-row">
      <span class="ordered-index">${numbered ? index + 1 : "•"}</span>
      <label class="field">
        <span class="sr-only">${numbered ? "Condición" : "Servicio"} ${index + 1}</span>
        <textarea rows="3" data-list-field="${listName}" data-list-index="${index}">${escapeHtml(value)}</textarea>
      </label>
      <div class="inline-actions">
        <button class="icon-button" type="button" data-list-action="up" data-list-name="${listName}" data-list-index="${index}" aria-label="Subir" ${index === 0 ? "disabled" : ""}>↑</button>
        <button class="icon-button" type="button" data-list-action="down" data-list-name="${listName}" data-list-index="${index}" aria-label="Bajar" ${index === values.length - 1 ? "disabled" : ""}>↓</button>
        <button class="icon-button danger" type="button" data-list-action="remove" data-list-name="${listName}" data-list-index="${index}" aria-label="Eliminar">×</button>
      </div>
    </div>`).join("");
}

function handleListAction(button) {
  const list = state[button.dataset.listName];
  const index = Number(button.dataset.listIndex);
  if (!Array.isArray(list) || !list[index] && list[index] !== "") return;
  const action = button.dataset.listAction;
  if (action === "up" && index > 0) [list[index - 1], list[index]] = [list[index], list[index - 1]];
  else if (action === "down" && index < list.length - 1) [list[index + 1], list[index]] = [list[index], list[index + 1]];
  else if (action === "remove") list.splice(index, 1);
  else return;
  markDirty();
  renderOrderedEditors();
  renderPreview();
}

function renderPreview() {
  const result = calculateQuote(state);
  const currency = state.quote.currency;
  const formatMoney = (value) => formatCurrency(value, currency);
  const companyDetails = [
    state.company.legalName && state.company.legalName !== state.company.displayName ? state.company.legalName : "",
    state.company.taxId ? `RUC ${state.company.taxId}` : "",
    state.company.address,
    [state.company.city, state.company.country].filter(Boolean).join(" · "),
    state.company.phone,
    state.company.email,
  ].filter(Boolean).join("\n");
  const customerSecondary = [
    state.customer.taxId ? `RUC / Documento: ${state.customer.taxId}` : "",
    state.customer.address,
    state.customer.phone,
    state.customer.email,
  ].filter(Boolean).join(" · ");
  const eventDate = formatDate(state.event.date);
  const eventTime = [formatTime(state.event.startTime), formatTime(state.event.endTime)].filter(Boolean).join(" - ");

  const itemRows = result.lines.map((line) => `
    <tr class="quote-item-row">
      <td>
        <p class="quote-item-name">${escapeHtml(line.item.name || "Artículo")}</p>
        ${line.item.description ? `<p class="quote-item-description">${multilineHtml(line.item.description)}</p>` : ""}
      </td>
      <td class="quote-number-cell">${formatMoney(line.unitPrice)}</td>
      <td class="quote-number-cell">${formatQuantity(line.quantity)}</td>
      <td class="quote-number-cell">${formatMoney(line.discount)}</td>
      <td class="quote-number-cell">${formatMoney(line.net)}</td>
    </tr>`).join("");

  const terms = state.terms.filter((term) => term.trim()).map((term) => `<li>${multilineHtml(term)}</li>`).join("");
  const services = state.includedServices.filter((service) => service.trim()).map((service) => `<li>${multilineHtml(service)}</li>`).join("");
  const showDiscount = result.totalDiscount > 0;

  dom.quoteDocument.innerHTML = `
    <header>
      <div class="quote-topline">
        <h2 class="quote-title">COTIZACIÓN</h2>
        <div class="quote-brand-corner">
          <img class="quote-brand-logo" src="./assets/fuelbar-logo.png" alt="Logo FuelBar" />
        </div>
      </div>
      <div class="quote-company">
        <p class="quote-company-name">${escapeHtml(state.company.displayName || "Fuelbar.pe")}</p>
        <p class="quote-company-details">${multilineHtml(companyDetails)}</p>
      </div>
    </header>

    <section class="quote-client-card">
      <div>
        <span class="quote-label">Para</span>
        <p class="quote-customer-name">${escapeHtml(state.customer.name || "Cliente")}</p>
        ${customerSecondary ? `<p class="quote-customer-secondary">${escapeHtml(customerSecondary)}</p>` : ""}
      </div>
      <dl class="quote-meta-grid">
        <dt>Cotización número</dt><dd>${escapeHtml(state.quote.number)}</dd>
        <dt>Emitido</dt><dd>${escapeHtml(formatDate(state.quote.issueDate))}</dd>
        <dt>N.° orden</dt><dd>${escapeHtml(state.quote.orderNumber)}</dd>
      </dl>
    </section>

    <section class="quote-event-strip">
      <div><strong>Evento</strong><span>${escapeHtml(state.event.title || "Evento")}</span></div>
      <div><strong>Fecha y horario</strong><span>${escapeHtml([eventDate, eventTime].filter(Boolean).join(" · ") || "Por definir")}</span></div>
      <div><strong>Pax y lugar</strong><span>${escapeHtml(`${formatQuantity(state.event.pax)} pax${state.event.location ? ` · ${state.event.location}` : ""}`)}</span></div>
    </section>

    <table class="quote-items">
      <colgroup><col /><col /><col /><col /><col /></colgroup>
      <thead><tr><th>Artículo</th><th>Precio</th><th>Cantidad</th><th>Descuento</th><th>Importe</th></tr></thead>
      <tbody>${itemRows || `<tr><td colspan="5" class="quote-item-description">No hay artículos.</td></tr>`}</tbody>
    </table>

    <section class="quote-totals">
      ${showDiscount ? `<div class="quote-total-row"><span>Subtotal</span><span>${formatMoney(result.grossSubtotal)}</span></div>
      <div class="quote-total-row is-discount"><span>Descuentos</span><span>− ${formatMoney(result.totalDiscount)}</span></div>` : ""}
      <div class="quote-total-row"><span>Total parcial</span><span>${formatMoney(result.taxableSubtotal)}</span></div>
      <div class="quote-total-row"><span>IGV (${formatPercent(result.taxRate)})</span><span>${formatMoney(result.taxAmount)}</span></div>
      <div class="quote-total-row is-grand"><span>Total General</span><span>${formatMoney(result.total)}</span></div>
    </section>

    <section class="quote-notes">
      ${terms ? `<ol>${terms}</ol>` : ""}
      ${services ? `<h3>Nuestro servicio incluye los siguientes otros servicios:</h3><ul>${services}</ul>` : ""}
      ${state.additionalNotes.trim() ? `<div class="quote-additional-notes">${multilineHtml(state.additionalNotes)}</div>` : ""}
    </section>

    <footer class="quote-footer">
      <span>${escapeHtml(state.company.website || state.company.displayName)}</span>
      <span>Cotización ${escapeHtml(state.quote.number)} · Válida por ${escapeHtml(state.quote.validityDays)} días calendario</span>
    </footer>`;

  dom.previewSummary.textContent = `${state.items.length} ${state.items.length === 1 ? "artículo" : "artículos"} · ${formatMoney(result.total)}`;
  dom.dialogQuoteNumber.textContent = state.quote.number;
}

function markDirty() {
  dirty = true;
  setSaveStatus("Cambios sin guardar");
}

function setSaveStatus(message) {
  dom.saveStatus.textContent = message;
}

function saveDraft() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    dirty = false;
    setSaveStatus("Guardado en este dispositivo");
    showToast("Borrador guardado localmente");
  } catch (error) {
    console.error(error);
    showToast("No se pudo guardar el borrador", true);
  }
}

function resetDraft() {
  if (!window.confirm("¿Restablecer todos los datos y volver a la plantilla inicial?")) return;
  state = normalizeState(cloneDefaultState());
  localStorage.removeItem(STORAGE_KEY);
  dirty = false;
  populateBoundFields();
  renderItemsEditor();
  renderCostingEditor();
  renderCostModelEditor();
  renderOrderedEditors();
  renderPreview();
  setSaveStatus("Plantilla restablecida");
  showToast("Se restauraron los valores iniciales");
}

function openPreviewDialog() {
  const errors = validateState();
  if (errors.length) {
    showValidationError(errors[0]);
    return;
  }
  const clone = dom.quoteDocument.cloneNode(true);
  clone.removeAttribute("id");
  dom.dialogPreview.replaceChildren(clone);
  dom.dialogQuoteNumber.textContent = state.quote.number;
  dom.previewDialog.showModal();
}

async function exportPdf() {
  const errors = validateState();
  if (errors.length) {
    showValidationError(errors[0]);
    return;
  }

  const buttons = [dom.downloadButton, dom.dialogDownloadButton];
  buttons.forEach((button) => {
    button.disabled = true;
    button.dataset.originalText = button.textContent;
    button.textContent = "Generando…";
  });

  try {
    await document.fonts?.ready;
    if (!globalThis.PDFLib?.PDFDocument) {
      showToast("Se abrirá el diálogo de impresión. Elige “Guardar como PDF”.");
      window.print();
      return;
    }
    const pdfBlob = await createQuotePdfBlob(state);
    const downloadUrl = URL.createObjectURL(pdfBlob);
    const downloadLink = document.createElement("a");
    downloadLink.href = downloadUrl;
    downloadLink.download = quoteFilename(state.quote.number);
    document.body.append(downloadLink);
    downloadLink.click();
    downloadLink.remove();
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 30_000);
    showToast("PDF generado");
  } catch (error) {
    console.error(error);
    showToast("No se pudo generar el PDF. Intenta imprimirlo desde la vista previa.", true);
  } finally {
    buttons.forEach((button) => {
      button.disabled = false;
      button.textContent = button.dataset.originalText || "Descargar PDF";
      delete button.dataset.originalText;
    });
  }
}

function validateState() {
  const errors = [];
  if (!String(state.quote.number || "").trim()) errors.push({ tab: "data", message: "Ingresa el número de cotización." });
  if (!state.quote.issueDate) errors.push({ tab: "data", message: "Ingresa la fecha de emisión." });
  if (!String(state.customer.name || "").trim()) errors.push({ tab: "data", message: "Ingresa el nombre del cliente." });
  if (finiteNumber(state.quote.taxRate) < 0 || finiteNumber(state.quote.taxRate) > 100) errors.push({ tab: "data", message: "El IGV debe estar entre 0% y 100%." });
  if (finiteNumber(state.event.pax) <= 0 || !Number.isInteger(finiteNumber(state.event.pax))) errors.push({ tab: "data", message: "El pax debe ser un número entero mayor que cero." });
  if (!state.items.length) errors.push({ tab: "items", message: "Añade al menos un artículo." });

  state.items.forEach((item, index) => {
    const calc = calculateItem(item, state.event.pax);
    if (!item.name.trim()) errors.push({ tab: "items", message: `Completa el nombre del artículo ${index + 1}.` });
    if (calc.quantity <= 0) errors.push({ tab: "items", message: `La cantidad del artículo ${index + 1} debe ser mayor que cero.` });
    if (finiteNumber(item.unitPrice) < 0) errors.push({ tab: "items", message: `El precio del artículo ${index + 1} no puede ser negativo.` });
    if (item.discountType === "percent" && (finiteNumber(item.discountValue) < 0 || finiteNumber(item.discountValue) > 100)) {
      errors.push({ tab: "items", message: `El descuento del artículo ${index + 1} debe estar entre 0% y 100%.` });
    }
    if (item.discountType === "fixed" && finiteNumber(item.discountValue) > calc.gross) {
      errors.push({ tab: "items", message: `El descuento fijo del artículo ${index + 1} no puede superar su importe bruto.` });
    }
  });
  return errors;
}

function showValidationError(error) {
  activateTab(error.tab);
  showToast(error.message, true);
}

function showToast(message, isError = false) {
  clearTimeout(toastTimer);
  dom.toast.textContent = message;
  dom.toast.classList.toggle("is-error", isError);
  dom.toast.classList.add("is-visible");
  toastTimer = setTimeout(() => dom.toast.classList.remove("is-visible"), 2800);
}

function formatQuantity(value) {
  return new Intl.NumberFormat("es-PE", { maximumFractionDigits: 2 }).format(finiteNumber(value));
}

function formatPercent(value) {
  const number = finiteNumber(value);
  return `${new Intl.NumberFormat("es-PE", { maximumFractionDigits: 2 }).format(number)}%`;
}

function formatDetailedCurrency(value, currency = "PEN") {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: currency || "PEN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 5,
  }).format(finiteNumber(value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

function multilineHtml(value) {
  return escapeHtml(value).replaceAll("\n", "<br>");
}
