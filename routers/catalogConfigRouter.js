import { Router } from 'express';
import { getCatalogConfig, listCatalogConfigs } from '../controllers/catalogConfigController.js';

const catalogConfigRouter = Router();

catalogConfigRouter.get('/', listCatalogConfigs);
catalogConfigRouter.get('/:businessType', getCatalogConfig);

export { catalogConfigRouter };
