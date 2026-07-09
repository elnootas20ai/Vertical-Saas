import {
  listPointsOfSaleRequest,
  updatePointOfSaleRequest,
  type PointOfSale,
} from '../deliveryApi';
import type { VertialPrinterConfig } from './printerConfig';
import { cachePdvPrinterConfig } from './printerConfig';
import {
  normalizeVertialPrinterConfig,
  printerLabelFromConfig,
} from './printerConfigNormalize';

export type PrinterConfigTarget = 'store' | 'terminal';

/**
 * Guarda la impresora en el PDV enviando SOLO los campos que cambian.
 * Enviar el documento completo rompía el guardado cuando el PDV venía de una
 * caché local incompleta (sin terminales/dirección): el backend lo rechazaba
 * con «No puedes dejar el PDV sin terminales» aunque la tienda estaba bien.
 * El backend hace `{ ...existing, ...payload }`, así que el parche parcial es seguro.
 */
export async function savePrinterConfigToPdv(
  userId: string,
  pdv: PointOfSale,
  config: VertialPrinterConfig,
  target: PrinterConfigTarget,
  terminalId?: string,
): Promise<PointOfSale> {
  const normalized = normalizeVertialPrinterConfig(config);
  const label = printerLabelFromConfig(normalized);

  let payload: Partial<PointOfSale> & { _id: string };

  if (target === 'terminal' && terminalId) {
    // Para tocar un terminal hay que reenviar el array completo: usar SIEMPRE
    // los terminales frescos del servidor, nunca los de una caché local.
    let baseTerminals = Array.isArray(pdv.terminals) ? pdv.terminals : [];
    const looksIncomplete =
      baseTerminals.length === 0
      || !baseTerminals.some((t) => String(t?.code || '').trim() && String(t?.name || '').trim());
    if (looksIncomplete) {
      const fresh = (await listPointsOfSaleRequest(userId, { includeInactive: true }))
        .find((p) => p._id === pdv._id);
      if (fresh && Array.isArray(fresh.terminals) && fresh.terminals.length > 0) {
        baseTerminals = fresh.terminals;
      }
    }
    if (baseTerminals.length === 0) {
      throw new Error('No se pudieron cargar los TPV de la tienda. Recarga e inténtalo de nuevo.');
    }
    payload = {
      _id: pdv._id,
      terminals: baseTerminals.map((t) => (
        t.id === terminalId
          ? { ...t, printerConfig: normalized, printerName: label || t.printerName }
          : t
      )),
    };
  } else {
    payload = { _id: pdv._id, printerConfig: normalized };
  }

  const saved = await updatePointOfSaleRequest(userId, payload as PointOfSale);
  cachePdvPrinterConfig(saved._id, normalized);
  return saved;
}
