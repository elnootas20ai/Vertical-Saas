import { Router } from 'express';
import {
  listBrands,
  createBrand,
  updateBrand,
  deleteBrand,
} from '../controllers/brandController.js';

const brandRouter = Router();

brandRouter.get('/:businessId', listBrands);
brandRouter.post('/:businessId', createBrand);
brandRouter.put('/:businessId/:brandId', updateBrand);
brandRouter.delete('/:businessId/:brandId', deleteBrand);

export { brandRouter };
