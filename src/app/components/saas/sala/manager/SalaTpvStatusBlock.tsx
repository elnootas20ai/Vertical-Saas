import { Copy, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import type { SalaTpvDisplay } from '../../../../lib/salaStoreTpv';

type Props = {
  tpv: SalaTpvDisplay | null;
  variant?: 'full' | 'minimal' | 'inline';
  onOpenTpv?: () => void;
};

export function SalaTpvStatusBlock({ tpv, variant = 'full', onOpenTpv }: Props) {
  if (!tpv) {
    if (variant === 'minimal') return null;
    return (
      <p className="text-xs text-gray-400">
        Sin TPV disponible — crea un centro de trabajo en Configuración
      </p>
    );
  }

  const handleCopy = async () => {
    const code = String(tpv.terminalCode || '').trim().toUpperCase();
    if (!code) {
      toast.error('Sin código TPV disponible');
      return;
    }
    try {
      await navigator.clipboard.writeText(code);
      toast.success('Código copiado');
    } catch {
      toast.error('No se pudo copiar');
    }
  };

  if (variant === 'minimal') {
    if (!tpv.terminalCode) return null;
    return (
      <div className="rounded-xl border border-gray-200/80 bg-gray-50/80 px-3 py-2.5 dark:border-gray-800 dark:bg-gray-900/40">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Código TPV</p>
        <p className="mt-1 font-mono text-sm font-semibold tracking-widest text-gray-700 dark:text-gray-300">
          {tpv.terminalCode}
        </p>
        <button
          type="button"
          onClick={handleCopy}
          className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-900"
        >
          <Copy className="h-3.5 w-3.5" />
          Copiar
        </button>
      </div>
    );
  }

  if (variant === 'inline') {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-gray-200/80 bg-gray-50/80 px-3 py-2 text-xs dark:border-gray-800 dark:bg-gray-900/40">
        <span className="font-semibold uppercase tracking-wide text-gray-400">TPV</span>
        <span className="font-medium text-gray-900 dark:text-gray-100">{tpv.pdvLabel}</span>
        {tpv.terminalCode ? (
          <span className="font-mono font-semibold tracking-widest text-gray-600 dark:text-gray-400">
            {tpv.terminalCode}
          </span>
        ) : (
          <span className="text-gray-400">Sin código</span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleCopy}
            disabled={!tpv.terminalCode}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-300"
          >
            <Copy className="h-3.5 w-3.5" />
            Copiar
          </button>
          {onOpenTpv ? (
            <button
              type="button"
              onClick={onOpenTpv}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-300"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Ir al TPV
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200/80 bg-gray-50/80 p-4 dark:border-gray-800 dark:bg-gray-900/40">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Acceso al TPV</p>
      <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">{tpv.pdvLabel}</p>
      {tpv.terminalCode ? (
        <p className="mt-0.5 font-mono text-xs font-semibold tracking-widest text-gray-500 dark:text-gray-400">
          {tpv.terminalCode}
        </p>
      ) : (
        <p className="mt-0.5 text-xs text-gray-400">Código TPV pendiente</p>
      )}
      <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
        Usa este código en la app de TPV para operar en sala. Aquí solo configuras mesas.
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={handleCopy}
          disabled={!tpv.terminalCode}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white py-2 text-xs font-semibold text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200 dark:hover:bg-gray-900"
        >
          <Copy className="h-3.5 w-3.5" />
          Copiar código
        </button>
        {onOpenTpv && (
          <button
            type="button"
            onClick={onOpenTpv}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-900"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Ir al TPV
          </button>
        )}
      </div>
    </div>
  );
}
