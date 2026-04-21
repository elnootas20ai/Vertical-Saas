import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PaginationState } from '../../hooks/usePagination';

const PAGE_SIZES = [10, 20, 50, 100];

interface PaginationProps {
  pagination: PaginationState;
  className?: string;
}

export function Pagination({ pagination, className = '' }: PaginationProps) {
  const { page, pageSize, total, totalPages, setPage, setPageSize } = pagination;
  const { t } = useTranslation();

  if (total === 0) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  // Calcular páginas visibles: máximo 5 botones alrededor de la actual
  const getPageNumbers = () => {
    const pages: (number | '...')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push('...');
      for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
        pages.push(i);
      }
      if (page < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className={`flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-gray-200 dark:border-gray-700 ${className}`}>
      {/* Contador */}
      <p className="text-sm text-gray-500 dark:text-gray-400 flex-shrink-0">
        {t('pagination.showing')} <span className="font-semibold text-gray-900 dark:text-gray-100">{from}–{to}</span>{' '}
        {t('pagination.of')} <span className="font-semibold text-gray-900 dark:text-gray-100">{total}</span> {t('pagination.records')}
      </p>

      <div className="flex items-center gap-3">
        {/* Selector de tamaño de página */}
        <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
          <span>{t('pagination.perPage')}:</span>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {/* Navegación */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage(1)}
            disabled={page === 1}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title={t('pagination.firstPage')}
          >
            <ChevronsLeft className="w-4 h-4 text-gray-600 dark:text-gray-300" />
          </button>
          <button
            onClick={() => setPage(page - 1)}
            disabled={page === 1}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title={t('pagination.prevPage')}
          >
            <ChevronLeft className="w-4 h-4 text-gray-600 dark:text-gray-300" />
          </button>

          {getPageNumbers().map((p, idx) =>
            p === '...' ? (
              <span key={`ellipsis-${idx}`} className="px-1 text-gray-400 dark:text-gray-500 text-sm select-none">…</span>
            ) : (
              <button
                key={p}
                onClick={() => setPage(p as number)}
                className={`min-w-[32px] h-8 rounded-lg text-sm font-semibold transition-colors ${
                  p === page
                    ? 'bg-blue-600 text-white'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                {p}
              </button>
            ),
          )}

          <button
            onClick={() => setPage(page + 1)}
            disabled={page === totalPages}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title={t('pagination.nextPage')}
          >
            <ChevronRight className="w-4 h-4 text-gray-600 dark:text-gray-300" />
          </button>
          <button
            onClick={() => setPage(totalPages)}
            disabled={page === totalPages}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title={t('pagination.lastPage')}
          >
            <ChevronsRight className="w-4 h-4 text-gray-600 dark:text-gray-300" />
          </button>
        </div>
      </div>
    </div>
  );
}
