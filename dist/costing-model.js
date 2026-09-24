export const COSTING_MODEL_REVISION = 3;

const round = (value, decimals = 10) => {
  const factor = 10 ** decimals;
  return Math.round((finiteNumber(value) + Number.EPSILON) * factor) / factor;
};

const makeIngredient = (name, quantity, unit, basePrice) => ({
  name,
  quantity,
  unit,
  basePrice,
  lineCost: round(quantity * basePrice, 12),
});

export const DEFAULT_FIXED_COST_ITEMS = [
  { name: "Transporte", quantity: 1, unitPrice: 150, total: 150 },
  { name: "Gasolina", quantity: 1, unitPrice: 150, total: 150 },
  { name: "Transporte Compras", quantity: 1, unitPrice: 100, total: 100 },
  { name: "Bartenders", quantity: 2, unitPrice: 150, total: 300 },
  { name: "Mozos / Ayudante", quantity: 2, unitPrice: 100, total: 200 },
  { name: "Aguas / Gaseosas", quantity: 120, unitPrice: 1, total: 120 },
  { name: "Misc", quantity: 120, unitPrice: 1, total: 120 },
  { name: "Alquiler Barras", quantity: 4, unitPrice: 800, total: 3200 },
  { name: "Decoracion", quantity: 2, unitPrice: 300, total: 600 },
];

export const DEFAULT_BEVERAGE_PROFILES = [
  {
    name: "Chilcano",
    consumptionPercent: 15,
    ingredients: [
      makeIngredient("Vaso", 1, "Unidad", 1),
      makeIngredient("Pisco Gran Cruz", 0.06, "litros", 21.5),
      makeIngredient("Mixer Ginger Ale", 0.2, "litros", 10.9 / 3),
      makeIngredient("Hielo", 0.2, "kg", 6.49 / 3),
      makeIngredient("Decoración", 1, "unidad", 1),
    ],
  },
  {
    name: "Chilcano Maracuya",
    consumptionPercent: 15,
    ingredients: [
      makeIngredient("Vaso", 1, "Unidad", 1),
      makeIngredient("Pisco Gran Cruz", 0.06, "litros", 21.5),
      makeIngredient("Maracuya", 0.06, "kg", 17.7),
      makeIngredient("Mixer Ginger Ale", 0.2, "litros", 10.9 / 3),
      makeIngredient("Hielo", 0.2, "kg", 6.49 / 3),
      makeIngredient("Decoración", 1, "unidad", 1),
    ],
  },
  {
    name: "Cuba libre",
    consumptionPercent: 23,
    ingredients: [
      makeIngredient("Vaso", 1, "Unidad", 1),
      makeIngredient("Ron Bacardi", 0.06, "litros", 64.2 / 1.75),
      makeIngredient("Mixer Coca Cola", 0.2, "litros", 23 / 6),
      makeIngredient("Hielo", 0.2, "kg", 6.49 / 3),
      makeIngredient("Decoración", 1, "unidad", 1),
    ],
  },
  {
    name: "Piña Colada",
    consumptionPercent: 0,
    ingredients: [
      makeIngredient("Vaso", 1, "Unidad", 1),
      makeIngredient("Ron Bacardi", 0.06, "litros", 64.2 / 1.75),
      makeIngredient("Piña", 0.06, "kg", 11.21),
      makeIngredient("Crema de Coco", 0.03, "litros", 18.5 / 0.8),
      makeIngredient("Hielo", 0.2, "kg", 6.49 / 3),
      makeIngredient("Decoración", 1, "unidad", 1),
    ],
  },
  {
    name: "Gin Tonic",
    consumptionPercent: 23,
    ingredients: [
      makeIngredient("Vaso", 1, "Unidad", 1),
      makeIngredient("Gin Singular", 0.06, "litros", 103 / 2),
      makeIngredient("Mixer Agua Tonica", 0.2, "litros", 29.4 / 9),
      makeIngredient("Hielo", 0.2, "kg", 6.49 / 3),
      makeIngredient("Decoración", 1, "unidad", 1),
    ],
  },
  {
    name: "Tinto de Verano",
    consumptionPercent: 24,
    ingredients: [
      makeIngredient("Vaso", 1, "Unidad", 1),
      makeIngredient("Vino Finca de la Moras Malbec", 0.09, "litros", 21 / 0.7),
      makeIngredient("Mixer Ginger Ale", 0.06, "litros", 10.9 / 3),
      makeIngredient("Jugo de Naranja", 0.06, "litros", 4.6),
      makeIngredient("Hielo", 0.2, "kg", 6.49 / 3),
      makeIngredient("Decoración", 1, "unidad", 1),
    ],
  },
];

