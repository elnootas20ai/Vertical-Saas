/**
 * Expande líneas de pedido para descuento de stock por receta:
 * - Combos → cada componente (pizza + bebida + postre…) × cantidades
 * - Mitad y mitad → receta compuesta (base entera + sabores al 50 %)
 */

function foldName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

export function isComboCatalogItem(item) {
  if (!item) return false;
  const cat = foldName(item.category);
  if (item.itemType === 'combo') return true;
  if (cat === 'combos' || cat === 'combo' || cat === 'menus' || cat === 'menu') return true;
  return Array.isArray(item.comboItems) && item.comboItems.length > 0;
}

export function isPizzaBaseIngredientName(name) {
  const f = foldName(name);
  if (!f) return false;
  if (/mozzarella|queso|jam[oó]n|pepperoni|champi|anchoa|salami|bacon|carne|atun|atún|vegetal|verdura/.test(f)) {
    return false;
  }
  return /masa|harina|salsa|tomate|base/.test(f);
}

function normalizeComboRef(ref) {
  if (!ref || typeof ref !== 'object') return null;
  const productId = String(ref.productId || ref.catalogItemId || '').trim();
  const quantity = Number(ref.quantity || 1);
  if (!productId || !(quantity > 0)) return null;
  return {
    productId,
    productName: String(ref.productName || '').trim(),
    quantity,
    slotKind: ref.slotKind,
  };
}

export function normalizeHalfHalfSelection(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const firstProductId = String(raw.firstProductId || '').trim();
  const secondProductId = String(raw.secondProductId || '').trim();
  if (!firstProductId || !secondProductId) return null;
  return {
    firstProductId,
    firstProductName: String(raw.firstProductName || '').trim(),
    secondProductId,
    secondProductName: String(raw.secondProductName || '').trim(),
  };
}

/**
 * @returns {Array<{ catalogItemId: string, quantity: number, halfHalf?: object, parentCatalogItemId?: string }>}
 */
export function expandOrderLineForRecipeDeduction(line, catalogById) {
  const catalogItemId = String(line?.catalogItemId || line?.productId || '').trim();
  const lineQty = Number(line?.quantity || 0);
  if (!catalogItemId || !(lineQty > 0)) return [];

  const catItem = catalogById.get(catalogItemId) || null;
  const comboRefs = (Array.isArray(line.comboSelections) ? line.comboSelections : [])
    .map(normalizeComboRef)
    .filter(Boolean);

  if (comboRefs.length === 0 && catItem && isComboCatalogItem(catItem)) {
    for (const ref of catItem.comboItems || []) {
      const normalized = normalizeComboRef(ref);
      if (normalized) comboRefs.push(normalized);
    }
  }

  if (comboRefs.length > 0) {
    const out = [];
    for (const ref of comboRefs) {
      out.push({
        catalogItemId: ref.productId,
        quantity: ref.quantity * lineQty,
        parentCatalogItemId: catalogItemId,
      });
    }
    return out;
  }

  const halfHalf = normalizeHalfHalfSelection(line.halfHalfPizza);
  if (halfHalf) {
    return [{
      catalogItemId,
      quantity: lineQty,
      halfHalf,
      parentCatalogItemId: catalogItemId,
    }];
  }

  if (catItem?.customFields?.halfHalf === true && !halfHalf) {
    return [{ catalogItemId, quantity: lineQty, parentCatalogItemId: catalogItemId }];
  }

  return [{ catalogItemId, quantity: lineQty, parentCatalogItemId: catalogItemId }];
}

export function expandOrderItemsForRecipeDeduction(items, catalogById) {
  const out = [];
  for (const line of items || []) {
    out.push(...expandOrderLineForRecipeDeduction(line, catalogById));
  }
  return out;
}

function ingredientQtyPerUnit(ingredient, portions = 1) {
  let q = Number(ingredient.quantity || 0) / (Number(portions) > 0 ? Number(portions) : 1);
  if (ingredient.wastePercent > 0) {
    q = q / (1 - ingredient.wastePercent / 100);
  }
  return q;
}

/**
 * Mezcla recetas mitad y mitad: base una vez + toppings de cada sabor al 50 %.
 * @returns {Map<string, { catalogItemId: string, catalogItemName: string, quantity: number, unitCost: number }>}
 */
export function mergeHalfHalfIngredientQuantities({
  baseRecipe,
  firstRecipe,
  secondRecipe,
  quantitySold,
}) {
  const map = new Map();
  const add = (ingredient, multiplier) => {
    const catalogItemId = String(ingredient.catalogItemId || '').trim();
    if (!catalogItemId) return;
    let q = ingredientQtyPerUnit(ingredient, ingredient.portions || 1) * multiplier;
    q = Math.round(q * 10000) / 10000;
    if (q <= 0) return;
    const prev = map.get(catalogItemId);
    if (prev) {
      prev.quantity = Math.round((prev.quantity + q) * 10000) / 10000;
      return;
    }
    map.set(catalogItemId, {
      catalogItemId,
      catalogItemName: ingredient.catalogItemName || ingredient.name || '',
      quantity: q,
      unitCost: Number(ingredient.costPerUnit) || 0,
    });
  };

  const baseLines = (baseRecipe?.ingredients || []).filter(
    (ing) => isPizzaBaseIngredientName(ing.catalogItemName || ing.name),
  );
  if (baseLines.length > 0) {
    for (const ing of baseLines) add(ing, quantitySold);
  } else if (firstRecipe?.ingredients?.length) {
    for (const ing of firstRecipe.ingredients) {
      if (isPizzaBaseIngredientName(ing.catalogItemName || ing.name)) {
        add(ing, quantitySold);
      }
    }
  }

  for (const ing of firstRecipe?.ingredients || []) {
    if (isPizzaBaseIngredientName(ing.catalogItemName || ing.name)) continue;
    add(ing, 0.5 * quantitySold);
  }
  for (const ing of secondRecipe?.ingredients || []) {
    if (isPizzaBaseIngredientName(ing.catalogItemName || ing.name)) continue;
    add(ing, 0.5 * quantitySold);
  }

  return map;
}
