import { Loader2 } from 'lucide-react';

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

const DEFAULT_MESSAGE: Record<CatalogCoreLoadingKind, string> = {
  catalog: 'Cargando carta…',
  stock: 'Cargando almacén…',
  escandallo: 'Cargando escandallos…',
  ingredients: 'Cargando ingredientes…',
  suppliers: 'Cargando proveedores…',
  generic: 'Cargando…',
};

/**
 * Loading del núcleo Catálogo — spinner simple, sin contador ni mensajes que rotan.
 */
export function CatalogCoreLoadingState({
  kind = 'generic',
  message,
  detail,
  compact = false,
}: Props) {
  const label = message || DEFAULT_MESSAGE[kind] || DEFAULT_MESSAGE.generic;

  return (
    <div
      className={
        compact
          ? 'py-10 flex flex-col items-center justify-center gap-2 text-gray-500 dark:text-gray-400'
          : 'py-12 flex flex-col items-center justify-center gap-2 text-gray-500 dark:text-gray-400'
      }
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Loader2
        className={`${compact ? 'w-6 h-6' : 'w-7 h-7'} animate-spin text-gray-400 dark:text-gray-500`}
        aria-hidden
      />
      <p className="text-sm text-gray-600 dark:text-gray-300 text-center px-4">{label}</p>
      {detail ? <p className="text-xs text-gray-400 dark:text-gray-500 text-center px-4">{detail}</p> : null}
    </div>
  );
}
