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
export type PrinterPdvSyncOptions = {
  /** Sync en segundo plano: no cerrar sesión si el token expiró. */
  suppressLogout?: boolean;
};

export async function savePrinterConfigToPdv(
  userId: string,
  pdv: PointOfSale,
  config: VertialPrinterConfig,
  target: PrinterConfigTarget,
  terminalId?: string,
  options?: PrinterPdvSyncOptions,
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
      const fresh = (await listPointsOfSaleRequest(userId, {
        includeInactive: true,
        suppressLogout: options?.suppressLogout,
      }))
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

  const saved = await updatePointOfSaleRequest(userId, payload as PointOfSale, {
    suppressLogout: options?.suppressLogout,
  });
  // Preferir lo que devolvió el servidor; si viniera sin IP, conservar la que acabamos de guardar.
  const fromServer = saved?.printerConfig;
  const host = String(fromServer?.networkHost || normalized.networkHost || '').trim();
  if (!host) {
    throw new Error('El servidor no conservó la IP de la impresora. Reintenta guardar.');
  }
  cachePdvPrinterConfig(saved._id, {
    ...normalized,
    ...(fromServer || {}),
    connectionType: 'network',
    networkHost: host,
    networkPort: Number(fromServer?.networkPort || normalized.networkPort || 9100) || 9100,
  });

  // Misma marca/nombre sin IP: copiar para que Badalona/Tiana duplicados no queden a ciegas.
  try {
    const nameKey = String(pdv.name || '').trim().toLowerCase();
    if (nameKey && target === 'store') {
      const all = await listPointsOfSaleRequest(userId, {
        includeInactive: false,
        suppressLogout: options?.suppressLogout,
      });
      const siblings = all.filter(
        (p) =>
          p._id !== saved._id
          && String(p.name || '').trim().toLowerCase() === nameKey
          && !String(p.printerConfig?.networkHost || '').trim(),
      );
      for (const sib of siblings) {
        try {
          const mirrored = await updatePointOfSaleRequest(
            userId,
            { _id: sib._id, printerConfig: normalized } as PointOfSale,
            { suppressLogout: options?.suppressLogout },
          );
          cachePdvPrinterConfig(mirrored._id, normalized);
        } catch {
          /* no bloquear el guardado principal */
        }
      }
    }
  } catch {
    /* ignore mirror errors */
  }

  return saved;
}
