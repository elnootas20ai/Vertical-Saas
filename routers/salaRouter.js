import { Router } from 'express';
import {
  listTables,
  createTable,
  updateTable,
  bulkUpdateTables,
  removeTable,
  changeTableStatus,
  listWalls,
  createWall,
  removeWall,
  getFloorConfig,
  saveFloorConfig,
  listOrders,
  getOrder,
  createOrder,
  updateOrder,
  addComanda,
  updateComanda,
  sendComandaToKitchen,
  cancelComanda,
  updateComandaStatus,
  payOrder,
  closeOrder,
  cancelOrder,
  splitOrder,
  mergeOrders,
  listPickupOrders,
  linkClientToOrder,
} from '../controllers/salaController.js';

const salaRouter = Router();

// Tables
salaRouter.get('/tables/:userId', listTables);
salaRouter.post('/tables/:userId', createTable);
salaRouter.put('/tables/:userId/bulk', bulkUpdateTables);
salaRouter.put('/tables/:userId/:tableId', updateTable);
salaRouter.patch('/tables/:userId/:tableId/status', changeTableStatus);
salaRouter.delete('/tables/:userId/:tableId', removeTable);

// Walls
salaRouter.get('/walls/:userId', listWalls);
salaRouter.post('/walls/:userId', createWall);
salaRouter.delete('/walls/:userId/:wallId', removeWall);

// Floor config
salaRouter.get('/floor-config/:userId', getFloorConfig);
salaRouter.put('/floor-config/:userId', saveFloorConfig);

// Orders
salaRouter.get('/orders/:userId', listOrders);
salaRouter.get('/orders/:userId/:orderId', getOrder);
salaRouter.post('/orders/:userId', createOrder);
salaRouter.put('/orders/:userId/:orderId', updateOrder);
salaRouter.post('/orders/:userId/:orderId/comanda', addComanda);
salaRouter.put('/orders/:userId/:orderId/comanda/:comandaId', updateComanda);
salaRouter.post('/orders/:userId/:orderId/comanda/:comandaId/send', sendComandaToKitchen);
salaRouter.post('/orders/:userId/:orderId/comanda/:comandaId/cancel', cancelComanda);
salaRouter.patch('/orders/:userId/:orderId/comanda/:comandaId/status', updateComandaStatus);
salaRouter.post('/orders/:userId/:orderId/pay', payOrder);
salaRouter.post('/orders/:userId/:orderId/close', closeOrder);
salaRouter.post('/orders/:userId/:orderId/cancel', cancelOrder);
salaRouter.post('/orders/:userId/:orderId/split', splitOrder);
salaRouter.post('/orders/merge/:userId', mergeOrders);

// Pickup (recogida local)
salaRouter.get('/pickups/:userId', listPickupOrders);

// CRM link
salaRouter.put('/orders/:userId/:orderId/client', linkClientToOrder);

export { salaRouter };
