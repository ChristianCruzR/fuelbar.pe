export const STORAGE_KEY = "fuelbar-cotizador-v2";

// Promedio ponderado por bebida tomado del costeo original:
// (costo de cada cóctel × su porcentaje estimado de consumo).
export const WEIGHTED_DRINK_COST = 5.507089523809524;

export function calculateFoodCostPerPax(drinksPerPax) {
  const drinks = Math.max(0, finiteNumber(drinksPerPax));
  return Math.round((drinks * WEIGHTED_DRINK_COST + Number.EPSILON) * 100000) / 100000;
}

function todayInLocalTime() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export const ITEM_PRESETS = {
  additionalCharge: {
    presetKey: "additionalCharge",
    name: "Cobro adicional",
    description: "",
    quantity: 1,
    unitPrice: 0,
    discountType: "percent",
    discountValue: 15,
    usePax: false,
  },
  bartruck: {
    presetKey: "bartruck",
    name: "BarTruck",
    description: "Vehículo Vintage Volkswagen Kombi T2",
    quantity: 1,
    unitPrice: 2000,
    discountType: "none",
    discountValue: 0,
    usePax: false,
  },
  water: {
    presetKey: "water",
    name: "Servicio de Agua y Gaseosas",
    description: "Servicio incluído.",
    quantity: 1,
    unitPrice: 0,
    discountType: "none",
    discountValue: 0,
    usePax: false,
  },
  openBar: {
    presetKey: "openBar",
    name: "Servicio de Bar - Barra Libre",
    description: `SERVICIO DE BARRA ILIMITADA

[ Menaje: Vasos Acrílicos ]

BASES DE COCTELERÍA: Gin / Ron / Pisco / Vino Tinto

CÓCTELES INCLUIDOS
• Gin Tonic
• Chilcano Clásico
• Chilcano de Maracuyá
• Cuba Libre
• Tinto de Verano`,
    quantity: 120,
    unitPrice: 130,
    discountType: "percent",
    discountValue: 15,
    usePax: true,
  },
  transport: {
    presetKey: "transport",
    name: "Transporte",
    description: "Lima Metropolitana",
    quantity: 1,
    unitPrice: 100,
    discountType: "none",
    discountValue: 0,
    usePax: false,
  },
};

export const DEFAULT_STATE = {
  company: {
    displayName: "Fuelbar.pe",
    legalName: "Fuelbar.pe",
    taxId: "",
    address: "Av. José Pardo 1299",
    city: "Miraflores",
    country: "PE",
    phone: "+51 995 551 000",
    email: "contacto@fuelbar.pe",
    website: "fuelbar.pe",
  },
  customer: {
    name: "Silvana Arbulú - Casino de La Policía",
    taxId: "",
    email: "",
    phone: "",
    address: "",
  },
  quote: {
    number: "286",
    issueDate: todayInLocalTime(),
    orderNumber: "1",
    currency: "PEN",
    taxRate: 10.5,
    validityDays: 3,
  },
  event: {
    title: "Servicio de barra libre",
    pax: 120,
    date: "2026-11-27",
    startTime: "15:30",
    endTime: "21:30",
    location: "La Molina, Lima",
  },
  costing: {
    fixedCost: 3340,
    advertisingDiscount: 15,
    additionalCharge: 0,
    priceOptions: [110, 130, 150],
    consumptionOptions: [
      { id: "consumption-8", drinksPerPax: 8, foodCostPerPax: calculateFoodCostPerPax(8) },
      { id: "consumption-9", drinksPerPax: 9, foodCostPerPax: calculateFoodCostPerPax(9) },
      { id: "consumption-10", drinksPerPax: 10, foodCostPerPax: calculateFoodCostPerPax(10) },
    ],
    selectedPriceIndex: 1,
    selectedConsumptionIndex: 1,
  },
  items: [
    { ...ITEM_PRESETS.bartruck },
    { ...ITEM_PRESETS.water },
    { ...ITEM_PRESETS.openBar },
    { ...ITEM_PRESETS.transport },
  ],
  terms: [
    "Después de aceptada esta cotización, el cliente acepta del 50% del total adelanto (en efectivo o abono).",
    "Las cantidades dadas en esta cotización son un consumo mínimo. en caso de que se consuman menos bebidas en el transcurso del evento, no se otorgarán descuentos y se cobrará el mismo total.",
    "En caso de mayor afluencia de personas se cobrará un adicional por persona igual al precio unitario mencionado en esta cotización.",
    "Por favor, enviar la cotización firmada al email indicado anteriormente.",
    "Esta cotización tiene validez por 3 días calendarios a partir de haber sido emitido.",
    "Válido sólo para la fecha y hora coordinada. En caso de postergaciones o cambios de hora/fecha, estaría sujeto a disponibilidad del negocio (Fuelbar).",
  ],
  includedServices: [
    "Coordinador de evento (6 horas de servicio + 2 horas de instalación/desinstalación) 1 Bartender, 1 Ayudante, personal totalmente uniformado, volkswagen vintage completamente equipado.",
    "Utensilios y herramientas profesionales de bar, Carta, Zumo de frutas naturales, jarabes incluídos, hielo, insumos artesanales, decoración, servilletas, vasos, extintor.",
  ],
  additionalNotes: "",
};

