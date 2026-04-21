import { useState, useEffect, useCallback } from 'react';
import { useBusiness } from '../context/BusinessContext';
import {
  fetchCatalogConfig,
  invalidateCatalogConfigCache,
  type VerticalCatalogConfig,
  type CatalogFieldDef,
} from '../lib/catalogConfigApi';
import type { BusinessType } from '../lib/businessApi';

export type { VerticalCatalogConfig, CatalogFieldDef };

const FALLBACK_CONFIG: VerticalCatalogConfig = {
  itemLabel: 'Producto',
  itemLabelPlural: 'Productos',
  categories: ['general', 'servicio', 'accesorio', 'consumible', 'otros'],
  units: [
    { value: 'ud', label: 'Unidad' },
    { value: 'kg', label: 'Kilogramo' },
    { value: 'l', label: 'Litro' },
    { value: 'h', label: 'Hora' },
  ],
  fields: [],
  features: {
    allergens: false,
    stock: true,
    supplier: true,
    webStore: true,
    salesPoints: true,
  },
  customFields: [],
};

export function useVerticalCatalog() {
  const { currentBusiness } = useBusiness();
  const businessType = (currentBusiness?.businessType as BusinessType) || '';
  const [config, setConfig] = useState<VerticalCatalogConfig>(FALLBACK_CONFIG);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!businessType) {
        setConfig(FALLBACK_CONFIG);
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        const cfg = await fetchCatalogConfig(businessType);
        if (!cancelled) setConfig(cfg);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Error desconocido');
          setConfig(FALLBACK_CONFIG);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [businessType]);

  const isFieldVisible = useCallback(
    (fieldKey: string) => {
      if (!config.fields.length) return true;
      return config.fields.some((f) => f.key === fieldKey);
    },
    [config.fields],
  );

  const refresh = useCallback(() => {
    invalidateCatalogConfigCache(businessType);
    if (!businessType) return;
    setIsLoading(true);
    fetchCatalogConfig(businessType)
      .then(setConfig)
      .catch(() => setConfig(FALLBACK_CONFIG))
      .finally(() => setIsLoading(false));
  }, [businessType]);

  return {
    config,
    businessType,
    isLoading,
    error,
    isFieldVisible,
    refresh,
  };
}
