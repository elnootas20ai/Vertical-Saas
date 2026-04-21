import { Router } from 'express';
import {
  listAssignmentRules,
  createAssignmentRule,
  updateAssignmentRule,
  deleteAssignmentRule,
  getSlaConfig,
  saveSlaConfig,
} from '../controllers/leadAssignmentController.js';

const leadAssignmentRouter = Router();

// C-08: Reglas de reasignación
leadAssignmentRouter.get('/:userId/rules', listAssignmentRules);
leadAssignmentRouter.post('/:userId/rules', createAssignmentRule);
leadAssignmentRouter.put('/:userId/rules/:ruleId', updateAssignmentRule);
leadAssignmentRouter.delete('/:userId/rules/:ruleId', deleteAssignmentRule);

// C-09: Configuración SLA
leadAssignmentRouter.get('/:userId/sla', getSlaConfig);
leadAssignmentRouter.post('/:userId/sla', saveSlaConfig);

export { leadAssignmentRouter };
