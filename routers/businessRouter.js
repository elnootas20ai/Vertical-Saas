import { Router } from 'express';
import {
  addMember,
  createBusiness,
  deleteBusiness,
  getBusiness,
  listBusinesses,
  removeMember,
  updateBusiness,
  updateMember,
} from '../controllers/businessController.js';

const businessRouter = Router();

// List businesses for a user
businessRouter.get('/user/:userId', listBusinesses);

// Get single business
businessRouter.get('/:businessId', getBusiness);

// Create business for a user
businessRouter.post('/user/:userId', createBusiness);

// Update business
businessRouter.put('/:businessId', updateBusiness);

// Delete business
businessRouter.delete('/:businessId', deleteBusiness);

// Member management
businessRouter.post('/:businessId/members', addMember);
businessRouter.put('/:businessId/members/:memberId', updateMember);
businessRouter.delete('/:businessId/members/:memberId', removeMember);

export { businessRouter };