export function cloneCostingModelDefaults() {
  return {
    fixedCostItems: structuredCloneSafe(DEFAULT_FIXED_COST_ITEMS),
    beverageProfiles: structuredCloneSafe(DEFAULT_BEVERAGE_PROFILES),
  };
}

export function finiteNumber(value, fallback = 0) {
  if (value === null || value === undefined || (typeof value === "string" && !value.trim())) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeFixedCostItems(items) {
  const source = Array.isArray(items) ? items : DEFAULT_FIXED_COST_ITEMS;
  return source.map((item, index) => {
    const quantity = Math.max(0, finiteNumber(item?.quantity));
    const unitPrice = Math.max(0, finiteNumber(item?.unitPrice));
    const calculated = round(quantity * unitPrice, 8);
    const total = hasNumericValue(item?.total) ? Math.max(0, finiteNumber(item.total)) : calculated;
    return {
      id: String(item?.id || `fixed-cost-${index + 1}`),
      name: String(item?.name || ""),
      quantity,
      unitPrice,
      total,
    };
  });
}

export function normalizeBeverageProfiles(profiles) {
  const source = Array.isArray(profiles) ? profiles : DEFAULT_BEVERAGE_PROFILES;
  return source.map((profile, profileIndex) => ({
    id: String(profile?.id || `beverage-${profileIndex + 1}`),
    name: String(profile?.name || ""),
    consumptionPercent: Math.max(0, finiteNumber(profile?.consumptionPercent ?? profile?.percentage)),
    ingredients: (Array.isArray(profile?.ingredients) ? profile.ingredients : []).map((ingredient, ingredientIndex) => {
      const quantity = Math.max(0, finiteNumber(ingredient?.quantity));
      const basePrice = Math.max(0, finiteNumber(ingredient?.basePrice));
      return {
        id: String(ingredient?.id || `ingredient-${profileIndex + 1}-${ingredientIndex + 1}`),
        name: String(ingredient?.name || ""),
        quantity,
        unit: String(ingredient?.unit || ""),
        basePrice,
        lineCost: hasNumericValue(ingredient?.lineCost)
          ? Math.max(0, finiteNumber(ingredient.lineCost))
          : round(quantity * basePrice, 12),
      };
    }),
  }));
}

export function recalculateIngredient(ingredient) {
  ingredient.lineCost = round(
    Math.max(0, finiteNumber(ingredient.quantity)) * Math.max(0, finiteNumber(ingredient.basePrice)),
    12,
  );
  return ingredient.lineCost;
}

export function calculateFixedCostTotal(items) {
  return round((items || []).reduce((sum, item) => sum + Math.max(0, finiteNumber(item.total)), 0), 8);
}

export function calculateCocktailCost(profile) {
  return round((profile?.ingredients || []).reduce(
    (sum, ingredient) => sum + Math.max(0, finiteNumber(ingredient.lineCost)),
    0,
  ), 12);
}

export function calculateConsumptionPercentTotal(profiles) {
  return round((profiles || []).reduce(
    (sum, profile) => sum + Math.max(0, finiteNumber(profile.consumptionPercent)),
    0,
  ), 8);
}

export function calculateWeightedDrinkCost(profiles) {
  return round((profiles || []).reduce((sum, profile) => (
    sum + calculateCocktailCost(profile) * Math.max(0, finiteNumber(profile.consumptionPercent)) / 100
  ), 0), 12);
}

export function calculateFoodCostFromProfiles(drinksPerPax, profiles) {
  return round(Math.max(0, finiteNumber(drinksPerPax)) * calculateWeightedDrinkCost(profiles), 5);
}

export function parseFixedCostRows(rows) {
  if (!Array.isArray(rows)) throw new Error("La hoja «Costeo Fijo» no contiene filas legibles.");
  const headerIndex = rows.findIndex((row) => normalizeText(row?.[0]) === "costos fijos");
  if (headerIndex < 0) throw new Error("No se encontró el encabezado «Costos fijos» en la columna A.");

  const items = [];
  const warnings = [];
  for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] || [];
    const name = cellText(row[0]);
    if (normalizeText(name) === "total") break;
    if ([row[0], row[1], row[2], row[3]].every(isBlank)) continue;
    if (!name) {
      warnings.push(`Costeo Fijo, fila ${rowIndex + 1}: se omitió una partida sin nombre.`);
      continue;
    }
    const quantity = Math.max(0, finiteNumber(row[1]));
    const unitPrice = Math.max(0, finiteNumber(row[2]));
    const calculated = round(quantity * unitPrice, 8);
    const total = hasNumericValue(row[3]) ? Math.max(0, finiteNumber(row[3])) : calculated;
    if (Math.abs(total - calculated) > 0.01) {
      warnings.push(`Costeo Fijo, fila ${rowIndex + 1}: el precio total no coincide con cantidad × precio unitario; se conservó el total del archivo.`);
    }
    items.push({ id: `fixed-import-${rowIndex + 1}`, name, quantity, unitPrice, total });
  }
  if (!items.length) throw new Error("La hoja «Costeo Fijo» no contiene partidas antes de la fila Total.");
  return { items, warnings };
}

