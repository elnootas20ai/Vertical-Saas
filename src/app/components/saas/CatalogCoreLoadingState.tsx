import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

const HINTS_BY_KIND: Record<string, string[]> = {
  catalog: [
    'Cargando la carta…',
    'Trayendo productos y categorías…',
    'Preparando la lista de artículos…',
    'Casi listo: ordenando la carta…',
  ],
  stock: [
    'Cargando el almacén…',
    'Leyendo stock por tienda…',
    'Preparando inventario…',
    'Casi listo: sincronizando cantidades…',
  ],
  escandallo: [
    'Cargando escandallos…',
    'Uniendo carta e ingredientes…',
    'Calculando costes de referencia…',
    'Casi listo: preparando costes…',
  ],
  ingredients: [
    'Cargando ingredientes…',
    'Leyendo configuración de la tienda…',
    'Preparando extras e incluidos…',
    'Casi listo…',
  ],
  suppliers: [
    'Cargando proveedores…',
    'Leyendo fichas de compra…',
    'Casi listo…',
  ],
  generic: [
    'Cargando datos…',
    'Esto puede tardar un poco con muchas referencias…',
    'Sigue trabajando: no hace falta recargar…',
  ],
};

export type CatalogCoreLoadingKind =
  | 'catalog'
  | 'stock'
  | 'escandallo'
  | 'ingredients'
  | 'suppliers'
  | 'generic';

type Props = {
  kind?: CatalogCoreLoadingKind;
  message?: string;
  detail?: string;
  compact?: boolean;
};

/**
 * Loading del núcleo Catálogo (carta / escandallo / almacén / proveedores).
 * Muestra progreso percibido: tiempo + mensajes que rotan.
 */
export function CatalogCoreLoadingState({
  kind = 'generic',
  message,
  detail,
  compact = false,
}: Props) {
  const hints = HINTS_BY_KIND[kind] || HINTS_BY_KIND.generic;
  const [hintIdx, setHintIdx] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    setHintIdx(0);
    setElapsedSec(0);
    const hintTimer = window.setInterval(() => {
      setHintIdx((i) => (i + 1) % hints.length);
    }, 2800);
    const clock = window.setInterval(() => {
      setElapsedSec((s) => s + 1);
    }, 1000);
    return () => {
      window.clearInterval(hintTimer);
      window.clearInterval(clock);
    };
  }, [hints]);

  const label = message || hints[hintIdx] || 'Cargando…';
  const timeLabel =
    elapsedSec < 5
      ? null
      : elapsedSec < 60
        ? `${elapsedSec} s`
        : `${Math.floor(elapsedSec / 60)} min ${elapsedSec % 60} s`;

  return (
    <div
      className={
        compact
          ? 'py-10 flex flex-col items-center justify-center gap-3 text-gray-500 dark:text-gray-400'
          : 'py-16 flex flex-col items-center justify-center gap-4 text-gray-500 dark:text-gray-400'
      }
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Loader2
        className={`${compact ? 'w-6 h-6' : 'w-8 h-8'} animate-spin text-gray-400 dark:text-gray-500`}
        aria-hidden
      />
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 text-center px-4">{label}</p>
      {detail ? <p className="text-xs text-gray-500 dark:text-gray-400">{detail}</p> : null}
      {timeLabel ? (
        <p className="text-[11px] font-semibold tabular-nums text-gray-400 dark:text-gray-500">
          Lleva {timeLabel} · no recargues la página
        </p>
      ) : (
        <p className="text-[11px] text-gray-400 dark:text-gray-500">Un momento…</p>
      )}
      {elapsedSec >= 12 ? (
        <div className="mt-1 w-full max-w-xs h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-gray-400/70 dark:bg-gray-500 animate-pulse"
            style={{ width: `${Math.min(92, 18 + elapsedSec * 2)}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}
