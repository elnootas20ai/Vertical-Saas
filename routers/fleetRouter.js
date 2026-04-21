import { Router } from 'express';
import {
  listFleetVehicles,
  createFleetVehicle,
  getFleetVehicle,
  updateFleetVehicle,
  removeFleetVehicle,
  assignFleetVehicle,
  unassignFleetVehicle,
  addFleetCost,
  updateFleetCost,
  deleteFleetCost,
  addFleetDocument,
  updateFleetDocument,
  deleteFleetDocument,
  getFleetAlerts,
  updateFleetAlertSettings,
  getFleetSummary,
} from '../controllers/fleetController.js';

const fleetRouter = Router();

// Resumen / KPIs
fleetRouter.get('/:userId/summary', getFleetSummary);

// Alertas globales de flota
fleetRouter.get('/:userId/alerts', getFleetAlerts);

// CRUD vehículos de flota
fleetRouter.get('/:userId', listFleetVehicles);
fleetRouter.post('/:userId', createFleetVehicle);
fleetRouter.get('/:userId/:vehicleId', getFleetVehicle);
fleetRouter.put('/:userId/:vehicleId', updateFleetVehicle);
fleetRouter.delete('/:userId/:vehicleId', removeFleetVehicle);

// Asignación a miembros del equipo
fleetRouter.post('/:userId/:vehicleId/assign', assignFleetVehicle);
fleetRouter.delete('/:userId/:vehicleId/assign', unassignFleetVehicle);

// Costes (combustible, mantenimiento, reparaciones, seguros, otros)
fleetRouter.post('/:userId/:vehicleId/costs', addFleetCost);
fleetRouter.put('/:userId/:vehicleId/costs/:costId', updateFleetCost);
fleetRouter.delete('/:userId/:vehicleId/costs/:costId', deleteFleetCost);

// Documentos (permiso circulación, seguro, ficha técnica, partes/incidencias)
fleetRouter.post('/:userId/:vehicleId/documents', addFleetDocument);
fleetRouter.put('/:userId/:vehicleId/documents/:documentId', updateFleetDocument);
fleetRouter.delete('/:userId/:vehicleId/documents/:documentId', deleteFleetDocument);

// Configuración de alertas por vehículo
fleetRouter.put('/:userId/:vehicleId/alerts', updateFleetAlertSettings);

export { fleetRouter };
