import type { ReactNode } from 'react';
import { VERTIAL_SURFACE } from '../../../lib/vertialUiTokens';

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
    <div className={`flex min-h-[calc(100dvh-7.5rem)] flex-col overflow-hidden md:min-h-[calc(100dvh-6.5rem)] ${VERTIAL_SURFACE}`}>
      <div className="shrink-0 border-b border-slate-200/80 dark:border-slate-800">
        <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-3 md:px-5">
          <div className="min-w-0">
            <h1 className="vsaas-title text-base">{title}</h1>
            <p className="vsaas-subtitle text-xs">{subtitle}</p>
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
