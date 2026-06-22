import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Client } from '../context/AppContext';
import { listClientsPageRequest, type ClientsListMeta } from '../lib/crmApi';
import type { PaginationState } from './usePagination';

export interface UsePaginatedClientsOptions {
  userId?: string;
  businessId?: string;
  pageSize?: number;
  search?: string;
  sort?: string | null;
  branchId?: string;
  workCenterId?: string;
  enabled?: boolean;
}

function sortToQuery(sort: { key: string; dir: 'asc' | 'desc' } | null | undefined): string | undefined {
  if (!sort?.key) return '-createdAt';
  const prefix = sort.dir === 'desc' ? '-' : '';
  const fieldMap: Record<string, string> = {
    name: 'name',
    status: 'status',
    city: 'city',
    createdAt: 'createdAt',
  };
  const field = fieldMap[sort.key] || sort.key;
  return `${prefix}${field}`;
}

export function usePaginatedClients(options: UsePaginatedClientsOptions) {
  const {
    userId,
    businessId,
    pageSize = 20,
    search = '',
    sort = null,
    branchId = 'all',
    workCenterId = 'all',
    enabled = true,
  } = options;

  const [page, setPageRaw] = useState(1);
  const [clients, setClients] = useState<Client[]>([]);
  const [meta, setMeta] = useState<ClientsListMeta>({ total: 0, skip: 0, limit: pageSize, hasMore: false });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const sortQuery = useMemo(() => {
    if (typeof sort === 'string') return sort;
    if (sort && typeof sort === 'object' && 'key' in sort) {
      return sortToQuery(sort as { key: string; dir: 'asc' | 'desc' });
    }
    return '-createdAt';
  }, [sort]);

  const fetchPage = useCallback(async (targetPage: number) => {
    if (!userId || !enabled) {
      setClients([]);
      setMeta({ total: 0, skip: 0, limit: pageSize, hasMore: false });
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);

    try {
      const skip = (targetPage - 1) * pageSize;
      const result = await listClientsPageRequest(userId, {
        limit: pageSize,
        skip,
        search,
        sort: sortQuery,
        branchId,
        workCenterId,
        businessId,
        lite: true,
        signal: controller.signal,
      });

      if (controller.signal.aborted) return;

      setClients(result.clients);
      setMeta(result.meta);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : 'Error al cargar clientes');
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [userId, enabled, pageSize, search, sortQuery, branchId, workCenterId, businessId]);

  useEffect(() => {
    setPageRaw(1);
  }, [search, sortQuery, branchId, workCenterId, pageSize, userId, businessId]);

  useEffect(() => {
    void fetchPage(page);
    return () => abortRef.current?.abort();
  }, [fetchPage, page]);

  const totalPages = Math.max(1, Math.ceil(meta.total / pageSize));

  const setPage = useCallback((p: number) => {
    setPageRaw(Math.max(1, Math.min(p, totalPages)));
  }, [totalPages]);

  const setPageSize = useCallback((_size: number) => {
    setPageRaw(1);
  }, []);

  const reset = useCallback(() => {
    setPageRaw(1);
  }, []);

  const refresh = useCallback(async () => {
    await fetchPage(page);
  }, [fetchPage, page]);

  const pagination: PaginationState = {
    page,
    pageSize,
    total: meta.total,
    totalPages,
    setPage,
    setPageSize,
    reset,
  };

  return {
    clients,
    isLoading,
    error,
    pagination,
    refresh,
  };
}
