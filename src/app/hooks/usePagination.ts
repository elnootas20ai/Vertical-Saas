import { useState, useMemo, useCallback } from 'react';

export interface PaginationState {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  reset: () => void;
}

export function usePagination<T>(
  items: T[],
  defaultPageSize = 20,
): { paginated: T[]; pagination: PaginationState } {
  const [page, setPageRaw] = useState(1);
  const [pageSize, setPageSizeRaw] = useState(defaultPageSize);

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const setPage = useCallback((p: number) => {
    setPageRaw(Math.max(1, Math.min(p, Math.ceil(items.length / pageSize))));
  }, [items.length, pageSize]);

  const setPageSize = useCallback((size: number) => {
    setPageSizeRaw(size);
    setPageRaw(1);
  }, []);

  const reset = useCallback(() => {
    setPageRaw(1);
  }, []);

  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  return {
    paginated,
    pagination: { page, pageSize, total, totalPages, setPage, setPageSize, reset },
  };
}
