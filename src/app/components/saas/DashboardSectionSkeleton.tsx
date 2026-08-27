/**
 * Skeletons del Dashboard SaaS — misma piel Vertial (bordes, radios, pulse suave).
 * Cada variante imita el layout real del bloque para evitar saltos al pintar datos.
 */
import type { ReactNode } from 'react';

const bone = 'rounded bg-gray-100 dark:bg-gray-700/80';
const boneSoft = 'rounded bg-gray-50 dark:bg-gray-800/60';

function Bone({ className = '' }: { className?: string }) {
  return <div className={`${bone} ${className}`} aria-hidden />;
}

function BoneSoft({ className = '' }: { className?: string }) {
  return <div className={`${boneSoft} ${className}`} aria-hidden />;
}

function SectionShell({
  children,
  label,
  className = '',
}: {
  children: ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <section
      className={`animate-pulse rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:rounded-2xl ${className}`}
      aria-busy="true"
      aria-label={label}
    >
      {children}
    </section>
  );
}

/** Resumen operativo (PortfolioOpsPulse): cabecera + KPIs + lista tiendas. */
export function DashboardOpsPulseSkeleton() {
  return (
    <SectionShell label="Cargando resumen operativo" className="space-y-3 p-3 sm:space-y-4 sm:p-4 lg:p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <div className="min-w-0 space-y-1.5">
          <Bone className="h-3.5 w-40" />
          <Bone className="hidden h-2.5 w-52 sm:block" />
        </div>
        <div className="flex items-center gap-1.5">
          <BoneSoft className="h-8 w-[148px] rounded-lg" />
          <BoneSoft className="h-8 w-8 rounded-lg" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5 lg:grid-cols-8">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-gray-100 bg-gray-50/60 px-2 py-2 dark:border-gray-700 dark:bg-gray-900/30"
          >
            <Bone className="h-2 w-10" />
            <Bone className="mt-2 h-4 w-14" />
            <Bone className="mt-1.5 h-2 w-8" />
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-gray-100 bg-gray-50/60 px-2.5 py-2 dark:border-gray-700 dark:bg-gray-900/30 sm:px-3 sm:py-2.5">
        <Bone className="h-2.5 w-28" />
        <Bone className="mt-2 h-1.5 w-full rounded-full" />
        <div className="mt-2 flex flex-wrap gap-2">
          <Bone className="h-2.5 w-16" />
          <Bone className="h-2.5 w-14" />
          <Bone className="h-2.5 w-20" />
        </div>
      </div>

      <div className="space-y-2">
        <Bone className="h-2.5 w-24" />
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex min-h-11 items-center justify-between gap-2 rounded-xl border border-gray-100 px-2.5 py-2 dark:border-gray-700"
          >
            <div className="min-w-0 flex-1 space-y-1.5">
              <Bone className="h-3 w-32" />
              <Bone className="h-2 w-20" />
            </div>
            <Bone className="h-4 w-16" />
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

/** Panel Marcas. */
export function DashboardBrandsSkeleton() {
  return (
    <SectionShell label="Cargando marcas" className="p-2.5 sm:p-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <Bone className="h-3 w-36" />
        <div className="flex items-center gap-2">
          <BoneSoft className="h-7 w-[132px] rounded-lg" />
          <Bone className="h-4 w-16" />
        </div>
      </div>
      <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-2.5 dark:border-gray-800 dark:bg-gray-800/40"
          >
            <div className="flex items-center gap-1.5">
              <Bone className="h-2 w-2 rounded-full" />
              <Bone className="h-3 w-24" />
            </div>
            <Bone className="mt-2 h-5 w-20" />
            <Bone className="mt-2 h-1.5 w-full rounded-full" />
            <Bone className="mt-2 h-2.5 w-32" />
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

/** Pagos a trabajadores. */
export function DashboardWorkerPaySkeleton() {
  return (
    <SectionShell label="Cargando pagos a trabajadores" className="p-3 sm:p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1.5">
          <Bone className="h-3.5 w-48" />
          <Bone className="h-2.5 w-56" />
        </div>
        <BoneSoft className="h-11 w-20 rounded-xl" />
      </div>
      <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-lg border border-gray-100 bg-gray-50/80 px-2.5 py-2.5 dark:border-gray-800 dark:bg-gray-800/40"
          >
            <Bone className="h-2 w-20" />
            <Bone className="mt-2 h-5 w-16" />
            <Bone className="mt-1.5 h-2 w-14" />
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

/** Cabecera de panel lazy (colapsado) mientras espera su ola. */
export function DashboardLazyHeaderSkeleton({ titleWidth = 'w-40' }: { titleWidth?: string }) {
  return (
    <div
      className="flex min-h-11 w-full animate-pulse items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800"
      aria-busy="true"
      aria-label="Cargando panel"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <BoneSoft className="h-8 w-8 rounded-xl" />
        <div className="min-w-0 space-y-1.5">
          <Bone className={`h-3.5 ${titleWidth}`} />
          <Bone className="h-2.5 w-36" />
        </div>
      </div>
      <BoneSoft className="h-7 w-7 rounded-full" />
    </div>
  );
}

/** Gráficas principales (2 cards). */
export function DashboardChartsSkeleton() {
  return (
    <div className="grid animate-pulse grid-cols-1 gap-4 lg:grid-cols-2" aria-busy="true" aria-label="Cargando gráficas">
      {[0, 1].map((i) => (
        <div
          key={i}
          className="overflow-hidden rounded-2xl border-2 border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
        >
          <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-800">
            <Bone className="h-4 w-40" />
            <Bone className="mt-2 h-2.5 w-52" />
          </div>
          <div className="h-48 p-4">
            <BoneSoft className="h-full w-full rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Cards KPI (operativa / CRM / finance). */
export function DashboardKpiGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div
      className={`grid animate-pulse grid-cols-2 gap-3 ${count >= 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}
      aria-busy="true"
      aria-label="Cargando indicadores"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-gray-100 bg-gray-50/80 p-3 dark:border-gray-800 dark:bg-gray-900/40"
        >
          <div className="mb-2 flex items-center gap-2">
            <Bone className="h-4 w-4 rounded" />
            <Bone className="h-2.5 w-16" />
          </div>
          <Bone className="h-7 w-12" />
          <Bone className="mt-2 h-2 w-24" />
        </div>
      ))}
    </div>
  );
}

/** Resumen financiero rápido. */
export function DashboardQuickFinanceSkeleton() {
  return (
    <div
      className="animate-pulse overflow-hidden rounded-2xl border-2 border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
      aria-busy="true"
      aria-label="Cargando resumen financiero"
    >
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-800">
        <Bone className="h-4 w-40" />
        <Bone className="h-3 w-20" />
      </div>
      <div className="p-5">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl bg-gray-50 p-3 dark:bg-gray-900/40">
              <Bone className="h-2.5 w-14" />
              <Bone className="mt-2 h-5 w-20" />
            </div>
          ))}
        </div>
        <div className="mt-4 border-t border-gray-100 pt-4 dark:border-gray-800">
          <div className="mb-2 flex items-center justify-between">
            <Bone className="h-2.5 w-28" />
            <Bone className="h-3.5 w-10" />
          </div>
          <Bone className="h-2.5 w-full rounded-full" />
        </div>
      </div>
    </div>
  );
}
