import { Router } from 'express';
import multer from 'multer';
import {
  getCleaningHubKpis,
  listCleaningServices,
  createCleaningService,
  updateCleaningService,
  removeCleaningService,
  checkInService,
  checkOutService,
  pauseService,
  resumeService,
  reportServiceIncident,
  resolveServiceIncident,
  addServicePhoto,
  getServicePhotoFile,
  validateExecution,
  getExecutionSummary,
  listCleaningRoutes,
  createCleaningRoute,
  updateCleaningRoute,
  reorderCleaningRoute,
  reassignCleaningRoute,
  removeCleaningRoute,
  generateCleaningRoutes,
  listCleaningIncidents,
  createCleaningIncident,
  updateCleaningIncident,
  removeCleaningIncident,
  listCleaningWorkers,
  getCleaningWorker,
  createCleaningWorker,
  updateCleaningWorker,
  removeCleaningWorker,
  assignWorkerToService,
  listWorkerServices,
  listServiceContracts,
  getServiceContract,
  createServiceContract,
  updateServiceContract,
  removeServiceContract,
  activateServiceContract,
  pauseServiceContract,
  cancelServiceContract,
  renewServiceContract,
  getServiceContractStats,
  generateContractServices,
  generateAllContractsServices,
  getCleaningProductivity,
  getWorkerStats,
} from '../controllers/cleaningController.js';
import {
  getCleaningOverview,
  getClientProfitability,
  getWorkerProfitability,
  getServicesSummary,
  getAbsenteeismReport,
  getIncidentsSummary,
  getMaterialsCostReport,
  getBillingReport,
  getComparativesReport,
} from '../controllers/cleaningReportsController.js';

const photoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const cleaningRouter = Router();

cleaningRouter.get('/hub/kpis/:userId', getCleaningHubKpis);

cleaningRouter.get('/services/:userId', listCleaningServices);
cleaningRouter.post('/services/:userId', createCleaningService);
cleaningRouter.get('/services/:userId/execution-summary', getExecutionSummary);
cleaningRouter.put('/services/:userId/:serviceId', updateCleaningService);
cleaningRouter.delete('/services/:userId/:serviceId', removeCleaningService);
cleaningRouter.post('/services/:userId/:serviceId/check-in', checkInService);
cleaningRouter.post('/services/:userId/:serviceId/check-out', checkOutService);
cleaningRouter.post('/services/:userId/:serviceId/pause', pauseService);
cleaningRouter.post('/services/:userId/:serviceId/resume', resumeService);
cleaningRouter.post('/services/:userId/:serviceId/incident', reportServiceIncident);
cleaningRouter.put('/services/:userId/:serviceId/incident/:incidentId', resolveServiceIncident);
cleaningRouter.post('/services/:userId/:serviceId/photo', photoUpload.single('file'), addServicePhoto);
cleaningRouter.get('/services/:userId/:serviceId/photo-file/:filename', getServicePhotoFile);
cleaningRouter.put('/services/:userId/:serviceId/validate', validateExecution);

cleaningRouter.get('/routes/:userId', listCleaningRoutes);
cleaningRouter.post('/routes/:userId', createCleaningRoute);
cleaningRouter.post('/routes/:userId/generate', generateCleaningRoutes);
cleaningRouter.put('/routes/:userId/:routeId', updateCleaningRoute);
cleaningRouter.patch('/routes/:userId/:routeId/reorder', reorderCleaningRoute);
cleaningRouter.patch('/routes/:userId/:routeId/reassign', reassignCleaningRoute);
cleaningRouter.delete('/routes/:userId/:routeId', removeCleaningRoute);

cleaningRouter.get('/incidents/:userId', listCleaningIncidents);
cleaningRouter.post('/incidents/:userId', createCleaningIncident);
cleaningRouter.put('/incidents/:userId/:incidentId', updateCleaningIncident);
cleaningRouter.delete('/incidents/:userId/:incidentId', removeCleaningIncident);

cleaningRouter.get('/workers/:userId', listCleaningWorkers);
cleaningRouter.post('/workers/:userId', createCleaningWorker);
cleaningRouter.get('/workers/:userId/:workerId', getCleaningWorker);
cleaningRouter.put('/workers/:userId/:workerId', updateCleaningWorker);
cleaningRouter.delete('/workers/:userId/:workerId', removeCleaningWorker);
cleaningRouter.patch('/services/:userId/:serviceId/assign', assignWorkerToService);
cleaningRouter.get('/workers/:userId/:workerId/services', listWorkerServices);
cleaningRouter.get('/workers/:userId/:workerId/stats', getWorkerStats);
cleaningRouter.get('/workers/:userId/productivity', getCleaningProductivity);

cleaningRouter.get('/contracts/:userId', listServiceContracts);
cleaningRouter.get('/contracts/:userId/stats', getServiceContractStats);
cleaningRouter.get('/contracts/:userId/:contractId', getServiceContract);
cleaningRouter.post('/contracts/:userId', createServiceContract);
cleaningRouter.put('/contracts/:userId/:contractId', updateServiceContract);
cleaningRouter.delete('/contracts/:userId/:contractId', removeServiceContract);
cleaningRouter.post('/contracts/:userId/:contractId/activate', activateServiceContract);
cleaningRouter.post('/contracts/:userId/:contractId/pause', pauseServiceContract);
cleaningRouter.post('/contracts/:userId/:contractId/cancel', cancelServiceContract);
cleaningRouter.post('/contracts/:userId/:contractId/renew', renewServiceContract);
cleaningRouter.post('/contracts/:userId/:contractId/generate', generateContractServices);
cleaningRouter.post('/contracts/:userId/generate-all', generateAllContractsServices);

cleaningRouter.get('/reports/:userId/overview', getCleaningOverview);
cleaningRouter.get('/reports/:userId/profitability/clients', getClientProfitability);
cleaningRouter.get('/reports/:userId/profitability/workers', getWorkerProfitability);
cleaningRouter.get('/reports/:userId/services-summary', getServicesSummary);
cleaningRouter.get('/reports/:userId/absenteeism', getAbsenteeismReport);
cleaningRouter.get('/reports/:userId/incidents-summary', getIncidentsSummary);
cleaningRouter.get('/reports/:userId/materials-cost', getMaterialsCostReport);
cleaningRouter.get('/reports/:userId/billing', getBillingReport);
cleaningRouter.get('/reports/:userId/comparatives', getComparativesReport);

export { cleaningRouter };
