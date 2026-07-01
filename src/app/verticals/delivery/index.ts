/**
 * API pública del módulo Delivery.
 *
 * Regla: código fuera de delivery que necesite comprobar rutas o tipo delivery
 * debe importar desde aquí, NO desde páginas/lib sueltas.
 *
 * Código nuevo de delivery debe vivir en src/app/verticals/delivery/** y exportarse aquí.
 */

export {
  DELIVERY_MODULE,
  isDeliveryModuleRoute,
} from './module';

export { isDeliveryBusinessType } from '../../lib/deliverySetup';
