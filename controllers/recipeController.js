import {
  getCatalogDbName,
  listCatalogItemsByUser,
  findAccountByUserId,
  ensureDatabase,
  getDocument,
  putDocument,
  softDeleteDocument,
} from '../services/couchdb.js';
import {
  buildRecipeDocument,
  sanitizeRecipe,
  listRecipesByUser,
  findRecipeByCatalogItem,
} from '../services/recipeModel.js';

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

async function ensureRecipeOwner(req, userId, recipeId) {
  const db = getCatalogDbName();
  await ensureDatabase(req, db);
  const doc = await getDocument(req, db, recipeId);
  if (!doc || doc.type !== 'recipe' || doc.user_id !== userId || doc.deletedAt) return null;
  return doc;
}

export async function listRecipes(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    let recipes = await listRecipesByUser(req, userId);
    recipes = recipes.map(sanitizeRecipe);

    const { category, active, catalogItemId } = req.query;
    if (category) recipes = recipes.filter(r => r.category === category);
    if (active !== undefined) recipes = recipes.filter(r => r.active === (active === 'true'));
    if (catalogItemId) recipes = recipes.filter(r => r.catalogItemId === catalogItemId);

    return res.json({ ok: true, recipes });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al cargar recetas' });
  }
}

export async function getRecipe(req, res) {
  try {
    const { userId, recipeId } = req.params;
    if (!userId || !recipeId) return badRequest(res, 'Falta userId o recipeId');

    const existing = await ensureRecipeOwner(req, userId, recipeId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Receta no encontrada' });

    return res.json({ ok: true, recipe: sanitizeRecipe(existing) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al obtener receta' });
  }
}

export async function createRecipe(req, res) {
  try {
    const { userId } = req.params;
    const { recipe } = req.body || {};

    if (!userId) return badRequest(res, 'Falta userId');
    if (!recipe || typeof recipe !== 'object') return badRequest(res, 'Falta el objeto recipe en el body');
    if (!recipe.name?.trim()) return badRequest(res, 'El nombre de la receta es obligatorio');
    if (!recipe.catalogItemId) return badRequest(res, 'Falta el producto vinculado (catalogItemId)');
    if (!Array.isArray(recipe.ingredients) || recipe.ingredients.length === 0) {
      return badRequest(res, 'La receta necesita al menos un ingrediente');
    }

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getCatalogDbName();
    await ensureDatabase(req, db);

    const doc = buildRecipeDocument(userId, recipe);
    const saved = await putDocument(req, db, doc._id, doc);

    return res.status(201).json({ ok: true, recipe: sanitizeRecipe({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al crear receta' });
  }
}

export async function updateRecipe(req, res) {
  try {
    const { userId, recipeId } = req.params;
    const { recipe } = req.body || {};

    if (!userId || !recipeId) return badRequest(res, 'Falta userId o recipeId');
    if (!recipe || typeof recipe !== 'object') return badRequest(res, 'Faltan datos de la receta');

    const existing = await ensureRecipeOwner(req, userId, recipeId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Receta no encontrada' });

    const db = getCatalogDbName();
    const doc = buildRecipeDocument(userId, { ...existing, ...recipe }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    return res.json({ ok: true, recipe: sanitizeRecipe({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al actualizar receta' });
  }
}

export async function deleteRecipe(req, res) {
  try {
    const { userId, recipeId } = req.params;
    if (!userId || !recipeId) return badRequest(res, 'Falta userId o recipeId');

    const existing = await ensureRecipeOwner(req, userId, recipeId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Receta no encontrada' });

    const db = getCatalogDbName();
    await softDeleteDocument(req, db, recipeId);

    return res.json({ ok: true, id: recipeId });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al eliminar receta' });
  }
}

export async function duplicateRecipe(req, res) {
  try {
    const { userId, recipeId } = req.params;
    if (!userId || !recipeId) return badRequest(res, 'Falta userId o recipeId');

    const existing = await ensureRecipeOwner(req, userId, recipeId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Receta no encontrada' });

    const cloneData = {
      ...existing,
      name: `${existing.name} (copia)`,
      _id: undefined,
      _rev: undefined,
    };
    const db = getCatalogDbName();
    const doc = buildRecipeDocument(userId, cloneData);
    const saved = await putDocument(req, db, doc._id, doc);

    return res.status(201).json({ ok: true, recipe: sanitizeRecipe({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al duplicar receta' });
  }
}

export async function getRecipeByProduct(req, res) {
  try {
    const { userId, catalogItemId } = req.params;
    if (!userId || !catalogItemId) return badRequest(res, 'Falta userId o catalogItemId');

    const recipes = await findRecipeByCatalogItem(req, userId, catalogItemId);
    return res.json({ ok: true, recipes: recipes.map(sanitizeRecipe) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al buscar recetas del producto' });
  }
}

export async function recalculateCosts(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getCatalogDbName();
    await ensureDatabase(req, db);

    const recipes = await listRecipesByUser(req, userId);
    const catalogItems = await listCatalogItemsByUser(req, userId);
    const itemMap = new Map(catalogItems.map(item => [item._id, item]));

    let updated = 0;
    for (const recipe of recipes) {
      let changed = false;
      const updatedIngredients = recipe.ingredients.map(ing => {
        const item = itemMap.get(ing.catalogItemId);
        if (item && Number(item.costPrice || 0) !== ing.costPerUnit) {
          changed = true;
          return { ...ing, costPerUnit: Number(item.costPrice || 0) };
        }
        return ing;
      });

      if (changed) {
        const doc = buildRecipeDocument(userId, { ...recipe, ingredients: updatedIngredients }, recipe);
        await putDocument(req, db, doc._id, doc);
        updated++;
      }
    }

    return res.json({ ok: true, updated, total: recipes.length });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al recalcular costes' });
  }
}

export async function checkRecipeStock(req, res) {
  try {
    const { userId } = req.params;
    const { items } = req.body || {};

    if (!userId) return badRequest(res, 'Falta userId');
    if (!Array.isArray(items) || items.length === 0) return badRequest(res, 'Falta el array items');

    const catalogItems = await listCatalogItemsByUser(req, userId);
    const itemMap = new Map(catalogItems.map(item => [item._id, item]));

    const details = [];
    let canFulfill = true;

    for (const { catalogItemId, quantity } of items) {
      const recipes = await findRecipeByCatalogItem(req, userId, catalogItemId);
      const recipe = recipes.find(r => r.active);

      if (!recipe) {
        const product = itemMap.get(catalogItemId);
        const available = product ? Number(product.stockQuantity || 0) : 0;
        const required = Number(quantity || 1);
        const sufficient = available >= required;
        if (!sufficient) canFulfill = false;
        details.push({
          catalogItemId,
          catalogItemName: product?.name || '',
          hasRecipe: false,
          ingredients: [{
            catalogItemId,
            name: product?.name || '',
            required,
            available,
            sufficient,
            shortage: sufficient ? 0 : required - available,
          }],
        });
        continue;
      }

      const ingredientDetails = [];
      for (const ing of recipe.ingredients) {
        const ingItem = itemMap.get(ing.catalogItemId);
        const available = ingItem ? Number(ingItem.stockQuantity || 0) : 0;
        const requiredPerUnit = ing.wastePercent > 0
          ? (ing.quantity / recipe.portions) / (1 - ing.wastePercent / 100)
          : ing.quantity / recipe.portions;
        const required = requiredPerUnit * Number(quantity || 1);
        const sufficient = available >= required || ing.optional;
        if (!sufficient && !ing.optional) canFulfill = false;

        ingredientDetails.push({
          catalogItemId: ing.catalogItemId,
          name: ing.catalogItemName,
          required: Math.round(required * 10000) / 10000,
          available,
          sufficient,
          shortage: sufficient ? 0 : Math.round((required - available) * 10000) / 10000,
          optional: ing.optional,
          unit: ing.unit,
        });
      }

      const maxProducible = ingredientDetails
        .filter(i => !i.optional)
        .reduce((min, i) => {
          const perUnit = i.required / Number(quantity || 1);
          return perUnit > 0 ? Math.min(min, Math.floor(i.available / perUnit)) : min;
        }, Infinity);

      details.push({
        catalogItemId,
        catalogItemName: recipe.catalogItemName,
        hasRecipe: true,
        recipeId: recipe._id,
        recipeName: recipe.name,
        maxProducible: maxProducible === Infinity ? 0 : maxProducible,
        ingredients: ingredientDetails,
      });
    }

    return res.json({ ok: true, canFulfill, details });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al verificar stock de receta' });
  }
}
