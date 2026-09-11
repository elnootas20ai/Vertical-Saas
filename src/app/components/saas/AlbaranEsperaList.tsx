import { useRef } from 'react';
import { Loader2, ScanLine, Upload } from 'lucide-react';
import type { PurchaseOrder } from '../../lib/purchaseOrderApi';
import { pendingLinesFromPurchaseOrder } from '../../lib/albaranReceptionCompare';
import { formatQtyEs } from '../../lib/formatNumberEs';
import { VERTIAL_BTN_PRIMARY, VERTIAL_BTN_SECONDARY } from '../../lib/vertialUiTokens';

export function AlbaranEsperaList({
  orders,
  ocrBusy,
  replenishing = false,
  onPickFile,
  onOpen,
  onReplenishPending,
}: {
  orders: PurchaseOrder[];
  ocrBusy: boolean;
  replenishing?: boolean;
  onPickFile: (order: PurchaseOrder, file: File) => void;
  /** Abre el popup grande de comprobar (mismo que OCR). */
  onOpen: (order: PurchaseOrder) => void;
  onReplenishPending?: (order: PurchaseOrder) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const pickOrderRef = useRef<PurchaseOrder | null>(null);

  if (orders.length === 0) return null;

  const pickFor = (order: PurchaseOrder, kind: 'file' | 'camera') => {
    pickOrderRef.current = order;
    if (kind === 'file') fileRef.current?.click();
    else cameraRef.current?.click();
  };

  return (
    <section>
      <h3 className="text-xs font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400 mb-2 px-1">
        En espera de albarán
      </h3>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          const order = pickOrderRef.current;
          e.target.value = '';
          pickOrderRef.current = null;
          if (file && order) onPickFile(order, file);
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
          const order = pickOrderRef.current;
          e.target.value = '';
          pickOrderRef.current = null;
          if (file && order) onPickFile(order, file);
        }}
      />
      <ul className="divide-y divide-stone-100 dark:divide-stone-800 rounded-xl border border-amber-200/80 dark:border-amber-900/50 overflow-hidden bg-amber-50/40 dark:bg-amber-950/20">
        {orders.map((order) => {
          const pendingLines =
            order.status === 'partial' ? pendingLinesFromPurchaseOrder(order) : [];
          return (
            <li key={order._id} className="bg-white/40 dark:bg-stone-950/20">
              <button
                type="button"
                onClick={() => onOpen(order)}
                className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-amber-50/80 dark:hover:bg-amber-950/30 transition-colors"
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
                        ? `incompleto · faltan ${pendingLines.length}`
                        : order.status === 'sent'
                          ? 'enviado'
                          : 'pendiente'}
                  </p>
                </div>
                <span className="text-xs font-semibold text-[var(--v-blue,#2563eb)] shrink-0">
                  Abrir
                </span>
              </button>
              <div className="px-4 pb-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={ocrBusy}
                  onClick={() => pickFor(order, 'camera')}
                  className={`${VERTIAL_BTN_PRIMARY} !min-h-0 px-3 py-2 text-xs`}
                >
                  {ocrBusy ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ScanLine className="w-3.5 h-3.5" />
                  )}
                  OCR albarán
                </button>
                <button
                  type="button"
                  disabled={ocrBusy}
                  onClick={() => pickFor(order, 'file')}
                  className={`${VERTIAL_BTN_SECONDARY} !min-h-0 px-3 py-2 text-xs`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  Archivo / PDF
                </button>
                {order.status === 'partial' && pendingLines.length > 0 && onReplenishPending ? (
                  <button
                    type="button"
                    disabled={replenishing || ocrBusy}
                    onClick={() => onReplenishPending(order)}
                    className={`${VERTIAL_BTN_SECONDARY} !min-h-0 px-3 py-2 text-xs inline-flex items-center gap-1.5`}
                    title={pendingLines.map((l) => `${l.name}: ${formatQtyEs(l.pendingQty)}`).join(' · ')}
                  >
                    {replenishing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    Pedido pendiente ({pendingLines.length})
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
