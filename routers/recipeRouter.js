import { Router } from 'express';
import {
  listRecipes,
  getRecipe,
  createRecipe,
  updateRecipe,
  deleteRecipe,
  duplicateRecipe,
  getRecipeByProduct,
  recalculateCosts,
  checkRecipeStock,
} from '../controllers/recipeController.js';
import { requireUserScope } from '../middleware/requireUserScope.js';

const recipeRouter = Router();
recipeRouter.use(requireUserScope);

recipeRouter.post('/:userId/recalculate-costs', recalculateCosts);
recipeRouter.post('/:userId/check-stock', checkRecipeStock);
recipeRouter.get('/:userId/by-product/:catalogItemId', getRecipeByProduct);
recipeRouter.post('/:userId/:recipeId/duplicate', duplicateRecipe);

recipeRouter.get('/:userId', listRecipes);
recipeRouter.get('/:userId/:recipeId', getRecipe);
recipeRouter.post('/:userId', createRecipe);
recipeRouter.put('/:userId/:recipeId', updateRecipe);
recipeRouter.delete('/:userId/:recipeId', deleteRecipe);

export { recipeRouter };
