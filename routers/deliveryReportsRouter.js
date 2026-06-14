import { Router } from 'express';
import {
  getDeliveryReportKpis,
  getDeliveryEvolucion,
  getDeliveryCanales,
  getDeliveryRendimiento,
  getDeliveryIncidencias,
  getDeliveryTopProductos,
  getDeliveryTiendas,
} from '../controllers/deliveryReportsController.js';

const deliveryReportsRouter = Router();

deliveryReportsRouter.get('/:userId/kpis', getDeliveryReportKpis);
deliveryReportsRouter.get('/:userId/evolucion', getDeliveryEvolucion);
deliveryReportsRouter.get('/:userId/canales', getDeliveryCanales);
deliveryReportsRouter.get('/:userId/rendimiento', getDeliveryRendimiento);
deliveryReportsRouter.get('/:userId/incidencias', getDeliveryIncidencias);
deliveryReportsRouter.get('/:userId/top-productos', getDeliveryTopProductos);
deliveryReportsRouter.get('/:userId/tiendas', getDeliveryTiendas);

export { deliveryReportsRouter };
