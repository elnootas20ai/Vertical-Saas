import { Router } from 'express';
import {
  createGroup,
  listGroups,
  getGroup,
  updateGroup,
  deleteGroup,
  addBusinessToGroup,
  removeBusinessFromGroup,
  addGroupAdmin,
  removeGroupAdmin,
  addBranch,
  updateBranch,
  deleteBranch,
  getGroupKpis,
} from '../controllers/groupController.js';

const groupRouter = Router();

// ─── Groups CRUD ───────────────────────────────────────────────────────────────
groupRouter.get('/user/:userId', listGroups);
groupRouter.get('/:groupId', getGroup);
groupRouter.post('/user/:userId', createGroup);
groupRouter.put('/:groupId', updateGroup);
groupRouter.delete('/:groupId', deleteGroup);

// ─── Group KPIs consolidados ────────────────────────────────────────────────
groupRouter.get('/:groupId/kpis', getGroupKpis);

// ─── Businesses en el grupo ────────────────────────────────────────────────
groupRouter.post('/:groupId/businesses', addBusinessToGroup);
groupRouter.delete('/:groupId/businesses/:businessId', removeBusinessFromGroup);

// ─── Admins del grupo ──────────────────────────────────────────────────────
groupRouter.post('/:groupId/admins', addGroupAdmin);
groupRouter.delete('/:groupId/admins/:adminId', removeGroupAdmin);

// ─── Sedes (Branches) dentro de una empresa ─────────────────────────────────
groupRouter.post('/businesses/:businessId/branches', addBranch);
groupRouter.put('/businesses/:businessId/branches/:branchId', updateBranch);
groupRouter.delete('/businesses/:businessId/branches/:branchId', deleteBranch);

export { groupRouter };
