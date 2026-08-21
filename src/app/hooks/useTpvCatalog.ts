import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { CatalogItem } from '../lib/deliveryApi';
import type { Brand } from '../lib/brandsApi';
import { DELIVERY_CATALOG_CHANGED, DELIVERY_BRANDS_CHANGED } from '../lib/deliverySetup';
import {
  fetchTpvCatalog,
  readTpvCatalogCache,
  ensureTpvCatalogCacheSchema,
  tpvCatalogSnapshotNeedsBrandRefetch,
  type TpvCatalogFetchInput,
} from '../lib/tpvCatalogCache';
import type { TpvCatalogBusinessRef } from '../lib/tpvCatalogScope';
import { resolveTpvCatalogLoadScope } from '../lib/tpvCatalogScope';
import { filterCatalogByEventAllowlist } from '../lib/eventsPortableTpv';

const REVALIDATE_MS = 60_000;

export function useTpvCatalog(
  userId: string | undefined,
  scopeBusinessId: string,
  options?: {
    accountBusinessCount?: number;
    businesses?: TpvCatalogBusinessRef[];
    /** Si viene (p. ej. PDV de evento), solo esos productos. null = sin filtro. */
    catalogItemIdAllowlist?: string[] | null;
  },
) {
  const businesses = options?.businesses ?? [];
  const accountBusinessCount = options?.accountBusinessCount;
  const allowlist = options?.catalogItemIdAllowlist;

  const fetchInput = useMemo((): TpvCatalogFetchInput => ({
    scopeBusinessId: String(scopeBusinessId || '').trim(),
    businesses,
    accountBusinessCount,
  }), [scopeBusinessId, businesses, accountBusinessCount]);

  const catalogBusinessId = useMemo(
    () => resolveTpvCatalogLoadScope(fetchInput.scopeBusinessId, fetchInput.businesses, fetchInput.accountBusinessCount).catalogBusinessId,
    [fetchInput],
  );

  const scopeRef = useRef({ userId: '', fetchInput: fetchInput as TpvCatalogFetchInput });
  scopeRef.current = {
    userId: String(userId || '').trim(),
    fetchInput,
  };

  const initial =
    userId && fetchInput.scopeBusinessId
      ? readTpvCatalogCache(userId, fetchInput)
      : null;

  const [catalog, setCatalog] = useState<CatalogItem[]>(() => initial?.items ?? []);
  const [brands, setBrands] = useState<Brand[]>(() => initial?.brands ?? []);
  const [loadingCatalog, setLoadingCatalog] = useState(
    () => Boolean(userId && fetchInput.scopeBusinessId && !initial),
  );

  const applySnapshot = useCallback((snapshot: { items: CatalogItem[]; brands: Brand[] }) => {
    setCatalog(snapshot.items);
    setBrands(snapshot.brands);
  }, []);

  const reloadCatalog = useCallback(
    (reloadOptions?: { force?: boolean; silent?: boolean }) => {
      const { userId: uid, fetchInput: input } = scopeRef.current;
      if (!uid || !input.scopeBusinessId) return Promise.resolve();

      const showSpinner = !reloadOptions?.silent && catalog.length === 0;
      if (showSpinner) setLoadingCatalog(true);

      return fetchTpvCatalog(uid, input, { force: reloadOptions?.force })
        .then((snapshot) => {
          if (scopeRef.current.userId !== uid) return;
          const currentScope = resolveTpvCatalogLoadScope(
            scopeRef.current.fetchInput.scopeBusinessId,
            scopeRef.current.fetchInput.businesses,
            scopeRef.current.fetchInput.accountBusinessCount,
          ).catalogBusinessId;
          if (snapshot.catalogBusinessId !== currentScope) return;
          applySnapshot(snapshot);
        })
        .catch(() => {
          if (scopeRef.current.userId !== uid) return;
          if (!reloadOptions?.silent && catalog.length === 0) {
            toast.error('Error al cargar el catálogo');
          }
        })
        .finally(() => {
          if (scopeRef.current.userId === uid && showSpinner) {
            setLoadingCatalog(false);
          }
        });
    },
    [applySnapshot, catalog.length],
  );

  useEffect(() => {
    ensureTpvCatalogCacheSchema();
  }, []);

  useEffect(() => {
    const uid = String(userId || '').trim();
    const input = fetchInput;

    if (!uid || !input.scopeBusinessId || !catalogBusinessId) {
      setCatalog([]);
      setBrands([]);
      setLoadingCatalog(false);
      return;
    }

    let cancelled = false;

    const cached = readTpvCatalogCache(uid, input);
    const needsNetwork =
      !cached
      || cached.items.length === 0
      || Date.now() - (cached?.fetchedAt ?? 0) > REVALIDATE_MS
      || (cached != null && tpvCatalogSnapshotNeedsBrandRefetch(cached));

    if (cached) {
      applySnapshot(cached);
      setLoadingCatalog(false);
    } else {
      setLoadingCatalog(true);
    }

    if (!needsNetwork) {
      return () => {
        cancelled = true;
      };
    }

    // Revalidación en segundo plano: NO poner loading=true si ya hay carta en caché
    // (en tablet el «+» / editar pedido parpadeaba el spinner encima de productos).
    const showSpinner = !cached || cached.items.length === 0;
    if (showSpinner) {
      setLoadingCatalog(true);
    }

    void fetchTpvCatalog(uid, input)
      .then((snapshot) => {
        if (cancelled) return;
        if (scopeRef.current.userId !== uid) return;
        applySnapshot(snapshot);
      })
      .catch(() => {
        if (cancelled) return;
        if (scopeRef.current.userId !== uid) return;
        if (!cached) {
          toast.error('Error al cargar el catálogo');
        }
      })
      .finally(() => {
        if (cancelled) return;
        if (scopeRef.current.userId !== uid) return;
        setLoadingCatalog(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId, fetchInput, catalogBusinessId, applySnapshot]);

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

  const scopedCatalog = useMemo(
    () => filterCatalogByEventAllowlist(catalog, allowlist),
    [catalog, allowlist],
  );

  return { catalog: scopedCatalog, brands, loadingCatalog, reloadCatalog, catalogBusinessId };
}
