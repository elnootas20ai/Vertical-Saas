import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

type Props = {
  title: string;
  /** Texto corto cuando está cerrado (ej. «Abrir para ver gráficas»). */
  hint?: string;
  icon?: ReactNode;
  /** Por defecto cerrado: no monta hijos hasta abrir. */
  defaultOpen?: boolean;
  /** Persistencia en sessionStorage para no reabrir en cada navegación de la sesión. */
  storageKey?: string;
  className?: string;
  children: ReactNode;
};

function readStoredOpen(storageKey: string | undefined, fallback: boolean): boolean {
  if (!storageKey || typeof window === 'undefined') return fallback;
  try {
    const v = sessionStorage.getItem(storageKey);
    if (v === '1') return true;
    if (v === '0') return false;
  } catch {
    /* noop */
  }
  return fallback;
}

/**
 * Cabecera compacta del dashboard: colapsado por defecto.
 * Los hijos solo se montan al abrir → menos recharts / fetches / DOM pesado.
 */
export function DashboardLazyPanel({
  title,
  hint = 'Abrir para cargar',
  icon,
  defaultOpen = false,
  storageKey,
  className = '',
  children,
}: Props) {
  const [open, setOpen] = useState(() => readStoredOpen(storageKey, defaultOpen));

  useEffect(() => {
    if (!storageKey) return;
    try {
      sessionStorage.setItem(storageKey, open ? '1' : '0');
    } catch {
      /* noop */
    }
  }, [open, storageKey]);

  return (
    <div className={`space-y-2 ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full min-h-11 items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-800/80"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          {icon ? (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gray-50 text-gray-500 dark:bg-gray-900/60 dark:text-gray-400">
              {icon}
            </span>
          ) : null}
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-gray-900 dark:text-gray-100">{title}</p>
            {!open && hint ? (
              <p className="truncate text-[11px] text-gray-400 dark:text-gray-500">{hint}</p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="hidden text-[10px] font-bold text-[var(--v-blue,#2563eb)] sm:inline">
            {open ? 'Ocultar' : 'Abrir'}
          </span>
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 dark:border-gray-600 dark:bg-gray-900">
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
          </span>
        </div>
      </button>
      {open ? children : null}
    </div>
  );
}
