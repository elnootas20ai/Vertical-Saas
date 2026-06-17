import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { CatalogItem } from '../lib/deliveryApi';
import type { Brand } from '../lib/brandsApi';
import {
  fetchTpvCatalog,
  readTpvCatalogCache,
} from '../lib/tpvCatalogCache';

const REVALIDATE_MS = 60_000;

export function useTpvCatalog(userId: string | undefined, businessId: string) {
  const initial = userId ? readTpvCatalogCache(userId, businessId) : null;

  const [catalog, setCatalog] = useState<CatalogItem[]>(() => initial?.items ?? []);
  const [brands, setBrands] = useState<Brand[]>(() => initial?.brands ?? []);
  const [loadingCatalog, setLoadingCatalog] = useState(() => Boolean(userId && !initial));

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
      !cached || Date.now() - cached.fetchedAt > REVALIDATE_MS;

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

  return { catalog, brands, loadingCatalog };
}
