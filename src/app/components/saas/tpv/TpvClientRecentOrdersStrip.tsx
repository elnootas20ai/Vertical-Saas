import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, History, Loader2, ShoppingBag, Truck } from 'lucide-react';
import {
  getClientOrderHistoryRequest,
  type DeliveryOrder,
} from '../../../lib/deliveryApi';
import { formatMoneyEs } from '../../../lib/formatNumberEs';

const STATUS_LABEL: Record<string, string> = {
  nuevo: 'Nuevo',
  cocina: 'Cocina',
  listo: 'Listo',
  en_reparto: 'Reparto',
  entregado: 'Entregado',
  devuelto: 'Devuelto',
  cancelled: 'Cancelado',
  cancelado: 'Cancelado',
};

const historyCache = new Map<string, DeliveryOrder[]>();

function formatOrderWhen(iso: string | undefined): string {
  const raw = String(iso || '').trim();
  if (!raw) return '—';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function orderItemsPreview(items: DeliveryOrder['items'] | undefined, max = 2): string {
  if (!items?.length) return 'Sin líneas';
  const names = items
    .slice(0, max)
    .map((i) => String(i.name || '').trim())
    .filter(Boolean);
  const extra = items.length > max ? ` +${items.length - max}` : '';
  return names.length ? `${names.join(', ')}${extra}` : `${items.length} producto${items.length === 1 ? '' : 's'}`;
}

function orderItemLine(item: DeliveryOrder['items'][number]): string {
  const qty = Number(item.quantity) || 1;
  const name = String(item.name || '').trim() || 'Producto';
  return `${qty}× ${name}`;
}

type Props = {
  userId: string;
  clientId: string;
  clientName?: string;
  limit?: number;
  className?: string;
};

/**
 * Historial reciente del cliente en paso Entrega (TPV).
 * Bloque colapsable; caché por cliente para no parpadear en prod.
 */
export function TpvClientRecentOrdersStrip({
  userId,
  clientId,
  clientName,
  limit = 5,
  className = '',
}: Props) {
  const uid = String(userId || '').trim();
  const cid = String(clientId || '').trim();
  const cacheKey = uid && cid ? `${uid}:${cid}` : '';

  const [orders, setOrders] = useState<DeliveryOrder[]>(() => {
    if (!cacheKey) return [];
    return historyCache.get(cacheKey) || [];
  });
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(() => Boolean(cacheKey && historyCache.has(cacheKey)));
  const [fetchError, setFetchError] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);
  const rowRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const lastFetchKeyRef = useRef('');

  const togglePanel = useCallback(() => {
    setPanelOpen((open) => {
      const next = !open;
      if (!next) setExpandedId(null);
      if (next) {
        window.requestAnimationFrame(() => {
          sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
      }
      return next;
    });
  }, []);

  const toggleExpanded = useCallback((order: DeliveryOrder) => {
    const id = String(order._id || order.id || '').trim();
    if (!id) return;
    setExpandedId((prev) => {
      const next = prev === id ? null : id;
      if (next) {
        window.requestAnimationFrame(() => {
          rowRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!uid || !cid) {
      setOrders([]);
      setLoading(false);
      setLoaded(false);
      setFetchError(false);
      setPanelOpen(false);
      setExpandedId(null);
      return;
    }

    const key = `${uid}:${cid}`;
    const clientChanged = lastFetchKeyRef.current !== key;
    lastFetchKeyRef.current = key;

    const cached = historyCache.get(key);
    if (clientChanged) {
      setPanelOpen(false);
      setExpandedId(null);
      if (cached?.length) {
        setOrders(cached);
        setLoaded(true);
      }
    }

    let cancelled = false;
    setLoading(true);
    setFetchError(false);

    void getClientOrderHistoryRequest(uid, cid)
      .then((list) => {
        if (cancelled) return;
        const slice = (Array.isArray(list) ? list : []).slice(0, Math.max(1, limit));
        historyCache.set(key, slice);
        setOrders(slice);
        setLoaded(true);
        setFetchError(false);
      })
      .catch(() => {
        if (cancelled) return;
        setFetchError(true);
        setLoaded(true);
        if (!cached?.length) setOrders([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [uid, cid, limit]);

  if (!uid || !cid) return null;
  if (loaded && !loading && orders.length === 0 && !fetchError) return null;

  const latest = orders[0];
  const latestTotal = latest ? formatMoneyEs(Number(latest.totalAmount) || 0) : '';
  const latestWhen = latest ? formatOrderWhen(latest.createdAt || latest.deliveredAt) : '';
  const countLabel = orders.length === 1 ? '1 pedido' : `${orders.length} pedidos`;

  return (
    <section
      ref={sectionRef}
      className={`mt-6 ${className}`.trim()}
      aria-label="Historial de pedidos del cliente"
    >
      <div className="rounded-xl border border-gray-200/90 dark:border-gray-700/90 bg-gray-50/70 dark:bg-gray-900/35 overflow-hidden shadow-sm shadow-gray-900/[0.03]">
        <button
          type="button"
          onClick={togglePanel}
          aria-expanded={panelOpen}
          className="w-full flex items-center gap-3 px-3 py-2.5 text-left touch-manipulation hover:bg-gray-100/70 dark:hover:bg-gray-800/40 transition-colors"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white dark:bg-gray-800 border border-gray-200/80 dark:border-gray-700 text-gray-500 dark:text-gray-400">
            <History className="w-4 h-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                Historial de pedidos
              </p>
              {!loading && orders.length > 0 ? (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-gray-200/70 dark:bg-gray-700/70 text-gray-600 dark:text-gray-300 tabular-nums">
                  {countLabel}
                </span>
              ) : null}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
              {loading && orders.length === 0
                ? 'Cargando historial…'
                : fetchError && orders.length === 0
                  ? 'No se pudo cargar el historial'
                  : clientName?.trim()
                    ? `${clientName.trim()} · último ${latestTotal} (${latestWhen})`
                    : `Último ${latestTotal} (${latestWhen})`}
            </p>
          </div>
          {loading && orders.length === 0 ? (
            <Loader2 className="w-4 h-4 animate-spin text-gray-400 shrink-0" aria-label="Cargando" />
          ) : (
            <ChevronDown
              className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${panelOpen ? 'rotate-180' : ''}`}
              aria-hidden
            />
          )}
        </button>

        {panelOpen ? (
          <div className="border-t border-gray-200/80 dark:border-gray-700/80 px-2 py-2 max-h-[min(240px,32dvh)] overflow-y-auto overscroll-contain">
            {loading && orders.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400 px-1 py-2">Cargando…</p>
            ) : orders.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400 px-1 py-2">
                {fetchError ? 'Historial no disponible ahora.' : 'Sin pedidos anteriores.'}
              </p>
            ) : (
              <ul className="space-y-1">
                {orders.map((order) => {
                  const id = String(order._id || order.id || '').trim();
                  const rowKey = id || `${order.createdAt}-${order.totalAmount}`;
                  const status = STATUS_LABEL[String(order.status || '').toLowerCase()]
                    || String(order.status || '—');
                  const isDomicilio = String(order.deliveryType || '') === 'domicilio';
                  const total = Number(order.totalAmount) || 0;
                  const when = formatOrderWhen(order.createdAt || order.deliveredAt);
                  const expanded = Boolean(id && expandedId === id);
                  const items = Array.isArray(order.items) ? order.items : [];
                  const notes = String(order.notes || order.observations || '').trim();

                  return (
                    <li
                      key={rowKey}
                      ref={(el) => {
                        if (id) rowRefs.current[id] = el;
                      }}
                      className="rounded-lg border border-gray-100 dark:border-gray-800 bg-white/80 dark:bg-gray-950/40"
                    >
                      <button
                        type="button"
                        onClick={() => toggleExpanded(order)}
                        aria-expanded={expanded}
                        className="w-full flex items-start gap-2 rounded-lg px-2 py-2 text-left touch-manipulation hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors"
                        aria-label={`${expanded ? 'Ocultar' : 'Ver'} pedido del ${when}, ${formatMoneyEs(total)}`}
                      >
                        <span className="mt-0.5 shrink-0 text-gray-400" aria-hidden>
                          {isDomicilio ? <Truck className="w-3.5 h-3.5" /> : <ShoppingBag className="w-3.5 h-3.5" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-xs font-semibold text-gray-800 dark:text-gray-200 tabular-nums">
                              {formatMoneyEs(total)}
                            </span>
                            <span className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums shrink-0">{when}</span>
                          </div>
                          {!expanded ? (
                            <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate leading-snug mt-0.5">
                              {orderItemsPreview(order.items)}
                            </p>
                          ) : null}
                        </div>
                        <ChevronDown
                          className={`w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5 transition-transform ${
                            expanded ? 'rotate-180' : ''
                          }`}
                          aria-hidden
                        />
                      </button>

                      {expanded ? (
                        <div className="mx-2 mb-2 mt-0 pl-5 pr-1 pb-1 border-l-2 border-gray-200 dark:border-gray-700">
                          <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-1">
                            {isDomicilio ? 'Domicilio' : 'Recogida'}
                            {' · '}
                            {status}
                            {order.orderNumber ? ` · #${order.orderNumber}` : ''}
                          </p>
                          <ul className="space-y-0.5">
                            {items.length === 0 ? (
                              <li className="text-[11px] text-gray-400 dark:text-gray-500">Sin líneas</li>
                            ) : (
                              items.map((item) => (
                                <li
                                  key={item.id || `${item.name}-${item.quantity}`}
                                  className="text-[11px] text-gray-600 dark:text-gray-400 leading-snug"
                                >
                                  {orderItemLine(item)}
                                </li>
                              ))
                            )}
                          </ul>
                          {notes ? (
                            <p className="text-[10px] text-amber-700/90 dark:text-amber-400/90 mt-1.5 leading-snug">
                              Nota: {notes}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