export function cloneDefaultState() {
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

export function finiteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function roundMoney(value) {
  return Math.round((finiteNumber(value) + Number.EPSILON) * 100) / 100;
}

export function calculateItem(item, pax) {
  const quantity = item.usePax ? Math.max(0, finiteNumber(pax)) : Math.max(0, finiteNumber(item.quantity));
  const unitPrice = Math.max(0, finiteNumber(item.unitPrice));
  const gross = roundMoney(quantity * unitPrice);
  const discountType = ["percent", "fixed"].includes(item.discountType) ? item.discountType : "none";
  const discountValue = Math.max(0, finiteNumber(item.discountValue));
  const discount = discountType === "percent"
    ? roundMoney(gross * Math.min(100, discountValue) / 100)
    : discountType === "fixed"
      ? Math.min(gross, roundMoney(discountValue))
      : 0;
  const net = roundMoney(gross - discount);
  return { quantity, unitPrice, discountType, discountValue, gross, discount, net };
}

export function calculateQuote(state) {
  const lines = state.items.map((item) => ({ item, ...calculateItem(item, state.event.pax) }));
  const grossSubtotal = roundMoney(lines.reduce((sum, line) => sum + line.gross, 0));
  const totalDiscount = roundMoney(lines.reduce((sum, line) => sum + line.discount, 0));
  const taxableSubtotal = roundMoney(lines.reduce((sum, line) => sum + line.net, 0));
  const taxRate = Math.min(100, Math.max(0, finiteNumber(state.quote.taxRate)));
  const taxAmount = roundMoney(taxableSubtotal * taxRate / 100);
  const total = roundMoney(taxableSubtotal + taxAmount);
  return { lines, grossSubtotal, totalDiscount, taxableSubtotal, taxRate, taxAmount, total };
}

export function calculateCostScenario(state, scenario) {
  const pax = Math.max(0, finiteNumber(state.event.pax));
  const pricePerPax = Math.max(0, finiteNumber(scenario.pricePerPax));
  const foodCostPerPax = Math.max(0, finiteNumber(scenario.foodCostPerPax));
  const fixedCost = Math.max(0, finiteNumber(state.costing.fixedCost));
  const additionalCharge = Math.max(0, finiteNumber(state.costing.additionalCharge));
  const advertisingDiscount = Math.min(100, Math.max(0, finiteNumber(state.costing.advertisingDiscount)));
  const taxRate = Math.min(100, Math.max(0, finiteNumber(state.quote.taxRate)));
  const variableCost = roundMoney(pax * foodCostPerPax);
  const totalCost = roundMoney(variableCost + fixedCost);
  const grossRevenue = roundMoney(pax * pricePerPax + additionalCharge);
  const discount = roundMoney(grossRevenue * advertisingDiscount / 100);
  const netRevenue = roundMoney(grossRevenue - discount);
  const profit = roundMoney(netRevenue - totalCost);
  const margin = netRevenue > 0 ? roundMoney(profit / netRevenue * 100) : 0;
  const taxAmount = roundMoney(netRevenue * taxRate / 100);
  const totalWithTax = roundMoney(netRevenue + taxAmount);
  const costPerPax = pax > 0 ? roundMoney(totalCost / pax) : 0;
  return {
    pax,
    pricePerPax,
    foodCostPerPax,
    fixedCost,
    additionalCharge,
    advertisingDiscount,
    variableCost,
    totalCost,
    costPerPax,
    grossRevenue,
    discount,
    netRevenue,
    profit,
    margin,
    taxRate,
    taxAmount,
    totalWithTax,
  };
}

export function currencyFormatter(currency = "PEN") {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: currency || "PEN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatCurrency(value, currency = "PEN") {
  return currencyFormatter(currency).format(finiteNumber(value));
}

export function formatDate(dateValue) {
  if (!dateValue) return "";
  const date = new Date(`${dateValue}T12:00:00`);
  if (Number.isNaN(date.getTime())) return String(dateValue);
  return new Intl.DateTimeFormat("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatTime(timeValue) {
  if (!timeValue) return "";
  const [hours, minutes] = String(timeValue).split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return String(timeValue);
  const date = new Date(2000, 0, 1, hours, minutes);
  return new Intl.DateTimeFormat("es-PE", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function quoteFilename(number) {
  const safe = String(number || "sin-numero").trim().replace(/[^a-zA-Z0-9_-]+/g, "-");
  return `Cotizacion-${safe || "sin-numero"}.pdf`;
}
