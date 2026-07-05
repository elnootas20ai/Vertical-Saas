import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { listClientErrorsRequest, type ClientErrorRow } from '../../../lib/userFacingError';

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/** Registro técnico para gerente (no se muestra al camarero en servicio). */
export function TpvIncidentsPanel({ className = '' }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ClientErrorRow[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listClientErrorsRequest(25));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void reload();
  }, [open, reload]);

  return (
    <div className={`rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-200">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          Incidencias TPV (detalle técnico)
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open ? (
        <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Solo visible aquí. El camarero ve mensajes simples, no estos detalles.
            </p>
            <button
              type="button"
              onClick={() => void reload()}
              disabled={loading}
              className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 dark:text-gray-300"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Actualizar
            </button>
          </div>
          {rows.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">Sin incidencias recientes</p>
          ) : (
            <ul className="max-h-64 overflow-y-auto space-y-2">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-950/50 p-2.5 text-xs"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-semibold text-gray-800 dark:text-gray-200">{row.context || 'TPV'}</span>
                    <span className="text-gray-400 tabular-nums shrink-0">{formatWhen(row.at)}</span>
                  </div>
                  <p className="text-gray-700 dark:text-gray-300">{row.message}</p>
                  {row.technical ? (
                    <pre className="mt-1.5 text-[10px] text-red-600/80 dark:text-red-400/80 whitespace-pre-wrap break-words font-mono leading-tight">
                      {row.technical.slice(0, 400)}
                    </pre>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
