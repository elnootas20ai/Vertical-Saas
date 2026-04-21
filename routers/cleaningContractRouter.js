import { Router } from 'express';
import {
  listCleaningContracts,
  createCleaningContract,
  updateCleaningContract,
  removeCleaningContract,
} from '../controllers/cleaningContractController.js';

const cleaningContractRouter = Router();

cleaningContractRouter.get('/:userId', listCleaningContracts);
cleaningContractRouter.post('/:userId', createCleaningContract);
cleaningContractRouter.put('/:userId/:contractId', updateCleaningContract);
cleaningContractRouter.delete('/:userId/:contractId', removeCleaningContract);

export { cleaningContractRouter };
