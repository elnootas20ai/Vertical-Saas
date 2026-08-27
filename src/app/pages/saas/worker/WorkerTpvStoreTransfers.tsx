import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRightLeft,
  CheckCircle2,
  Clock,
  Loader2,
  Minus,
  PackageCheck,
  Plus,
  Search,
  Send,
  Store,
  Truck,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../context/AuthContext';
import { useTpvRegisterIfOpen } from '../../../components/saas/TpvRegisterGate';
import { useStockWorkspace } from '../../../hooks/useStockWorkspace';
import { useTpvStockScope, type TpvStockScopeOverride } from '../../../hooks/useTpvStockScope';
import { quantityForWarehouse } from '../../../lib/warehouseStockQty';
import type { CatalogItem } from '../../../lib/deliveryApi';
import {
  cancelStoreTransferRequest,
  createStoreTransferRequest,
  formatTransitTime,
  listStoreTransferDestinationsRequest,
  listStoreTransfersRequest,
  receiveStoreTransferRequest,
  type StoreTransfer,
  type StoreTransferDestination,
} from '../../../lib/storeTransferApi';
import {
  STORE_TRANSFER_SYNC_EVENT,
  isStoreTransferSoundEnabled,
  playStoreTransferSound,
  setStoreTransferSoundEnabled,
  storeTransferPdvMatches,
} from '../../../lib/tpvStoreTransfers';
import {
  isTpvTabletBindingAllowedForAuth,
  readTpvTabletBinding,
} from '../../../lib/tpvTabletSession';
import { useBusiness } from '../../../context/BusinessContext';
import {
  VERTIAL_BTN_DANGER,
  VERTIAL_BTN_PRIMARY,
  VERTIAL_BTN_SECONDARY,
} from '../../../lib/vertialUiTokens';

type WorkerTpvStoreTransfersProps = {
  onBack: () => void;
  scopeOverride?: TpvStockScopeOverride;
};

type ViewMode = 'list' | 'create';

const STATUS_CHIP: Record<StoreTransfer['status'], { label: string; className: string }> = {
  in_transit: {
    label: 'En camino',
    className: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  },
  received: {
    label: 'Recibido',
    className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  },
  cancelled: {
    label: 'Cancelado',
    className: 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400',
  },
};

