import { Router } from 'express';
import {
  getDeliveryCrmDashboard,
  listDeliveryCrmClients,
  getClientDeliveryHistory,
  listCampaigns,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  getDeliveryCrmAlerts,
} from '../controllers/deliveryCrmController.js';

const deliveryCrmRouter = Router();

deliveryCrmRouter.get('/dashboard/:userId', getDeliveryCrmDashboard);
deliveryCrmRouter.get('/clients/:userId', listDeliveryCrmClients);
deliveryCrmRouter.get('/clients/:userId/:clientId/orders', getClientDeliveryHistory);
deliveryCrmRouter.get('/alerts/:userId', getDeliveryCrmAlerts);

deliveryCrmRouter.get('/campaigns/:userId', listCampaigns);
deliveryCrmRouter.post('/campaigns/:userId', createCampaign);
deliveryCrmRouter.put('/campaigns/:userId/:campaignId', updateCampaign);
deliveryCrmRouter.delete('/campaigns/:userId/:campaignId', deleteCampaign);

export { deliveryCrmRouter };
