import { Router } from 'express';
import {
  getConstructionConfig,
  listClients, createClient, updateClient, removeClient,
  getClientDetail, getClientNotes, createClientNote, getClientHistory,
  checkClientDuplicates, searchClients, quickCreateClient,
  convertLeadToClient, importFromCrmClient, linkCrmClient,
  listGuilds, createGuild, updateGuild, removeGuild,
  listProjects, createProject, updateProject, removeProject,
  listBudgets, createBudget, updateBudget, acceptBudget, registerPayment, removeBudget,
  sendBudget, rejectBudget,
  listBudgetTemplates, createBudgetTemplate, updateBudgetTemplate, removeBudgetTemplate,
  listWorkers, createWorker, updateWorker, removeWorker,
  listTasks, createTask, updateTask, removeTask,
  listDailyReports, createDailyReport, updateDailyReport, removeDailyReport,
  submitDailyReport, validateDailyReport, rejectDailyReport,
  listIncidents, createIncident, updateIncident, resolveIncident, reopenIncident, removeIncident,
  listObraDocuments, getObraDocument, createObraDocument, updateObraDocument, removeObraDocument,
  validateObraDocument, getObraDocumentStats, getObraDocumentTimeline,
  checkObraDocumentDuplicate, requestObraDocumentSignature, processObraDocumentOcr,
  getConstructionOpsCenter,
  getConstructionAlerts,
  getConstructionAlertSummaryEndpoint,
  getConstructionReports,
  listPayments, createPayment, updatePayment, removePayment,
  registerInstallment, cancelPaymentLine, linkReceipt, updatePaymentPhases,
  getPaymentsByProject, getPaymentsSummary, generatePaymentLinesFromBudgetEndpoint,
  getClockinComparison,
  listCollections, getCollection, createCollection, updateCollection, removeCollection,
  collectPayment, collectPartialPayment, getCollectionSummaryByProject, getCollectionSummaryByClient,
  getClosureSummary, closeProject, reopenProject,
  listPlanningEntries, createPlanningEntry, updatePlanningEntry, removePlanningEntry,
  confirmPlanningEntry, startPlanningEntry, completePlanningEntry, cancelPlanningEntry, duplicatePlanningEntry,
  listMilestones, createMilestone, updateMilestone, completeMilestoneEndpoint, removeMilestone,
  listMaterialNeeds, createMaterialNeed, updateMaterialNeed, removeMaterialNeed, requestMaterialNeed,
  getPlanningOverview,
  listPredefinedPartidas, getPredefinedPartidasByGremio,
  createPredefinedPartida, updatePredefinedPartida, removePredefinedPartida, bulkImportPartidas,
  applyBudgetTemplate, createTemplateFromBudget,
  getPartidaAlerts,
} from '../controllers/constructionController.js';

const constructionRouter = Router();

constructionRouter.get('/config', getConstructionConfig);

constructionRouter.get('/clients/:userId/search', searchClients);
constructionRouter.get('/clients/:userId', listClients);
constructionRouter.post('/clients/:userId/check-duplicates', checkClientDuplicates);
constructionRouter.post('/clients/:userId/quick', quickCreateClient);
constructionRouter.post('/clients/:userId/from-lead', convertLeadToClient);
constructionRouter.post('/clients/:userId/from-crm-client', importFromCrmClient);
constructionRouter.post('/clients/:userId/link-crm', linkCrmClient);
constructionRouter.post('/clients/:userId', createClient);
constructionRouter.get('/clients/:userId/:id/detail', getClientDetail);
constructionRouter.get('/clients/:userId/:id/notes', getClientNotes);
constructionRouter.post('/clients/:userId/:id/notes', createClientNote);
constructionRouter.get('/clients/:userId/:id/history', getClientHistory);
constructionRouter.put('/clients/:userId/:id', updateClient);
constructionRouter.delete('/clients/:userId/:id', removeClient);

constructionRouter.get('/guilds/:userId', listGuilds);
constructionRouter.post('/guilds/:userId', createGuild);
constructionRouter.put('/guilds/:userId/:id', updateGuild);
constructionRouter.delete('/guilds/:userId/:id', removeGuild);

