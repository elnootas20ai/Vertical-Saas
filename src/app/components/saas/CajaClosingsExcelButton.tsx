/**
 * Core — botón compartido de export Excel de cierres de caja (todas las verticales).
 */
import { useCallback, useMemo } from 'react';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import type { TpvRegisterSession } from '../../lib/deliveryApi';
import { downloadAccumulatedCajaClosingsExcel } from '../../lib/cajaClosingsExcelExport';

type CajaClosingsExcelButtonProps = {
  sessions: TpvRegisterSession[];
  className?: string;
};

export function CajaClosingsExcelButton({ sessions, className }: CajaClosingsExcelButtonProps) {
  const closedCount = useMemo(
    () => sessions.filter((s) => String(s.status || '').toLowerCase() !== 'open').length,
    [sessions],
  );

  const onClick = useCallback(() => {
    try {
      const { rows } = downloadAccumulatedCajaClosingsExcel(sessions);
      if (rows === 0) {
        toast.info('Aún no hay cierres de caja para exportar');
        return;
      }
      toast.success(`Excel generado con ${rows} cierre${rows === 1 ? '' : 's'} acumulado${rows === 1 ? '' : 's'}`);
    } catch (err) {
      console.error(err);
      toast.error('No se pudo generar el Excel');
    }
  }, [sessions]);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={closedCount === 0}
      className={
        className
        || 'shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 text-xs font-bold hover:bg-emerald-100 dark:hover:bg-emerald-950/60 disabled:opacity-40 disabled:cursor-not-allowed'
      }
      title="Descarga un Excel con todos los cierres acumulados (no uno por día)"
    >
      <Download className="w-4 h-4" />
      Excel cierres
      {closedCount > 0 ? (
        <span className="tabular-nums opacity-80">({closedCount})</span>
      ) : null}
    </button>
  );
}
