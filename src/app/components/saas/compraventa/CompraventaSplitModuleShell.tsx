import type { ReactNode } from 'react';

export interface CompraventaSplitModuleShellProps {
  title: string;
  subtitle: string;
  headerAction?: ReactNode;
  headerBelow?: ReactNode;
  listPanel: ReactNode;
  detailPanel: ReactNode;
  overlay?: ReactNode;
}

/** Layout compartido listado + detalle para módulos operativos de compraventa. */
export function CompraventaSplitModuleShell({
  title,
  subtitle,
  headerAction,
  headerBelow,
  listPanel,
  detailPanel,
  overlay,
}: CompraventaSplitModuleShellProps) {
  return (
    <div className="flex min-h-[calc(100dvh-7.5rem)] flex-col overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-950 md:min-h-[calc(100dvh-6.5rem)]">
      <div className="shrink-0 border-b border-gray-200/80 dark:border-gray-800">
        <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-3 md:px-5">
          <div className="min-w-0">
            <h1 className="text-base font-semibold tracking-tight text-gray-900 dark:text-gray-100">
              {title}
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>
          </div>
          {headerAction}
        </div>
        {headerBelow}
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)]">
        {listPanel}
        {detailPanel}
      </div>

      {overlay}
    </div>
  );
}
