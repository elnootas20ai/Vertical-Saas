import type { DeliveryActivationFlags, DeliveryActivationStepDef } from '../../lib/deliveryActivationChecklist';
import { buildDeliveryActivationStepDefs } from '../../lib/deliveryActivationChecklist';

const HELADERIA_TPV_PATH = '/saas/vertical/heladeria/tpv';

/**
 * Misma checklist retail que Delivery, con copy/ruta TPV de heladería.
 * No importa pantallas Delivery — solo defs compartidas del core.
 */
export function buildHeladeriaActivationStepDefs(
  flags: DeliveryActivationFlags,
): DeliveryActivationStepDef[] {
  return buildDeliveryActivationStepDefs(flags).map((step) => {
    if (step.id === 'delivery_store') {
      return {
        ...step,
        label: 'Local y PDV',
        description: 'Crea la heladería; la caja TPV y el código tablet se preparan solos',
        subSteps: [
          { id: 'retail_store', label: 'Primera heladería creada', completed: flags.hasActiveRetailStore },
          { id: 'pdv_active', label: 'PDV de caja activo', completed: flags.hasActivePdv },
        ],
      };
    }
    if (step.id === 'delivery_brand') {
      return {
        ...step,
        label: 'Marca / carta',
        description: 'Nombre visible, categorías (sabores, tarrinas…) y locales',
      };
    }
    if (step.id === 'delivery_catalog') {
      return {
        ...step,
        label: 'Catálogo',
        description: 'Importa Excel heladería o añade productos con precio',
      };
    }
    if (step.id === 'delivery_operate') {
      return {
        ...step,
        description: 'Horario en el local y acceso al TPV Heladería',
        route: HELADERIA_TPV_PATH,
        subSteps: [
          { id: 'business_hours', label: 'Horario de apertura', completed: flags.hasBusinessHours },
          {
            id: 'tpv_ready',
            label: 'Local, marca y catálogo listos',
            completed:
              flags.hasActivePdv &&
              flags.brandSetupComplete &&
              flags.hasPricedProduct,
          },
        ],
      };
    }
    return step;
  });
}