export function parseBeverageRows(rows) {
  if (!Array.isArray(rows)) throw new Error("La hoja «Costeo Bebidas» no contiene filas legibles.");
  const headerIndex = rows.findIndex((row) => (
    normalizeText(row?.[3]) === "cantidad"
    && normalizeText(row?.[4]) === "unidad"
    && normalizeText(row?.[5]) === "precio base"
  ));
  if (headerIndex < 0) throw new Error("No se encontraron los encabezados Cantidad, Unidad y Precio base en «Costeo Bebidas».");

  const profiles = [];
  const warnings = [];
  let current = null;

  const finishCurrent = () => {
    if (!current) return;
    if (!current.ingredients.length) {
      warnings.push(`${current.name}: no tiene insumos y se importó con costo cero.`);
    }
    if (hasNumericValue(current.importedTotal)) {
      const calculated = calculateCocktailCost(current);
      if (Math.abs(calculated - finiteNumber(current.importedTotal)) > 0.02) {
        warnings.push(`${current.name}: el total del cóctel no coincide con la suma de insumos; la web usará la suma de insumos.`);
      }
    }
    delete current.importedTotal;
    profiles.push(current);
  };

  for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] || [];
    const percentage = parsePercentage(row[0]);
    const beverageName = cellText(row[1]);
    if (percentage !== null && beverageName) {
      finishCurrent();
      current = {
        id: `beverage-import-${rowIndex + 1}`,
        name: beverageName,
        consumptionPercent: percentage,
        ingredients: [],
      };
    }
    if (!current) continue;

    const ingredientName = cellText(row[2]);
    if (ingredientName) {
      const quantity = Math.max(0, finiteNumber(row[3]));
      const basePrice = Math.max(0, finiteNumber(row[5]));
      const calculated = round(quantity * basePrice, 12);
      const lineCost = hasNumericValue(row[6]) ? Math.max(0, finiteNumber(row[6])) : calculated;
      if (Math.abs(lineCost - calculated) > 0.02) {
        warnings.push(`${current.name}, fila ${rowIndex + 1}: el precio por cóctel no coincide con cantidad × precio base; se conservó el valor del archivo.`);
      }
      current.ingredients.push({
        id: `ingredient-import-${rowIndex + 1}`,
        name: ingredientName,
        quantity,
        unit: cellText(row[4]),
        basePrice,
        lineCost,
      });
    } else if (hasNumericValue(row[6])) {
      current.importedTotal = finiteNumber(row[6]);
    }
  }
  finishCurrent();

  if (!profiles.length) throw new Error("No se encontraron cócteles identificados por porcentaje en la columna A y nombre en la columna B.");
  const percentTotal = calculateConsumptionPercentTotal(profiles);
  if (Math.abs(percentTotal - 100) > 0.01) {
    warnings.push(`Los porcentajes de consumo suman ${formatEditableNumber(percentTotal, 4)}%; deben sumar 100%.`);
  }
  return { profiles, warnings };
}

export function formatEditableNumber(value, decimals = 6) {
  const numeric = finiteNumber(value);
  return String(Number(numeric.toFixed(decimals)));
}

function parsePercentage(value) {
  if (isBlank(value)) return null;
  if (typeof value === "string" && value.trim().endsWith("%")) {
    const parsed = Number(value.trim().slice(0, -1).replace(",", "."));
    return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return numeric <= 1 ? numeric * 100 : numeric;
}

function hasNumericValue(value) {
  return !isBlank(value) && Number.isFinite(Number(value));
}

function isBlank(value) {
  return value === null || value === undefined || (typeof value === "string" && !value.trim());
}

function cellText(value) {
  return isBlank(value) ? "" : String(value).trim();
}

function normalizeText(value) {
  return cellText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
}

function structuredCloneSafe(value) {
  return globalThis.structuredClone ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value));
}
