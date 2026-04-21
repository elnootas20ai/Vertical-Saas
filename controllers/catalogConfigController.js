import { getVerticalCatalogConfig, getAllVerticalCatalogConfigs } from '../models/verticalCatalog.js';

/**
 * GET /api/catalog-config/:businessType
 * Devuelve la configuración de catálogo para la vertical indicada.
 */
export async function getCatalogConfig(req, res) {
  try {
    const { businessType } = req.params;
    const config = getVerticalCatalogConfig(businessType);
    return res.json({ ok: true, businessType: businessType || 'default', config });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al obtener configuración de catálogo' });
  }
}

/**
 * GET /api/catalog-config
 * Devuelve todas las configuraciones indexadas por businessType.
 */
export async function listCatalogConfigs(_req, res) {
  try {
    const configs = getAllVerticalCatalogConfigs();
    return res.json({ ok: true, configs });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al listar configuraciones de catálogo' });
  }
}