constructionRouter.get('/predefined-partidas/:userId', listPredefinedPartidas);
constructionRouter.get('/predefined-partidas/:userId/by-gremio/:gremio', getPredefinedPartidasByGremio);
constructionRouter.post('/predefined-partidas/:userId', createPredefinedPartida);
constructionRouter.post('/predefined-partidas/:userId/bulk-import', bulkImportPartidas);
constructionRouter.put('/predefined-partidas/:userId/:id', updatePredefinedPartida);
constructionRouter.delete('/predefined-partidas/:userId/:id', removePredefinedPartida);

constructionRouter.get('/projects/:userId', listProjects);
constructionRouter.post('/projects/:userId', createProject);
constructionRouter.put('/projects/:userId/:id', updateProject);
constructionRouter.delete('/projects/:userId/:id', removeProject);

constructionRouter.get('/budgets/:userId', listBudgets);
constructionRouter.post('/budgets/:userId', createBudget);
constructionRouter.put('/budgets/:userId/:id', updateBudget);
constructionRouter.post('/budgets/:userId/:id/accept', acceptBudget);
constructionRouter.post('/budgets/:userId/:id/send', sendBudget);
constructionRouter.post('/budgets/:userId/:id/reject', rejectBudget);
constructionRouter.post('/budgets/:userId/:id/pay', registerPayment);
constructionRouter.delete('/budgets/:userId/:id', removeBudget);

constructionRouter.get('/budget-templates/:userId', listBudgetTemplates);
constructionRouter.post('/budget-templates/:userId', createBudgetTemplate);
constructionRouter.post('/budget-templates/:userId/:id/apply', applyBudgetTemplate);
constructionRouter.post('/budget-templates/:userId/from-budget/:budgetId', createTemplateFromBudget);
constructionRouter.put('/budget-templates/:userId/:id', updateBudgetTemplate);
constructionRouter.delete('/budget-templates/:userId/:id', removeBudgetTemplate);

constructionRouter.get('/partida-alerts/:userId', getPartidaAlerts);

constructionRouter.get('/workers/:userId', listWorkers);
constructionRouter.post('/workers/:userId', createWorker);
constructionRouter.put('/workers/:userId/:id', updateWorker);
constructionRouter.delete('/workers/:userId/:id', removeWorker);

constructionRouter.get('/tasks/:userId', listTasks);
constructionRouter.post('/tasks/:userId', createTask);
constructionRouter.put('/tasks/:userId/:id', updateTask);
constructionRouter.delete('/tasks/:userId/:id', removeTask);

constructionRouter.get('/daily-reports/:userId', listDailyReports);
constructionRouter.post('/daily-reports/:userId', createDailyReport);
constructionRouter.put('/daily-reports/:userId/:id', updateDailyReport);
constructionRouter.delete('/daily-reports/:userId/:id', removeDailyReport);
constructionRouter.post('/daily-reports/:userId/:id/submit', submitDailyReport);
constructionRouter.post('/daily-reports/:userId/:id/validate', validateDailyReport);
constructionRouter.post('/daily-reports/:userId/:id/reject', rejectDailyReport);

constructionRouter.get('/incidents/:userId', listIncidents);
constructionRouter.post('/incidents/:userId', createIncident);
constructionRouter.put('/incidents/:userId/:id', updateIncident);
constructionRouter.post('/incidents/:userId/:id/resolve', resolveIncident);
constructionRouter.post('/incidents/:userId/:id/reopen', reopenIncident);
constructionRouter.delete('/incidents/:userId/:id', removeIncident);

constructionRouter.get('/obra-documents/:userId', listObraDocuments);
constructionRouter.get('/obra-documents/:userId/stats', getObraDocumentStats);
constructionRouter.get('/obra-documents/:userId/timeline/:projectId', getObraDocumentTimeline);
constructionRouter.post('/obra-documents/:userId/check-duplicate', checkObraDocumentDuplicate);
constructionRouter.get('/obra-documents/:userId/:id', getObraDocument);
constructionRouter.post('/obra-documents/:userId', createObraDocument);
constructionRouter.put('/obra-documents/:userId/:id', updateObraDocument);
constructionRouter.delete('/obra-documents/:userId/:id', removeObraDocument);
constructionRouter.post('/obra-documents/:userId/:id/validate', validateObraDocument);
constructionRouter.post('/obra-documents/:userId/:id/request-signature', requestObraDocumentSignature);
constructionRouter.post('/obra-documents/:userId/:id/ocr', processObraDocumentOcr);

