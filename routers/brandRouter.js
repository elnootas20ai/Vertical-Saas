import { Router } from 'express';
import {
  listBrands,
  createBrand,
  updateBrand,
  deleteBrand,
  getBrandBillingConfig,
  putBrandBillingConfig,
} from '../controllers/brandController.js';
import { requireBusinessAccess } from '../middleware/requireBusinessAccess.js';

const brandRouter = Router();
brandRouter.use(requireBusinessAccess);

brandRouter.get('/:businessId/billing-config', getBrandBillingConfig);
brandRouter.put('/:businessId/billing-config', putBrandBillingConfig);
brandRouter.get('/:businessId', listBrands);
brandRouter.post('/:businessId', createBrand);
brandRouter.put('/:businessId/:brandId', updateBrand);
brandRouter.delete('/:businessId/:brandId', deleteBrand);

export { brandRouter };
