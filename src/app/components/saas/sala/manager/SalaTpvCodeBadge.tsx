import { Copy, MonitorSmartphone } from 'lucide-react';
import { toast } from 'sonner';

type Props = {
  /** Código de activación TPV (6 caracteres, p. ej. K7M2NP) */
  code?: string;
  compact?: boolean;
  className?: string;
};

export function SalaTpvCodeBadge({ code, compact, className = '' }: Props) {
  const activationCode = String(code || '').trim().toUpperCase();

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!activationCode) return;
    try {
      await navigator.clipboard.writeText(activationCode);
      toast.success('Código copiado — úsalo en TPV Tablet');
    } catch {
      toast.error('No se pudo copiar');
    }
  };

  if (!activationCode) {
    return (
      <span className={`inline-flex items-center gap-1 text-[10px] text-gray-400 ${className}`}>
        <MonitorSmartphone className="h-3 w-3" />
        Terminal pendiente
      </span>
    );
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={handleCopy}
        title="Copiar código para activar TPV Tablet"
        className={`inline-flex items-center gap-1 rounded-md bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 ${className}`}
      >
        <MonitorSmartphone className="h-3 w-3 opacity-60" />
        {activationCode}
      </button>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-900/60">
        <MonitorSmartphone className="h-4 w-4 text-gray-500" />
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Código TPV</p>
          <p className="font-mono text-sm font-bold tracking-widest text-gray-900 dark:text-gray-100">
            {activationCode}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={handleCopy}
        className="rounded-xl border border-gray-200 p-2 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        title="Copiar código TPV"
      >
        <Copy className="h-4 w-4" />
      </button>
    </div>
  );
}
