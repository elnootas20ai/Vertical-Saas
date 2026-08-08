import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowRight,
  ClipboardList,
  FileText,
  Loader2,
  PackageCheck,
  Plus,
  Search,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import type { CatalogItem, Supplier } from '../../lib/deliveryApi';
import {
  createPurchaseOrderRequest,
  deletePurchaseOrderRequest,
  listPurchaseOrdersRequest,
  markOrderReceivedRequest,
  updatePurchaseOrderRequest,
  type PurchaseOrder,
  type PurchaseOrderItem,
  type PurchaseOrderStatus,
} from '../../lib/purchaseOrderApi';
import {
  SaasTabEmpty,
  SaasTabPrimaryButton,
  SaasTabSecondaryButton,
  SaasTabToolbarRow,
  SaasTabWorkspace,
} from '../../components/saas/SaasTabWorkspace';

const STATUS_META: Record<PurchaseOrderStatus, { label: string; className: string }> = {
  draft: {
    label: 'Borrador',
    className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  },
  pending: {
    label: 'Pendiente',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  },
  sent: {
    label: 'Enviado',
    className: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  },
  partial: {
    label: 'Parcial',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  },
  received: {
    label: 'Recibido',
    className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
  },
  cancelled: {
    label: 'Cancelado',
    className: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  },
};

function formatOrderDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatMoney(n: number): string {
  return `${Number(n || 0).toFixed(2)}€`;
}

// ─── Modal: nuevo pedido ──────────────────────────────────────────────────────

type DraftLine = {
  catalogItemId: string;
  sku: string;
  name: string;
  quantity: string;
  unitCost: string;
};

