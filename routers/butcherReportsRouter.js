import { Router } from 'express';
import {
  getButcherReportKpis,
  getButcherVentasTrabajador,
  getButcherTopProductos,
  getButcherEvolucion,
  getButcherCategorias,
  getButcherTiendas,
} from '../controllers/butcherReportsController.js';

const butcherReportsRouter = Router();

butcherReportsRouter.get('/:userId/kpis', getButcherReportKpis);
butcherReportsRouter.get('/:userId/ventas-trabajador', getButcherVentasTrabajador);
butcherReportsRouter.get('/:userId/top-productos', getButcherTopProductos);
butcherReportsRouter.get('/:userId/evolucion', getButcherEvolucion);
butcherReportsRouter.get('/:userId/categorias', getButcherCategorias);
butcherReportsRouter.get('/:userId/tiendas', getButcherTiendas);

export { butcherReportsRouter };