constructionRouter.get('/payments/:userId/summary', getPaymentsSummary);
constructionRouter.get('/payments/:userId/by-project/:projectId', getPaymentsByProject);
constructionRouter.get('/payments/:userId', listPayments);
constructionRouter.post('/payments/:userId', createPayment);
constructionRouter.put('/payments/:userId/:id', updatePayment);
constructionRouter.delete('/payments/:userId/:id', removePayment);
constructionRouter.post('/payments/:userId/:id/pay', registerInstallment);
constructionRouter.post('/payments/:userId/:id/cancel', cancelPaymentLine);
constructionRouter.put('/payments/:userId/:id/phases', updatePaymentPhases);
constructionRouter.post('/payments/:userId/:id/installments/:installmentId/receipt', linkReceipt);
constructionRouter.post('/payments/:userId/generate-from-budget/:budgetId', generatePaymentLinesFromBudgetEndpoint);

constructionRouter.get('/collections/:userId/summary/by-project', getCollectionSummaryByProject);
constructionRouter.get('/collections/:userId/summary/by-client', getCollectionSummaryByClient);
constructionRouter.get('/collections/:userId/:id', getCollection);
constructionRouter.get('/collections/:userId', listCollections);
constructionRouter.post('/collections/:userId', createCollection);
constructionRouter.put('/collections/:userId/:id', updateCollection);
constructionRouter.delete('/collections/:userId/:id', removeCollection);
constructionRouter.post('/collections/:userId/:id/collect', collectPayment);
constructionRouter.post('/collections/:userId/:id/partial', collectPartialPayment);

constructionRouter.get('/ops-center/:userId', getConstructionOpsCenter);
constructionRouter.get('/reports/:userId', getConstructionReports);
constructionRouter.get('/alerts/:userId', getConstructionAlerts);
constructionRouter.get('/alerts/:userId/summary', getConstructionAlertSummaryEndpoint);
constructionRouter.get('/clockin-comparison/:userId', getClockinComparison);

constructionRouter.get('/projects/:userId/:id/closure-summary', getClosureSummary);
constructionRouter.post('/projects/:userId/:id/close', closeProject);
constructionRouter.post('/projects/:userId/:id/reopen', reopenProject);

constructionRouter.get('/planning/:userId', listPlanningEntries);
constructionRouter.post('/planning/:userId', createPlanningEntry);
constructionRouter.put('/planning/:userId/:id', updatePlanningEntry);
constructionRouter.delete('/planning/:userId/:id', removePlanningEntry);
constructionRouter.post('/planning/:userId/:id/confirm', confirmPlanningEntry);
constructionRouter.post('/planning/:userId/:id/start', startPlanningEntry);
constructionRouter.post('/planning/:userId/:id/complete', completePlanningEntry);
constructionRouter.post('/planning/:userId/:id/cancel', cancelPlanningEntry);
constructionRouter.post('/planning/:userId/:id/duplicate', duplicatePlanningEntry);

constructionRouter.get('/milestones/:userId', listMilestones);
constructionRouter.post('/milestones/:userId', createMilestone);
constructionRouter.put('/milestones/:userId/:id', updateMilestone);
constructionRouter.post('/milestones/:userId/:id/complete', completeMilestoneEndpoint);
constructionRouter.delete('/milestones/:userId/:id', removeMilestone);

constructionRouter.get('/material-needs/:userId', listMaterialNeeds);
constructionRouter.post('/material-needs/:userId', createMaterialNeed);
constructionRouter.put('/material-needs/:userId/:id', updateMaterialNeed);
constructionRouter.delete('/material-needs/:userId/:id', removeMaterialNeed);
constructionRouter.post('/material-needs/:userId/:id/request', requestMaterialNeed);

constructionRouter.get('/planning-overview/:userId', getPlanningOverview);

export { constructionRouter };
