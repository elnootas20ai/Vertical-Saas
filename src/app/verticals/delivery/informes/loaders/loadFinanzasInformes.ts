import type { DeliveryInformeId } from '../deliveryInformesCatalog';
import type { InformeBuildResult, InformeLoadCtx } from './informeTypes';
import { unavailableResult } from './informeTypes';
import { buildIngresosInforme } from './buildIngresosInforme';
import { buildGastosInforme } from './buildGastosInforme';
import { buildMargenInforme } from './buildMargenInforme';
import { buildFlujoCajaInforme } from './buildFlujoCajaInforme';
import {
  buildCuentaResultadosInforme,
  buildResultadoYtdInforme,
} from './buildPnLInformes';
import { buildRentabilidadCentroInforme } from './buildRentabilidadCentroInforme';
import { buildEbitdaInforme } from './buildEbitdaInforme';
import { buildCajaDiferenciasInforme } from './buildCajaDiferenciasInforme';

/**
 * Cargadores elaborados de la fila Finanzas (dashboard + export).
 */
export async function loadFinanzasInforme(
  id: DeliveryInformeId,
  ctx: InformeLoadCtx,
): Promise<InformeBuildResult | null> {
  if (!id.startsWith('finanzas-')) return null;

  switch (id) {
    case 'finanzas-ingresos':
      return buildIngresosInforme(id, ctx);
    case 'finanzas-gastos':
      return buildGastosInforme(id, ctx);
    case 'finanzas-margen':
      return buildMargenInforme(id, ctx);
    case 'finanzas-flujo-caja':
      return buildFlujoCajaInforme(id, ctx);
    case 'finanzas-cuenta-resultados':
      return buildCuentaResultadosInforme(id, ctx);
    case 'finanzas-resultado-ytd':
      return buildResultadoYtdInforme(id, ctx);
    case 'finanzas-presupuesto-vs-real':
      return unavailableResult(
        'Presupuesto vs real no está activo: no hay presupuestos cargados en este negocio.',
      );
    case 'finanzas-rentabilidad-centro':
      return buildRentabilidadCentroInforme(id, ctx);
    case 'finanzas-ebitda':
      return buildEbitdaInforme(id, ctx);
    case 'finanzas-caja':
      return buildCajaDiferenciasInforme(id, ctx);
    default:
      return null;
  }
}
