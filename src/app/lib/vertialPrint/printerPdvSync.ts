import {
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

export async function savePrinterConfigToPdv(
  userId: string,
  pdv: PointOfSale,
  config: VertialPrinterConfig,
  target: PrinterConfigTarget,
  terminalId?: string,
): Promise<PointOfSale> {
  const normalized = normalizeVertialPrinterConfig(config);
  const label = printerLabelFromConfig(normalized);

  let next: PointOfSale;
  if (target === 'terminal' && terminalId) {
    next = {
      ...pdv,
      terminals: pdv.terminals.map((t) => (
        t.id === terminalId
          ? { ...t, printerConfig: normalized, printerName: label || t.printerName }
          : t
      )),
    };
  } else {
    next = { ...pdv, printerConfig: normalized };
  }

  const saved = await updatePointOfSaleRequest(userId, next);
  cachePdvPrinterConfig(saved._id, normalized);
  return saved;
}
