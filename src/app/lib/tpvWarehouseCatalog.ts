/**
 * Qué cuenta como “solo almacén” frente a carta vendible en TPV/combos.
 * Fuente de verdad: shared/catalog/tpvWarehouseCatalog.js (también API view=tpv).
 */

export {
  WAREHOUSE_ONLY_STOCK_CATEGORIES,
  collectComboReferencedProductIds,
  isSellableCartaCatalogSignal,
  isTpvWarehouseOnlyCatalogItem,
} from '../../../shared/catalog/tpvWarehouseCatalog.js';

export type TpvWarehouseCatalogFields = {
  _id?: string;
  module?: string;
  isStockItem?: boolean;
  stockCategory?: string;
  itemType?: string;
  category?: string;
  unitPrice?: number;
  customFields?: Record<string, unknown>;
};
