import type { DeliveryInformeId } from '../deliveryInformesCatalog';
import type { InformeBuildResult, InformeLoadCtx } from './informeTypes';
import { loadFinanzasInforme } from './loadFinanzasInformes';
import { loadNegocioInforme } from './loadNegocioInformes';
import { loadStockInforme } from './loadStockInformes';
import { loadEquipoInforme } from './loadEquipoInformes';
import { loadFacturacionInforme } from './loadFacturacionInformes';
import { loadClientesInforme } from './loadClientesInformes';

/**
 * Carga un informe del catálogo delivery usando APIs del SaaS.
 * Solo se llama al abrir el informe (lazy).
 */
export async function loadDeliveryInforme(
  id: DeliveryInformeId,
  ctx: InformeLoadCtx,
): Promise<InformeBuildResult> {
  const loaders = [
    loadClientesInforme,
    loadFinanzasInforme,
    loadNegocioInforme,
    loadStockInforme,
    loadEquipoInforme,
    loadFacturacionInforme,
  ];

  for (const load of loaders) {
    try {
      const result = await load(id, ctx);
      if (result) return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al generar informe';
      return {
        rows: [],
        summary: `No se pudo completar «${id}»: ${msg}`,
      };
    }
  }

  return {
    rows: [],
    summary: 'Este informe aún no tiene cargador. Avísame y lo conectamos.',
  };
}
