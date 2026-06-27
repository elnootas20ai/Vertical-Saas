import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { CatalogItem } from '../lib/deliveryApi';
import type { Brand } from '../lib/brandsApi';
import { DELIVERY_CATALOG_CHANGED, DELIVERY_BRANDS_CHANGED } from '../lib/deliverySetup';
import {
  fetchTpvCatalog,
  readTpvCatalogCache,
  tpvCatalogSnapshotNeedsBrandRefetch,
} from '../lib/tpvCatalogCache';

const REVALIDATE_MS = 60_000;

export function useTpvCatalog(
  userId: string | undefined,
  businessId: string,
  options?: { accountBusinessCount?: number },
) {
  const accountBusinessCount = options?.accountBusinessCount;
  const scopeRef = useRef({ userId: '', businessId: '' });
  scopeRef.current = {
    userId: String(userId || '').trim(),
    businessId: String(businessId || '').trim(),
  };

  const initial =
    userId && businessId ? readTpvCatalogCache(userId, businessId) : null;

  const [catalog, setCatalog] = useState<CatalogItem[]>(() => initial?.items ?? []);
  const [brands, setBrands] = useState<Brand[]>(() => initial?.brands ?? []);
  const [loadingCatalog, setLoadingCatalog] = useState(() => Boolean(userId && businessId && !initial));

  const applySnapshot = useCallback((snapshot: { items: CatalogItem[]; brands: Brand[] }) => {
    setCatalog(snapshot.items);
    setBrands(snapshot.brands);
  }, []);

  const reloadCatalog = useCallback(
    (reloadOptions?: { force?: boolean; silent?: boolean }) => {
      const { userId: uid, businessId: bid } = scopeRef.current;
      if (!uid || !bid) return Promise.resolve();

      const showSpinner = !reloadOptions?.silent && catalog.length === 0;
      if (showSpinner) setLoadingCatalog(true);

      return fetchTpvCatalog(uid, bid, {
        force: reloadOptions?.force,
        accountBusinessCount,
      })
        .then((snapshot) => {
          if (
            scopeRef.current.userId !== uid
            || scopeRef.current.businessId !== bid
          ) {
            return;
          }
          applySnapshot(snapshot);
        })
        .catch(() => {
          if (
            scopeRef.current.userId !== uid
            || scopeRef.current.businessId !== bid
          ) {
            return;
          }
          if (!reloadOptions?.silent && catalog.length === 0) {
            toast.error('Error al cargar el catálogo');
          }
        })
        .finally(() => {
          if (
            scopeRef.current.userId === uid
            && scopeRef.current.businessId === bid
            && showSpinner
          ) {
            setLoadingCatalog(false);
          }
        });
    },
    [accountBusinessCount, applySnapshot, catalog.length],
  );

  useEffect(() => {
    const uid = String(userId || '').trim();
    const bid = String(businessId || '').trim();

    if (!uid || !bid) {
      setCatalog([]);
      setBrands([]);
      setLoadingCatalog(false);
      return;
    }

    let cancelled = false;

    setCatalog([]);
    setBrands([]);
    setLoadingCatalog(true);

    const cached = readTpvCatalogCache(uid, bid);
    if (cached) {
      applySnapshot(cached);
      setLoadingCatalog(false);
    }

    const needsNetwork =
      !cached
      || cached.items.length === 0
      || Date.now() - (cached?.fetchedAt ?? 0) > REVALIDATE_MS
      || (cached != null && tpvCatalogSnapshotNeedsBrandRefetch(cached));

    if (!needsNetwork) {
      return () => {
        cancelled = true;
      };
    }

    void fetchTpvCatalog(uid, bid, { accountBusinessCount })
      .then((snapshot) => {
        if (cancelled) return;
        if (scopeRef.current.userId !== uid || scopeRef.current.businessId !== bid) return;
        applySnapshot(snapshot);
      })
      .catch(() => {
        if (cancelled) return;
        if (scopeRef.current.userId !== uid || scopeRef.current.businessId !== bid) return;
        if (!cached) {
          toast.error('Error al cargar el catálogo');
        }
      })
      .finally(() => {
        if (cancelled) return;
        if (scopeRef.current.userId !== uid || scopeRef.current.businessId !== bid) return;
        setLoadingCatalog(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId, businessId, accountBusinessCount, applySnapshot]);

  useEffect(() => {
    if (!userId || typeof window === 'undefined') return;
    const onCatalogChanged = () => {
      void reloadCatalog({ force: true, silent: true });
    };
    const onBrandsChanged = () => {
      void reloadCatalog({ force: true, silent: true });
    };
    window.addEventListener(DELIVERY_CATALOG_CHANGED, onCatalogChanged);
    window.addEventListener(DELIVERY_BRANDS_CHANGED, onBrandsChanged);
    return () => {
      window.removeEventListener(DELIVERY_CATALOG_CHANGED, onCatalogChanged);
      window.removeEventListener(DELIVERY_BRANDS_CHANGED, onBrandsChanged);
    };
  }, [userId, reloadCatalog]);

  return { catalog, brands, loadingCatalog, reloadCatalog };
}
