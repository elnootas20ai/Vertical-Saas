import { Router } from 'express';
import {
  listClients, createClient, updateClient, removeClient,
  checkClientDuplicates, getClientCLV,
  bulkCreateClients, mergeClient,
  importClientsFromBusiness,
  getClientDetail,
  getClientInvoices,
  updateClientContacts,
  listClientNotes, createClientNote, updateClientNote, removeClientNote,
  listClientPromotions, createClientPromotion, updateClientPromotion, removeClientPromotion,
  getClientActivity,
  searchByPhone,
} from '../controllers/clientsController.js';
import { generateClientPortalToken } from '../controllers/portalController.js';

const clientsRouter = Router();

// Base CRUD
clientsRouter.get('/:userId', listClients);
clientsRouter.get('/:userId/search-by-phone', searchByPhone);
clientsRouter.post('/:userId', createClient);
clientsRouter.post('/:userId/bulk', bulkCreateClients);
clientsRouter.post('/:userId/import-from-business', importClientsFromBusiness);
clientsRouter.post('/:userId/check-duplicates', checkClientDuplicates);
clientsRouter.post('/:userId/merge', mergeClient);

// Client detail with summary
clientsRouter.get('/:userId/:clientId', getClientDetail);
clientsRouter.put('/:userId/:clientId', updateClient);
clientsRouter.delete('/:userId/:clientId', removeClient);

// CLV
clientsRouter.get('/:userId/:clientId/clv', getClientCLV);

// Portal
clientsRouter.post('/:userId/:clientId/portal-token', generateClientPortalToken);

// Invoices per client
clientsRouter.get('/:userId/:clientId/invoices', getClientInvoices);

// Contacts (embedded in client doc)
clientsRouter.put('/:userId/:clientId/contacts', updateClientContacts);

// Notes
clientsRouter.get('/:userId/:clientId/notes', listClientNotes);
clientsRouter.post('/:userId/:clientId/notes', createClientNote);
clientsRouter.put('/:userId/:clientId/notes/:noteId', updateClientNote);
clientsRouter.delete('/:userId/:clientId/notes/:noteId', removeClientNote);

// Promotions
clientsRouter.get('/:userId/:clientId/promotions', listClientPromotions);
clientsRouter.post('/:userId/:clientId/promotions', createClientPromotion);
clientsRouter.put('/:userId/:clientId/promotions/:promotionId', updateClientPromotion);
clientsRouter.delete('/:userId/:clientId/promotions/:promotionId', removeClientPromotion);

// Activity
clientsRouter.get('/:userId/:clientId/activity', getClientActivity);

export { clientsRouter };
