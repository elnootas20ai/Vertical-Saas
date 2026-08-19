import { useRef } from 'react';
import { Loader2, ScanLine, Upload } from 'lucide-react';
import type { PurchaseOrder } from '../../lib/purchaseOrderApi';
import { formatMoneyEs, formatQtyEs } from '../../lib/formatNumberEs';
import { VERTIAL_BTN_PRIMARY, VERTIAL_BTN_SECONDARY } from '../../lib/vertialUiTokens';

export function AlbaranEsperaList({
  orders,
  selectedId,
  ocrBusy,
  onSelect,
  onPickFile,
  onComprobar,
}: {
  orders: PurchaseOrder[];
  selectedId: string;
  ocrBusy: boolean;
  onSelect: (orderId: string) => void;
  onPickFile: (order: PurchaseOrder, file: File) => void;
  onComprobar: (order: PurchaseOrder) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  if (orders.length === 0) return null;

  return (
    <section>
      <h3 className="text-xs font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400 mb-2 px-1">
        En espera de albarán
      </h3>
      <ul className="divide-y divide-stone-100 dark:divide-stone-800 rounded-xl border border-amber-200/80 dark:border-amber-900/50 overflow-hidden bg-amber-50/40 dark:bg-amber-950/20">
        {orders.map((order) => {
          const selected = selectedId === order._id;
          return (
            <li key={order._id}>
              <button
                type="button"
                onClick={() => onSelect(selected ? '' : order._id)}
                className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-stone-900 dark:text-stone-100 truncate">
                    {order.orderNumber || 'Pedido'} · {order.supplierName || 'Proveedor'}
                  </p>
                  <p className="text-xs text-stone-500 mt-0.5">
                    {order.items?.length || 0} línea{(order.items?.length || 0) === 1 ? '' : 's'}
                    {order.expectedDate
                      ? ` · esperado ${new Date(order.expectedDate).toLocaleDateString('es-ES')}`
                      : ''}
                    {' · '}
                    {order.status === 'draft'
                      ? 'creado'
                      : order.status === 'partial'
                        ? 'parcial'
                        : order.status === 'sent'
                          ? 'enviado'
                          : 'pendiente'}
                  </p>
                </div>
                <span className="text-xs font-semibold text-amber-800 dark:text-amber-300 shrink-0">
                  {selected ? 'Cerrar' : 'Abrir'}
                </span>
              </button>
              {selected ? (
                <div className="px-4 pb-3 space-y-3 border-t border-amber-200/60 dark:border-amber-900/40 bg-white/70 dark:bg-stone-950/40">
                  <ul className="pt-2 space-y-1">
                    {(order.items || []).slice(0, 8).map((item) => (
                      <li
                        key={item.id || item.catalogItemId}
                        className="flex justify-between gap-2 text-xs text-stone-600 dark:text-stone-400"
                      >
                        <span className="truncate">{item.name}</span>
                        <span className="tabular-nums shrink-0">
                          {formatQtyEs(item.quantity)} · {formatMoneyEs(item.unitCost)}€
                        </span>
                      </li>
                    ))}
                    {(order.items || []).length > 8 ? (
                      <li className="text-[11px] text-stone-400">+{(order.items || []).length - 8} más</li>
                    ) : null}
                  </ul>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (file) onPickFile(order, file);
                    }}
                  />
                  <input
                    ref={cameraRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (file) onPickFile(order, file);
                    }}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={ocrBusy}
                      onClick={() => cameraRef.current?.click()}
                      className={`${VERTIAL_BTN_PRIMARY} !min-h-0 px-3 py-2 text-xs`}
                    >
                      {ocrBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ScanLine className="w-3.5 h-3.5" />}
                      OCR albarán
                    </button>
                    <button
                      type="button"
                      disabled={ocrBusy}
                      onClick={() => fileRef.current?.click()}
                      className={`${VERTIAL_BTN_SECONDARY} !min-h-0 px-3 py-2 text-xs`}
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Archivo / PDF
                    </button>
                    <button
                      type="button"
                      disabled={ocrBusy}
                      onClick={() => onComprobar(order)}
                      className={`${VERTIAL_BTN_SECONDARY} !min-h-0 px-3 py-2 text-xs`}
                    >
                      Comprobar sin OCR
                    </button>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
