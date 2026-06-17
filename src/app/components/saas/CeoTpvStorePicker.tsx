import { useMemo } from 'react';
import { ArrowLeft, Store, Loader2, Monitor } from 'lucide-react';
import {
  buildDeliverySidebarStoreRows,
  pointOfSaleDisplayLabel,
  type PointOfSale,
} from '../../lib/deliveryApi';
import type { WorkCenter } from '../../lib/workCentersApi';
import type { DeliverySidebarStoreRow } from '../../lib/deliveryApi';
import {
  filterPointsOfSaleForWorkCenters,
  workCentersStrictlyForBusiness,
} from '../../lib/deliverySetup';

interface CeoTpvStorePickerProps {
  storeName?: string;
  storeRows: DeliverySidebarStoreRow[];
  pointsOfSale: PointOfSale[];
  loading?: boolean;
  onSelect: (pdvId: string) => void;
  onBack: () => void;
}

export function CeoTpvStorePicker({
  storeName,
  storeRows,
  pointsOfSale,
  loading = false,
  onSelect,
  onBack,
}: CeoTpvStorePickerProps) {
  const rows = useMemo(() => {
    if (storeRows.length > 0) return storeRows.filter((r) => !r.inactive);
    return pointsOfSale
      .filter((p) => p.active !== false)
      .map((pdv) => ({
        rowId: pdv._id,
        pdvId: pdv._id,
        workCenterId: pdv.workCenterId,
        title: pointOfSaleDisplayLabel(pdv),
        code: pdv.code,
        inactive: false,
        needsPdv: false,
      }));
  }, [storeRows, pointsOfSale]);

  const openable = rows.filter((r) => r.pdvId && !r.needsPdv);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
      <header className="shrink-0 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-4">
        <div className="max-w-3xl mx-auto flex items-start gap-3">
          <button
            type="button"
            onClick={onBack}
            className="mt-0.5 p-2 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
            aria-label="Volver"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400 mb-1">
              TPV Rápido · modo operativo
            </p>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Elige la tienda</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Misma experiencia que la tablet por código. Después abrirás caja en la tienda elegida.
            </p>
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 py-6">
        <div className="max-w-3xl mx-auto space-y-4">
          {loading && openable.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-500">
              <Loader2 className="w-8 h-8 animate-spin mb-3" />
              <p className="text-sm">Cargando tiendas…</p>
            </div>
          ) : openable.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-600 p-8 text-center text-gray-500">
              <Store className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No hay tiendas listas para operar.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {openable.map((row) => {
                const pdv = row.pdvId ? pointsOfSale.find((p) => p._id === row.pdvId) : undefined;
                const disabled = row.needsPdv || !row.pdvId || row.inactive;
                const termCount = pdv?.terminals?.filter((t) => t.active).length ?? 0;

                return (
                  <button
                    key={row.rowId}
                    type="button"
                    disabled={disabled}
                    onClick={() => row.pdvId && onSelect(row.pdvId)}
                    className={`text-left p-4 rounded-2xl border-2 transition-all ${
                      disabled
                        ? 'border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20 opacity-70 cursor-not-allowed'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-indigo-400 hover:shadow-lg hover:shadow-indigo-100/50 dark:hover:shadow-none active:scale-[0.99]'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-11 h-11 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0">
                        <Store className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-gray-900 dark:text-gray-100 truncate">{row.title}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-mono">
                          {row.needsPdv
                            ? 'Sin PDV activo'
                            : `${row.code || pdv?.code || '—'} · ${termCount} terminal${termCount !== 1 ? 'es' : ''}`}
                        </p>
                        {!disabled && (
                          <span className="inline-flex items-center gap-1 mt-2 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                            <Monitor className="w-3.5 h-3.5" />
                            Entrar al TPV
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {storeName && (
            <p className="text-center text-xs text-gray-400">
              Empresa: {storeName}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

export function buildCeoTpvStoreRows(
  workCenters: WorkCenter[],
  pointsOfSale: PointOfSale[],
  businessId?: string,
): DeliverySidebarStoreRow[] {
  let retail = workCenters.filter(
    (wc) =>
      !wc.deletedAt &&
      (wc.centerType === 'punto_de_venta' || wc.centerType === 'almacen'),
  );
  if (businessId) {
    retail = workCentersStrictlyForBusiness(workCenters, businessId).filter(
      (wc) =>
        !wc.deletedAt &&
        (wc.centerType === 'punto_de_venta' || wc.centerType === 'almacen'),
    );
  }
  const scopedPdvs = filterPointsOfSaleForWorkCenters(pointsOfSale, retail);
  return buildDeliverySidebarStoreRows(retail, scopedPdvs).filter(
    (r) => !r.inactive && !r.needsPdv && Boolean(r.pdvId),
  );
}