function formatSentAt(iso: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function elapsedSince(iso: string, nowMs: number): number {
  const start = Date.parse(iso || '');
  if (!Number.isFinite(start)) return 0;
  return Math.max(0, Math.round((nowMs - start) / 1000));
}

function itemsSummary(transfer: StoreTransfer): string {
  const parts = transfer.items.slice(0, 3).map((it) => `${it.quantity} × ${it.name || 'artículo'}`);
  const more = transfer.items.length > 3 ? ` y ${transfer.items.length - 3} más` : '';
  return parts.join(', ') + more;
}

export function WorkerTpvStoreTransfers({ onBack, scopeOverride }: WorkerTpvStoreTransfersProps) {
  const { user } = useAuth();
  const { businesses, businessesFetchSettled } = useBusiness();
  const register = useTpvRegisterIfOpen();
  const sessionPdvId = String(register?.session?.pointOfSaleId || '').trim();
  const sessionStoreLabel = String(register?.session?.pointOfSaleName || '').trim();
  const tabletWorkCenterId = useMemo(() => {
    const raw = readTpvTabletBinding();
    const allowed = isTpvTabletBindingAllowedForAuth({
      binding: raw,
      authUser: user,
      businesses,
      businessesSettled: businessesFetchSettled,
    });
    return allowed ? String(raw?.workCenterId || '').trim() : '';
  }, [user, businesses, businessesFetchSettled]);

  const mergedOverride = useMemo<TpvStockScopeOverride | undefined>(() => {
    const dataUserId = scopeOverride?.dataUserId;
    const pdvId = scopeOverride?.pdvId || sessionPdvId || undefined;
    const storeLabel = scopeOverride?.storeLabel || sessionStoreLabel || undefined;
    if (!dataUserId && !pdvId && !storeLabel) return scopeOverride;
    return { dataUserId, pdvId, storeLabel };
  }, [
    scopeOverride?.dataUserId,
    scopeOverride?.pdvId,
    scopeOverride?.storeLabel,
    sessionPdvId,
    sessionStoreLabel,
  ]);

  const tpvScope = useTpvStockScope(mergedOverride);
  const {
    dataUserId,
    storeLabel,
    storeWarehouseId,
    stockItems,
    loading: stockLoading,
    reload: reloadStock,
  } = useStockWorkspace({
    dataUserId: tpvScope.dataUserId,
    storeLabel: tpvScope.storeLabel,
    salesPointId: tpvScope.pdvId,
  });
  const pdvId = tpvScope.pdvId;
  const performedBy = String(user?.fullName || '').trim();

  const [view, setView] = useState<ViewMode>('list');
  const [soundOn, setSoundOn] = useState(() => isStoreTransferSoundEnabled());
  const [transfers, setTransfers] = useState<StoreTransfer[]>([]);
  const [transfersLoading, setTransfersLoading] = useState(true);
  const [busyTransferId, setBusyTransferId] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Crear traspaso
  const [destinations, setDestinations] = useState<StoreTransferDestination[]>([]);
  const [destinationsLoading, setDestinationsLoading] = useState(false);
  const [toPdvId, setToPdvId] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState('');
  const [sending, setSending] = useState(false);

  const reloadTransfers = useCallback(async () => {
    if (!dataUserId || !pdvId) {
      setTransfers([]);
      setTransfersLoading(false);
      return;
    }
    try {
      const list = await listStoreTransfersRequest(dataUserId, { pdvId });
      setTransfers(list);
    } catch {
      setTransfers([]);
    } finally {
      setTransfersLoading(false);
    }
  }, [dataUserId, pdvId]);

  useEffect(() => {
    setTransfersLoading(true);
    void reloadTransfers();
  }, [reloadTransfers]);

  // SSE → refrescar en vivo cuando otra tienda envía/recibe/cancela.
  useEffect(() => {
    const onSync = () => void reloadTransfers();
    window.addEventListener(STORE_TRANSFER_SYNC_EVENT, onSync);
    return () => window.removeEventListener(STORE_TRANSFER_SYNC_EVENT, onSync);
  }, [reloadTransfers]);

  // Reloj para el «lleva X min en camino».
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (view !== 'create' || !dataUserId || !pdvId) return;
    setDestinationsLoading(true);
    listStoreTransferDestinationsRequest(dataUserId, pdvId)
      .then((list) => {
        setDestinations(list);
        setToPdvId((prev) => (prev && list.some((d) => d.pdvId === prev) ? prev : list[0]?.pdvId || ''));
      })
      .catch(() => setDestinations([]))
      .finally(() => setDestinationsLoading(false));
  }, [view, dataUserId, pdvId]);

  const incoming = useMemo(
    () =>
      transfers.filter(
        (t) =>
          t.status === 'in_transit'
          && storeTransferPdvMatches(t.toPdvId, { pdvId, workCenterId: tabletWorkCenterId }),
      ),
    [transfers, pdvId, tabletWorkCenterId],
  );
  const outgoing = useMemo(
    () =>
      transfers.filter(
        (t) =>
          t.status === 'in_transit'
          && storeTransferPdvMatches(t.fromPdvId, { pdvId, workCenterId: tabletWorkCenterId }),
      ),
    [transfers, pdvId, tabletWorkCenterId],
  );
  const history = useMemo(
    () => transfers.filter((t) => t.status !== 'in_transit').slice(0, 30),
    [transfers],
  );

  const availableItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return stockItems
      .filter((i) => i.active !== false && !i.deletedAt)
      .filter((i) => quantityForWarehouse(i, storeWarehouseId) > 0)
      .filter((i) => !q || i.name.toLowerCase().includes(q) || String(i.sku || '').toLowerCase().includes(q))
      .slice(0, 30);
  }, [stockItems, query, storeWarehouseId]);

  const selectedCount = useMemo(
    () => Object.values(selected).filter((q) => q > 0).length,
    [selected],
  );

  const setQty = useCallback((item: CatalogItem, qty: number) => {
    const available = quantityForWarehouse(item, storeWarehouseId);
    const capped = Math.min(Math.max(0, Number(qty) || 0), available);
    setSelected((prev) => {
      const next = { ...prev };
      if (capped <= 0) delete next[item._id];
      else next[item._id] = capped;
      return next;
    });
  }, [storeWarehouseId]);

  const resetCreateForm = useCallback(() => {
    setSelected({});
    setNotes('');
    setQuery('');
  }, []);

  const handleSend = useCallback(async () => {
    if (!dataUserId || !pdvId) return;
    if (!toPdvId) {
      toast.error('Elige la tienda de destino');
      return;
    }
    const items = stockItems
      .filter((i) => (selected[i._id] || 0) > 0)
      .map((i) => {
        const available = quantityForWarehouse(i, storeWarehouseId);
        const qty = Math.min(selected[i._id], available);
        return {
          catalogItemId: i._id,
          name: i.name,
          sku: String(i.sku || ''),
          unit: String(i.unit || ''),
          quantity: qty,
        };
      })
      .filter((i) => i.quantity > 0);
    if (items.length === 0) {
      toast.error('Añade al menos un artículo con cantidad disponible');
      return;
    }
    setSending(true);
    try {
      await createStoreTransferRequest(dataUserId, {
        fromPdvId: pdvId,
        toPdvId,
        items,
        notes,
        performedBy,
      });
      toast.success('Traspaso enviado · en camino');
      resetCreateForm();
      setView('list');
      await Promise.all([reloadTransfers(), reloadStock()]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al enviar traspaso');
    } finally {
      setSending(false);
    }
  }, [
    dataUserId,
    pdvId,
    toPdvId,
    stockItems,
    storeWarehouseId,
    selected,
    notes,
    performedBy,
    resetCreateForm,
    reloadTransfers,
    reloadStock,
  ]);

  const handleReceive = useCallback(
    async (transfer: StoreTransfer) => {
      if (!dataUserId) return;
      setBusyTransferId(transfer._id);
      try {
        const updated = await receiveStoreTransferRequest(dataUserId, transfer._id, performedBy);
        toast.success(`Traspaso recibido en ${formatTransitTime(updated.transitSeconds)}`);
        await Promise.all([reloadTransfers(), reloadStock()]);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Error al recibir traspaso');
      } finally {
        setBusyTransferId('');
      }
    },
    [dataUserId, performedBy, reloadTransfers, reloadStock],
  );

  const handleCancel = useCallback(
    async (transfer: StoreTransfer) => {
      if (!dataUserId) return;
      setBusyTransferId(transfer._id);
      try {
        await cancelStoreTransferRequest(dataUserId, transfer._id, performedBy);
        toast.message('Traspaso cancelado · el stock vuelve a esta tienda');
        await Promise.all([reloadTransfers(), reloadStock()]);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Error al cancelar traspaso');
      } finally {
        setBusyTransferId('');
      }
    },
    [dataUserId, performedBy, reloadTransfers, reloadStock],
  );

  const inputClass =
    'w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100';

  return (
    <div className="flex flex-col h-full min-h-0 bg-gray-50 dark:bg-gray-950">
      <div className="shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={view === 'create' ? () => setView('list') : onBack}
            className="p-2 -ml-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors touch-manipulation"
            aria-label={view === 'create' ? 'Volver a traspasos' : 'Volver al TPV'}
          >
            <ArrowLeft className="w-5 h-5 text-gray-700 dark:text-gray-300" />
          </button>
          <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center shrink-0">
            <ArrowRightLeft className="w-5 h-5 text-[var(--v-blue,#2563eb)]" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">
              {view === 'create' ? 'Enviar traspaso' : 'Movimiento tienda'}
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              Traspasos de stock · {storeLabel}
            </p>
          </div>
          {view === 'list' ? (
            <>
              <button
                type="button"
                onClick={() => {
                  const next = !soundOn;
                  setSoundOn(next);
                  setStoreTransferSoundEnabled(next);
                  // Al activar suena de inmediato: sirve de prueba sin botón aparte.
                  if (next) playStoreTransferSound();
                }}
                className={`${VERTIAL_BTN_SECONDARY} !min-h-11 !min-w-11 !px-0 shrink-0 ${
                  soundOn ? '' : '!text-stone-400'
                }`}
                title={
                  soundOn
                    ? 'Sonido de traspaso entrante activado · toca para silenciar'
                    : 'Silenciado · toca para activar (sonará de prueba)'
                }
                aria-label={soundOn ? 'Silenciar sonido de traspasos' : 'Activar sonido de traspasos'}
              >
                {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => setView('create')}
                disabled={!pdvId || stockLoading}
                className={VERTIAL_BTN_PRIMARY}
              >
                <Send className="w-4 h-4" />
                Enviar traspaso
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        <div className="max-w-2xl mx-auto space-y-4 pb-10">
          {!pdvId ? (
            <p className="text-sm text-stone-500 text-center py-10">
              Abre la caja de una tienda para ver sus traspasos.
            </p>
          ) : view === 'create' ? (
            /* ─── Crear traspaso ─── */
            <div className="space-y-4">
              <section className="rounded-2xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900 p-4 space-y-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-stone-400">
                  Tienda de destino
                </p>
                {destinationsLoading ? (
                  <p className="text-sm text-stone-400">Cargando tiendas…</p>
                ) : destinations.length === 0 ? (
                  <p className="text-sm text-stone-500">
                    No hay otras tiendas activas en esta empresa.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {destinations.map((d) => {
                      const active = d.pdvId === toPdvId;
                      const label = d.code ? `${d.name} · ${d.code}` : d.name || 'Tienda';
                      return (
                        <button
                          key={d.pdvId}
                          type="button"
                          onClick={() => setToPdvId(d.pdvId)}
                          className={`inline-flex items-center gap-2 rounded-xl border-2 px-3.5 py-2 text-sm font-semibold transition-colors touch-manipulation ${
                            active
                              ? 'border-blue-300 bg-blue-50 text-[var(--v-blue,#2563eb)] dark:border-blue-800 dark:bg-blue-950/40'
                              : 'border-stone-200 bg-white text-stone-700 hover:border-stone-400 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-200'
                          }`}
                        >
                          <Store className="w-4 h-4" />
                          {label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-stone-400">
                    Artículos ({selectedCount} elegidos)
                  </p>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar artículo del almacén…"
                    className={`${inputClass} pl-9`}
                  />
                </div>
                {stockLoading ? (
                  <p className="text-sm text-stone-400 py-4 text-center">Cargando almacén…</p>
                ) : availableItems.length === 0 ? (
                  <p className="text-sm text-stone-500 py-4 text-center">
                    Sin artículos de almacén que coincidan.
                  </p>
                ) : (
                  <ul className="divide-y divide-stone-100 dark:divide-stone-800">
                    {availableItems.map((item) => {
                      const available = quantityForWarehouse(item, storeWarehouseId);
                      const qty = selected[item._id] || 0;
                      const unit = String(item.unit || 'ud');
                      return (
                        <li key={item._id} className="py-2.5 flex items-center gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-stone-900 dark:text-stone-100 truncate">
                              {item.name}
                            </p>
                            <p className="text-xs text-stone-500">
                              Disponible: {available} {unit}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => setQty(item, Math.max(0, qty - 1))}
                              disabled={qty <= 0}
                              className={`${VERTIAL_BTN_SECONDARY} !min-h-10 !min-w-10 !px-0`}
                              aria-label="Quitar uno"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              inputMode="decimal"
                              value={qty || ''}
                              onChange={(e) => {
                                const v = Number(String(e.target.value).replace(',', '.'));
                                setQty(item, Number.isFinite(v) && v > 0 ? v : 0);
                              }}
                              placeholder="0"
                              className="w-16 rounded-xl border border-stone-200 bg-white px-2 py-2 text-center text-sm font-bold text-stone-900 outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
                            />
                            <button
                              type="button"
                              onClick={() => setQty(item, qty + 1)}
                              disabled={qty >= available}
                              className={`${VERTIAL_BTN_SECONDARY} !min-h-10 !min-w-10 !px-0`}
                              aria-label="Añadir uno"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section className="rounded-2xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900 p-4 space-y-3">
                <label className="block">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-stone-400">
                    Notas (opcional)
                  </span>
                  <input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Ej: lo lleva Marcos en la furgoneta"
                    className={`${inputClass} mt-1`}
                  />
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => void handleSend()}
                    disabled={sending || !toPdvId || selectedCount === 0}
                    className={VERTIAL_BTN_PRIMARY}
                  >
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Enviar traspaso
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      resetCreateForm();
                      setView('list');
                    }}
                    className={VERTIAL_BTN_SECONDARY}
                  >
                    <X className="w-4 h-4" />
                    Cancelar
                  </button>
                </div>
                <p className="text-xs text-stone-500 leading-relaxed">
                  Al enviar, el stock sale de <strong>{storeLabel}</strong> y queda «en camino»
                  hasta que la otra tienda lo marque como recibido.
                </p>
              </section>
            </div>
          ) : (
            /* ─── Lista ─── */
            <div className="space-y-4">
              {transfersLoading ? (
                <div className="text-center py-16 text-gray-400">Cargando traspasos…</div>
              ) : (
                <>
                  {/* Entrantes en camino */}
                  {incoming.length > 0 ? (
                    <section className="space-y-2">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-stone-400 px-1">
                        En camino hacia esta tienda
                      </p>
                      {incoming.map((t) => (
                        <div
                          key={t._id}
                          className="rounded-2xl border-2 border-blue-200 bg-blue-50/60 dark:border-blue-800 dark:bg-blue-950/30 p-4 space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
                                <Truck className="w-4 h-4 text-[var(--v-blue,#2563eb)] shrink-0" />
                                Desde {t.fromPdvName || 'otra tienda'}
                              </p>
                              <p className="text-xs text-stone-600 dark:text-stone-300 mt-1">
                                {itemsSummary(t)}
                              </p>
                              {t.notes ? (
                                <p className="text-xs text-stone-500 mt-0.5 italic">«{t.notes}»</p>
                              ) : null}
                            </div>
                            <span className="inline-flex items-center gap-1 rounded-lg bg-white/80 dark:bg-stone-900/60 px-2 py-1 text-[11px] font-bold text-blue-700 dark:text-blue-300 shrink-0">
                              <Clock className="w-3.5 h-3.5" />
                              {formatTransitTime(elapsedSince(t.sentAt, nowMs))}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2 pt-1">
                            <p className="text-[11px] text-stone-500">
                              Enviado {formatSentAt(t.sentAt)}
                              {t.sentBy ? ` · ${t.sentBy}` : ''}
                            </p>
                            <button
                              type="button"
                              onClick={() => void handleReceive(t)}
                              disabled={busyTransferId === t._id}
                              className={VERTIAL_BTN_PRIMARY}
                            >
                              {busyTransferId === t._id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <PackageCheck className="w-4 h-4" />
                              )}
                              Marcar recibido
                            </button>
                          </div>
                        </div>
                      ))}
                    </section>
                  ) : null}

                  {/* Salientes en camino */}
                  {outgoing.length > 0 ? (
                    <section className="space-y-2">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-stone-400 px-1">
                        Enviados por esta tienda (en camino)
                      </p>
                      {outgoing.map((t) => (
                        <div
                          key={t._id}
                          className="rounded-2xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900 p-4 space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
                                <Send className="w-4 h-4 text-stone-400 shrink-0" />
                                Hacia {t.toPdvName || 'otra tienda'}
                              </p>
                              <p className="text-xs text-stone-600 dark:text-stone-300 mt-1">
                                {itemsSummary(t)}
                              </p>
                            </div>
                            <span className="inline-flex items-center gap-1 rounded-lg bg-stone-100 dark:bg-stone-800 px-2 py-1 text-[11px] font-bold text-stone-600 dark:text-stone-300 shrink-0">
                              <Clock className="w-3.5 h-3.5" />
                              {formatTransitTime(elapsedSince(t.sentAt, nowMs))}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2 pt-1">
                            <p className="text-[11px] text-stone-500">
                              Enviado {formatSentAt(t.sentAt)}
                              {t.sentBy ? ` · ${t.sentBy}` : ''}
                            </p>
                            <button
                              type="button"
                              onClick={() => void handleCancel(t)}
                              disabled={busyTransferId === t._id}
                              className={VERTIAL_BTN_DANGER}
                            >
                              {busyTransferId === t._id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <X className="w-4 h-4" />
                              )}
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ))}
                    </section>
                  ) : null}

                  {incoming.length === 0 && outgoing.length === 0 ? (
                    <div className="rounded-2xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900 p-6 text-center space-y-2">
                      <ArrowRightLeft className="w-8 h-8 text-stone-300 mx-auto" />
                      <p className="text-sm text-stone-500">
                        No hay traspasos en camino para esta tienda.
                      </p>
                    </div>
                  ) : null}

                  {/* Historial */}
                  {history.length > 0 ? (
                    <section className="space-y-2">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-stone-400 px-1">
                        Historial
                      </p>
                      <div className="rounded-2xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900 overflow-hidden">
                        <ul className="divide-y divide-stone-100 dark:divide-stone-800">
                          {history.map((t) => {
                            const chip = STATUS_CHIP[t.status];
                            const isOutgoing = t.fromPdvId === pdvId;
                            return (
                              <li key={t._id} className="px-4 py-3 flex items-center gap-3">
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-semibold text-stone-900 dark:text-stone-100 truncate">
                                    {isOutgoing
                                      ? `→ ${t.toPdvName || 'otra tienda'}`
                                      : `← ${t.fromPdvName || 'otra tienda'}`}
                                  </p>
                                  <p className="text-xs text-stone-500 truncate mt-0.5">
                                    {itemsSummary(t)} · {formatSentAt(t.sentAt)}
                                  </p>
                                </div>
                                <div className="shrink-0 text-right space-y-1">
                                  <span
                                    className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-bold ${chip.className}`}
                                  >
                                    {t.status === 'received' ? (
                                      <CheckCircle2 className="w-3 h-3" />
                                    ) : null}
                                    {chip.label}
                                  </span>
                                  {t.status === 'received' && t.transitSeconds > 0 ? (
                                    <p className="text-[11px] text-stone-500">
                                      en {formatTransitTime(t.transitSeconds)}
                                    </p>
                                  ) : null}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    </section>
                  ) : null}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
