import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { CatalogItem } from '../lib/deliveryApi';
import type { Brand } from '../lib/brandsApi';
import { DELIVERY_CATALOG_CHANGED } from '../lib/deliverySetup';
import {
  fetchTpvCatalog,
  readTpvCatalogCache,
  tpvCatalogSnapshotNeedsBrandRefetch,
} from '../lib/tpvCatalogCache';

const REVALIDATE_MS = 60_000;

export function useTpvCatalog(userId: string | undefined, businessId: string) {
  const initial = userId ? readTpvCatalogCache(userId, businessId) : null;

  const [catalog, setCatalog] = useState<CatalogItem[]>(() => initial?.items ?? []);
  const [brands, setBrands] = useState<Brand[]>(() => initial?.brands ?? []);
  const [loadingCatalog, setLoadingCatalog] = useState(() => Boolean(userId && !initial));

  const reloadCatalog = useCallback(
    (options?: { force?: boolean; silent?: boolean }) => {
      if (!userId) return Promise.resolve();
      const showSpinner = !options?.silent && catalog.length === 0;
      if (showSpinner) setLoadingCatalog(true);
      return fetchTpvCatalog(userId, businessId, { force: options?.force })
        .then((snapshot) => {
          setCatalog(snapshot.items);
          setBrands(snapshot.brands);
        })
        .catch(() => {
          if (!options?.silent && catalog.length === 0) {
            toast.error('Error al cargar el catálogo');
          }
        })
        .finally(() => {
          if (showSpinner) setLoadingCatalog(false);
        });
    },
    [userId, businessId, catalog.length],
  );

  useEffect(() => {
    if (!userId) {
      setCatalog([]);
      setBrands([]);
      setLoadingCatalog(false);
      return;
    }

    let cancelled = false;
    const cached = readTpvCatalogCache(userId, businessId);

    if (cached) {
      setCatalog(cached.items);
      setBrands(cached.brands);
      setLoadingCatalog(false);
    } else {
      setLoadingCatalog(true);
    }

    const needsNetwork =
      !cached
      || Date.now() - (cached?.fetchedAt ?? 0) > REVALIDATE_MS
      || (cached != null && tpvCatalogSnapshotNeedsBrandRefetch(cached));

    if (!needsNetwork) {
      return () => {
        cancelled = true;
      };
    }

    void fetchTpvCatalog(userId, businessId)
      .then((snapshot) => {
        if (cancelled) return;
        setCatalog(snapshot.items);
        setBrands(snapshot.brands);
      })
      .catch(() => {
        if (!cancelled && !cached) {
          toast.error('Error al cargar el catálogo');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingCatalog(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId, businessId]);

  useEffect(() => {
    if (!userId || typeof window === 'undefined') return;
    const onCatalogChanged = () => {
      void reloadCatalog({ force: true, silent: true });
    };
    window.addEventListener(DELIVERY_CATALOG_CHANGED, onCatalogChanged);
    return () => window.removeEventListener(DELIVERY_CATALOG_CHANGED, onCatalogChanged);
  }, [userId, reloadCatalog]);

  return { catalog, brands, loadingCatalog, reloadCatalog };
}