function NewPurchaseOrderModal({
  suppliers,
  catalogItems,
  initialSupplierId = '',
  onClose,
  onCreate,
}: {
  suppliers: Supplier[];
  catalogItems: CatalogItem[];
  initialSupplierId?: string;
  onClose: () => void;
  onCreate: (payload: Partial<PurchaseOrder>) => Promise<void>;
}) {
  const [supplierId, setSupplierId] = useState(initialSupplierId);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [itemSearch, setItemSearch] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const activeSuppliers = useMemo(
    () => suppliers.filter((s) => s.active !== false),
    [suppliers],
  );
  const supplier = activeSuppliers.find((s) => s._id === supplierId) || null;

  const buyableItems = useMemo(
    () => catalogItems.filter((i) => i.active && i.itemType !== 'service' && i.itemType !== 'combo'),
    [catalogItems],
  );

  /** Artículos que ya están vinculados a este proveedor: lo habitual de comprar. */
  const supplierItems = useMemo(
    () => (supplierId ? buyableItems.filter((i) => i.supplierId === supplierId) : []),
    [buyableItems, supplierId],
  );

  const searchResults = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    if (!q) return [];
    return buyableItems
      .filter((i) => (i.name || '').toLowerCase().includes(q))
      .slice(0, 8);
  }, [buyableItems, itemSearch]);

  const addItem = (item: CatalogItem) => {
    setLines((prev) => {
      if (prev.some((l) => l.catalogItemId === item._id)) return prev;
      return [
        ...prev,
        {
          catalogItemId: item._id,
          sku: item.sku || '',
          name: item.name || '',
          quantity: String(item.reorderQuantity || 1),
          unitCost: String(item.costPrice ?? 0),
        },
      ];
    });
    setItemSearch('');
  };

  const addAllSupplierItems = () => {
    for (const item of supplierItems) addItem(item);
  };

  const updateLine = (catalogItemId: string, patch: Partial<DraftLine>) => {
    setLines((prev) => prev.map((l) => (l.catalogItemId === catalogItemId ? { ...l, ...patch } : l)));
  };

  const removeLine = (catalogItemId: string) => {
    setLines((prev) => prev.filter((l) => l.catalogItemId !== catalogItemId));
  };

  const parsedLines = useMemo(
    () =>
      lines.map((l) => {
        const quantity = Math.max(0, Number(String(l.quantity).replace(',', '.')) || 0);
        const unitCost = Math.max(0, Number(String(l.unitCost).replace(',', '.')) || 0);
        return { ...l, quantityNum: quantity, unitCostNum: unitCost, total: quantity * unitCost };
      }),
    [lines],
  );

  const subtotal = parsedLines.reduce((s, l) => s + l.total, 0);
  const taxAmount = subtotal * 0.21;
  const total = subtotal + taxAmount;
  const canSave = parsedLines.length > 0 && parsedLines.every((l) => l.quantityNum > 0) && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const items: PurchaseOrderItem[] = parsedLines.map((l, idx) => ({
        id: `poi-${Date.now()}-${idx}`,
        catalogItemId: l.catalogItemId,
        sku: l.sku,
        name: l.name,
        quantity: l.quantityNum,
        unitCost: l.unitCostNum,
        total: l.total,
        received: 0,
        notes: '',
      }));
      await onCreate({
        supplierId: supplier?._id || '',
        supplierName: supplier?.name || 'Sin proveedor',
        items,
        subtotal,
        taxRate: 21,
        taxAmount,
        total,
        status: 'draft',
        source: 'manual',
        urgency: 'normal',
        notes: notes.trim(),
      });
      onClose();
    } catch {
      toast.error('No se pudo crear el pedido');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/45 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Nuevo pedido a proveedor</h2>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Proveedor</label>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-semibold text-gray-900 dark:text-gray-100"
            >
              <option value="">Sin proveedor asignado</option>
              {activeSuppliers.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </select>
            {activeSuppliers.length === 0 ? (
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                No tienes proveedores dados de alta. Puedes crear el pedido sin proveedor y añadirlos en la pestaña Proveedores.
              </p>
            ) : null}
          </div>

          {supplierId && supplierItems.length > 0 ? (
            <div className="rounded-xl border border-blue-100 dark:border-blue-900/40 bg-blue-50/50 dark:bg-blue-950/20 p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-xs font-bold text-blue-800 dark:text-blue-300">
                  Lo que sueles comprar a {supplier?.name} ({supplierItems.length})
                </p>
                <button
                  type="button"
                  onClick={addAllSupplierItems}
                  className="text-xs font-semibold text-[var(--v-blue,#2563eb)] hover:underline shrink-0"
                >
                  Añadir todo
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {supplierItems.slice(0, 12).map((item) => {
                  const added = lines.some((l) => l.catalogItemId === item._id);
                  return (
                    <button
                      key={item._id}
                      type="button"
                      onClick={() => addItem(item)}
                      disabled={added}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                        added
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300 cursor-default'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
                      }`}
                    >
                      {added ? '✓ ' : '+ '}
                      {item.name}
                    </button>
                  );
                })}
                {supplierItems.length > 12 ? (
                  <span className="px-2 py-1 text-xs text-gray-400">+{supplierItems.length - 12} más (usa el buscador)</span>
                ) : null}
              </div>
            </div>
          ) : null}

          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Añadir artículo</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={itemSearch}
                onChange={(e) => setItemSearch(e.target.value)}
                placeholder="Busca en tu catálogo/almacén…"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
              />
            </div>
            {searchResults.length > 0 ? (
              <ul className="mt-1 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden">
                {searchResults.map((item) => (
                  <li key={item._id}>
                    <button
                      type="button"
                      onClick={() => addItem(item)}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <span className="min-w-0 truncate font-medium text-gray-900 dark:text-gray-100">{item.name}</span>
                      <span className="text-xs text-gray-400 tabular-nums shrink-0">
                        coste {formatMoney(Number(item.costPrice || 0))}
                        {item.supplierName ? ` · ${item.supplierName}` : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {parsedLines.length > 0 ? (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50/80 dark:bg-gray-900/40 text-gray-500 text-xs">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">Artículo</th>
                    <th className="text-right px-3 py-2 font-semibold w-20">Cant.</th>
                    <th className="text-right px-3 py-2 font-semibold w-24">Coste/u</th>
                    <th className="text-right px-3 py-2 font-semibold w-20">Total</th>
                    <th className="w-9" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {parsedLines.map((l) => (
                    <tr key={l.catalogItemId}>
                      <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">{l.name}</td>
                      <td className="px-2 py-1.5 text-right">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={l.quantity}
                          onChange={(e) => updateLine(l.catalogItemId, { quantity: e.target.value })}
                          className="w-16 px-1.5 py-1 text-right text-sm tabular-nums rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={l.unitCost}
                          onChange={(e) => updateLine(l.catalogItemId, { unitCost: e.target.value })}
                          className="w-20 px-1.5 py-1 text-right text-sm tabular-nums rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800"
                        />
                      </td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatMoney(l.total)}</td>
                      <td className="px-1 py-1.5 text-center">
                        <button
                          type="button"
                          onClick={() => removeLine(l.catalogItemId)}
                          className="p-1 rounded-lg text-gray-300 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                          title="Quitar línea"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-4 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
              Añade artículos al pedido con el buscador o los accesos del proveedor.
            </p>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Notas (opcional)</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej: entregar antes del viernes"
              className="w-full px-3 py-2.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
            />
          </div>
        </div>

        <div className="shrink-0 px-5 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3">
          <p className="text-sm text-gray-600 dark:text-gray-400 tabular-nums">
            Subtotal {formatMoney(subtotal)} · IVA 21% {formatMoney(taxAmount)} ·{' '}
            <span className="font-bold text-gray-900 dark:text-gray-100">Total {formatMoney(total)}</span>
          </p>
          <div className="flex gap-2 shrink-0">
            <SaasTabSecondaryButton onClick={onClose}>Cancelar</SaasTabSecondaryButton>
            <SaasTabPrimaryButton onClick={() => void handleSave()} disabled={!canSave}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Crear pedido
            </SaasTabPrimaryButton>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────

/**
 * Pedidos a proveedores — flujo: crear borrador → enviar → recibir (suma stock)
 * → registrar factura en la pestaña Facturas.
 */
export function PurchaseOrdersPage({
  suppliers = [],
  catalogItems = [],
  onGoToInvoices,
}: {
  suppliers?: Supplier[];
  catalogItems?: CatalogItem[];
  onGoToInvoices?: () => void;
}) {
  const { user } = useAuth();
  const userId = String(user?.id || '').trim();

  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createSupplierId, setCreateSupplierId] = useState('');
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [cleaningDrafts, setCleaningDrafts] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  // Llegada desde Proveedores («Pedir»): abre el modal con el proveedor preseleccionado.
  useEffect(() => {
    const supplierParam = searchParams.get('supplier');
    if (!supplierParam) return;
    setCreateSupplierId(supplierParam);
    setShowCreate(true);
    const next = new URLSearchParams(searchParams);
    next.delete('supplier');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const list = await listPurchaseOrdersRequest(userId);
      setOrders(
        [...list].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))),
      );
    } catch {
      toast.error('No se pudieron cargar los pedidos');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const markBusy = (id: string, busy: boolean) => {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const stats = useMemo(() => {
    const drafts = orders.filter((o) => o.status === 'draft').length;
    const open = orders.filter((o) => ['pending', 'sent', 'partial'].includes(o.status)).length;
    const received = orders.filter((o) => o.status === 'received').length;
    return [
      { label: 'pedidos', value: orders.length },
      { label: 'borradores', value: drafts },
      { label: 'en curso', value: open, tone: 'amber' as const },
      { label: 'recibidos', value: received, tone: 'emerald' as const },
    ];
  }, [orders]);

  const draftOrders = useMemo(
    () => orders.filter((o) => o.status === 'draft' && (o.source === 'auto' || !o.source)),
    [orders],
  );

  const handleCreate = async (payload: Partial<PurchaseOrder>) => {
    if (!userId) return;
    const created = await createPurchaseOrderRequest(userId, payload);
    setOrders((prev) => [created, ...prev]);
    toast.success(`Pedido ${created.orderNumber || ''} creado en borrador`);
  };

  const handleSend = async (order: PurchaseOrder) => {
    if (!userId) return;
    markBusy(order._id, true);
    try {
      const updated = await updatePurchaseOrderRequest(userId, {
        ...order,
        status: 'sent',
        sentAt: new Date().toISOString(),
        sentVia: order.sentVia || 'manual',
      });
      setOrders((prev) => prev.map((o) => (o._id === updated._id ? updated : o)));
      toast.success('Pedido marcado como enviado');
    } catch {
      toast.error('No se pudo marcar como enviado');
    } finally {
      markBusy(order._id, false);
    }
  };

  const handleReceive = async (order: PurchaseOrder) => {
    if (!userId) return;
    const lineCount = order.items?.length ?? 0;
    if (!window.confirm(`¿Marcar como recibido? Se sumará el stock de ${lineCount} línea${lineCount !== 1 ? 's' : ''}.`)) {
      return;
    }
    markBusy(order._id, true);
    try {
      const updated = await markOrderReceivedRequest(userId, order._id);
      setOrders((prev) => prev.map((o) => (o._id === updated._id ? updated : o)));
      toast.success('Pedido recibido: stock actualizado. Registra la factura cuando llegue.');
    } catch {
      toast.error('No se pudo marcar como recibido');
    } finally {
      markBusy(order._id, false);
    }
  };

  const handleDelete = async (order: PurchaseOrder) => {
    if (!userId) return;
    if (!window.confirm(`¿Eliminar el pedido ${order.orderNumber || ''} de ${order.supplierName || 'proveedor'}?`)) {
      return;
    }
    markBusy(order._id, true);
    try {
      await deletePurchaseOrderRequest(userId, order._id);
      setOrders((prev) => prev.filter((o) => o._id !== order._id));
      toast.success('Pedido eliminado');
    } catch {
      toast.error('No se pudo eliminar el pedido');
    } finally {
      markBusy(order._id, false);
    }
  };

  const handleCleanDrafts = async () => {
    if (!userId || draftOrders.length === 0) return;
    if (!window.confirm(`¿Eliminar los ${draftOrders.length} borradores automáticos antiguos? Esta acción no se puede deshacer.`)) {
      return;
    }
    setCleaningDrafts(true);
    let ok = 0;
    let fail = 0;
    for (const order of draftOrders) {
      try {
        await deletePurchaseOrderRequest(userId, order._id);
        ok += 1;
      } catch {
        fail += 1;
      }
    }
    await load();
    if (ok > 0) toast.success(`${ok} borrador${ok !== 1 ? 'es' : ''} eliminado${ok !== 1 ? 's' : ''}`);
    if (fail > 0) toast.error(`${fail} no se pudieron eliminar`);
    setCleaningDrafts(false);
  };

  return (
    <SaasTabWorkspace
      stats={stats}
      toolbar={
        <SaasTabToolbarRow
          right={
            <>
              {draftOrders.length > 0 ? (
                <SaasTabSecondaryButton
                  onClick={() => void handleCleanDrafts()}
                  disabled={cleaningDrafts}
                  title="Elimina los borradores creados automáticamente por el flujo antiguo"
                >
                  {cleaningDrafts ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  Limpiar automáticos ({draftOrders.length})
                </SaasTabSecondaryButton>
              ) : null}
              <SaasTabPrimaryButton onClick={() => setShowCreate(true)}>
                <Plus className="w-3.5 h-3.5" />
                Nuevo pedido
              </SaasTabPrimaryButton>
            </>
          }
        />
      }
    >
      {loading ? (
        <div className="flex items-center justify-center py-12 text-gray-500 dark:text-gray-400 text-sm">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Cargando pedidos…
        </div>
      ) : orders.length === 0 ? (
        <SaasTabEmpty
          icon={<ClipboardList className="w-10 h-10" />}
          title="Sin pedidos a proveedores"
          description="Crea un pedido, márcalo enviado cuando lo pidas y recíbelo cuando llegue: el stock se suma solo."
          action={
            <SaasTabPrimaryButton onClick={() => setShowCreate(true)}>
              <Plus className="w-3.5 h-3.5" />
              Nuevo pedido
            </SaasTabPrimaryButton>
          }
        />
      ) : (
        <>
        {/* Móvil: tarjetas de pedido */}
        <ul className="md:hidden divide-y divide-gray-100 dark:divide-gray-800">
          {orders.map((order) => {
            const status = STATUS_META[order.status] ?? STATUS_META.draft;
            const busy = busyIds.has(order._id);
            return (
              <li key={order._id} className="px-3 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">
                        {order.orderNumber || 'Pedido'}
                      </p>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${status.className}`}>
                        {status.label}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                      {order.supplierName || 'Sin proveedor'} · {order.items.length} línea{order.items.length !== 1 ? 's' : ''} · {formatOrderDate(order.createdAt)}
                    </p>
                    <p className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-0.5 tabular-nums">
                      {formatMoney(order.total)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleDelete(order)}
                    disabled={busy}
                    className="p-2 rounded-lg text-gray-400 hover:text-red-600 disabled:opacity-40 shrink-0"
                    title="Eliminar pedido"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {busy ? (
                    <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                  ) : (
                    <>
                      {order.status === 'draft' ? (
                        <button
                          type="button"
                          onClick={() => void handleSend(order)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[var(--v-blue,#2563eb)] border border-blue-200 dark:border-blue-900"
                        >
                          <Send className="w-3.5 h-3.5" />
                          Enviar
                        </button>
                      ) : null}
                      {['sent', 'pending', 'partial'].includes(order.status) ? (
                        <button
                          type="button"
                          onClick={() => void handleReceive(order)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-emerald-700 border border-emerald-200 dark:text-emerald-400 dark:border-emerald-900"
                        >
                          <PackageCheck className="w-3.5 h-3.5" />
                          Recibir
                        </button>
                      ) : null}
                      {order.status === 'received' ? (
                        order.purchaseInvoiceId ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 px-2 py-1">
                            <FileText className="w-3.5 h-3.5" />
                            Factura ✓
                          </span>
                        ) : onGoToInvoices ? (
                          <button
                            type="button"
                            onClick={onGoToInvoices}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-gray-600 border border-gray-200 dark:text-gray-300 dark:border-gray-700"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            Factura
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        ) : null
                      ) : null}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {/* Desktop: tabla completa */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="bg-gray-50/80 dark:bg-gray-900/40 border-b border-gray-100 dark:border-gray-700">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Pedido</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Proveedor</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Estado</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Fecha</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Total</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {orders.map((order) => {
                const status = STATUS_META[order.status] ?? STATUS_META.draft;
                const busy = busyIds.has(order._id);
                return (
                  <tr key={order._id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                        {order.orderNumber || '—'}
                      </span>
                      <span className="block text-[11px] text-gray-400 dark:text-gray-500" title={order.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}>
                        {order.items.length} línea{order.items.length !== 1 ? 's' : ''}
                        {order.notes ? ` · ${order.notes}` : ''}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                      {order.supplierName || 'Sin proveedor'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${status.className}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 tabular-nums">
                      {formatOrderDate(order.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                      {formatMoney(order.total)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {busy ? (
                          <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                        ) : (
                          <>
                            {order.status === 'draft' ? (
                              <button
                                type="button"
                                onClick={() => void handleSend(order)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[var(--v-blue,#2563eb)] border border-blue-200 hover:bg-blue-50 dark:border-blue-900 dark:hover:bg-blue-950/30 transition-colors"
                                title="Marcar como enviado al proveedor"
                              >
                                <Send className="w-3.5 h-3.5" />
                                Enviar
                              </button>
                            ) : null}
                            {['sent', 'pending', 'partial'].includes(order.status) ? (
                              <button
                                type="button"
                                onClick={() => void handleReceive(order)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-emerald-700 border border-emerald-200 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-900 dark:hover:bg-emerald-950/30 transition-colors"
                                title="Marcar como recibido: suma el stock"
                              >
                                <PackageCheck className="w-3.5 h-3.5" />
                                Recibir
                              </button>
                            ) : null}
                            {order.status === 'received' ? (
                              order.purchaseInvoiceId ? (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 px-2 py-1">
                                  <FileText className="w-3.5 h-3.5" />
                                  Factura ✓
                                </span>
                              ) : onGoToInvoices ? (
                                <button
                                  type="button"
                                  onClick={onGoToInvoices}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 dark:text-gray-300 dark:border-gray-700 dark:hover:bg-gray-800 transition-colors"
                                  title="Registrar la factura de este pedido en la pestaña Facturas"
                                >
                                  <FileText className="w-3.5 h-3.5" />
                                  Factura
                                  <ArrowRight className="w-3 h-3" />
                                </button>
                              ) : null
                            ) : null}
                            <button
                              type="button"
                              onClick={() => void handleDelete(order)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-950/30 transition-colors"
                              title="Eliminar pedido"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}

      {showCreate ? (
        <NewPurchaseOrderModal
          suppliers={suppliers}
          catalogItems={catalogItems}
          initialSupplierId={createSupplierId}
          onClose={() => {
            setShowCreate(false);
            setCreateSupplierId('');
          }}
          onCreate={handleCreate}
        />
      ) : null}
    </SaasTabWorkspace>
  );
}
