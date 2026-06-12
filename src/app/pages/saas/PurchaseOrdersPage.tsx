import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useModalClose } from '../../hooks/useModalClose';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';
import { Tabs } from '../../components/saas/Tabs';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { resolveBusinessDataUserId } from '../../lib/tenantUserId';
import { useTranslation } from 'react-i18next';
import { listSuppliersRequest, listCatalogItemsRequest, type Supplier, type CatalogItem } from '../../lib/deliveryApi';
import {
  listPurchaseOrdersRequest,
  createPurchaseOrderRequest,
  updatePurchaseOrderRequest,
  deletePurchaseOrderRequest,
  triggerAutoOrdersRequest,
  getLowStockReportRequest,
  markOrderReceivedRequest,
  sendPurchaseOrderRequest,
  type PurchaseOrder,
  type PurchaseOrderItem,
  type PurchaseOrderStatus,
  type LowStockItem,
  getSmartPurchaseListRequest,
  createBulkPurchaseOrdersRequest,
  type SmartListItem,
  type PurchaseOrderUrgency,
} from '../../lib/purchaseOrderApi';
import { StockPurchaseListPreview } from '../../components/saas/StockPurchaseListPreview';
import {
  Plus, Search, X, Trash2, Edit3, CheckCircle2, Clock, AlertTriangle, Minus, Package,
  ShoppingBag, Zap, TrendingDown, Send, Archive, Eye, RotateCcw, Factory,
  ChevronDown, Filter, ArrowUpDown, LayoutList, LayoutGrid, FileText, Truck,
  ChevronRight, CircleDot, MoreHorizontal, CalendarDays, Hash, Receipt,
  Mail, MessageCircle, Globe,
} from 'lucide-react';
import { NewOrderWizard } from './NewOrderWizard';
import { OrderReceptionView } from './OrderReceptionView';
import { useWorkCenters } from '../../hooks/useWorkCenters';

/* ─── Status config ─────────────────────────────────────────────────────────── */

const STATUS_CONFIG: Record<PurchaseOrderStatus, { label: string; color: string; bg: string; icon: typeof Clock }> = {
  draft:     { label: 'Borrador',  color: 'text-gray-600 dark:text-gray-400',   bg: 'bg-gray-100 dark:bg-gray-700/60',                      icon: FileText },
  pending:   { label: 'Pendiente', color: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20',                     icon: Clock },
  sent:      { label: 'Enviado',   color: 'text-blue-700 dark:text-blue-400',   bg: 'bg-blue-50 dark:bg-blue-900/20',                       icon: Send },
  partial:   { label: 'Parcial',   color: 'text-purple-700 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-900/20',                 icon: Truck },
  received:  { label: 'Recibido',  color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20',             icon: CheckCircle2 },
  cancelled: { label: 'Cancelado', color: 'text-red-600 dark:text-red-400',     bg: 'bg-red-50 dark:bg-red-900/20',                         icon: X },
};

const STATUS_PIPELINE: PurchaseOrderStatus[] = ['draft', 'pending', 'sent', 'received'];

const SOURCE_LABEL: Record<string, string> = { auto: 'Automático', manual: 'Manual' };

const URGENCY_CONFIG: Record<string, { label: string; color: string; bg: string; icon: typeof AlertTriangle }> = {
  normal:   { label: 'Normal',   color: 'text-gray-500 dark:text-gray-400',  bg: 'bg-gray-100 dark:bg-gray-700/60',  icon: Clock },
  high:     { label: 'Alta',     color: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20', icon: AlertTriangle },
  critical: { label: 'Crítica',  color: 'text-red-700 dark:text-red-400',    bg: 'bg-red-50 dark:bg-red-900/20',     icon: AlertTriangle },
};

/* ─── Status Badge ──────────────────────────────────────────────────────────── */

function StatusBadge({ status }: { status: PurchaseOrderStatus }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg ${cfg.bg} ${cfg.color}`}>
      <Icon className="w-3.5 h-3.5" />
      {cfg.label}
    </span>
  );
}

function UrgencyBadge({ urgency }: { urgency: string }) {
  if (!urgency || urgency === 'normal') return null;
  const cfg = URGENCY_CONFIG[urgency] || URGENCY_CONFIG.normal;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-lg ${cfg.bg} ${cfg.color} ${urgency === 'critical' ? 'animate-pulse' : ''}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

/* ─── Status Pipeline (mini progress bar) ───────────────────────────────────── */

function StatusPipeline({ status }: { status: PurchaseOrderStatus }) {
  if (status === 'cancelled') {
    return <span className="text-xs text-red-500 dark:text-red-400 font-medium italic">Cancelado</span>;
  }
  const idx = STATUS_PIPELINE.indexOf(status);
  const activeIdx = idx >= 0 ? idx : 0;
  return (
    <div className="flex items-center gap-0.5">
      {STATUS_PIPELINE.map((s, i) => {
        const done = i <= activeIdx;
        return (
          <div key={s} className="flex items-center gap-0.5">
            <div
              className={`w-2 h-2 rounded-full transition-colors ${
                done ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-gray-200 dark:bg-gray-600'
              }`}
              title={STATUS_CONFIG[s].label}
            />
            {i < STATUS_PIPELINE.length - 1 && (
              <div className={`w-3 h-0.5 ${i < activeIdx ? 'bg-emerald-400 dark:bg-emerald-500' : 'bg-gray-200 dark:bg-gray-600'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Create / Edit Modal ───────────────────────────────────────────────────── */

interface CreateOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<PurchaseOrder>) => void;
  suppliers: Supplier[];
  catalogItems: CatalogItem[];
  editItem?: PurchaseOrder | null;
}

function CreateOrderModal({ isOpen, onClose, onSave, suppliers, catalogItems, editItem }: CreateOrderModalProps) {
  const [form, setForm] = useState({ supplierId: '', supplierName: '', taxRate: '21', expectedDate: '', notes: '' });
  const [lines, setLines] = useState<{ catalogItemId: string; name: string; quantity: string; unitCost: string }[]>([{ catalogItemId: '', name: '', quantity: '', unitCost: '' }]);

  useEffect(() => {
    if (editItem) {
      setForm({
        supplierId: editItem.supplierId || '', supplierName: editItem.supplierName || '',
        taxRate: String(editItem.taxRate ?? 21), expectedDate: editItem.expectedDate?.slice(0, 10) || '',
        notes: editItem.notes || '',
      });
      setLines(editItem.items.length > 0
        ? editItem.items.map(l => ({ catalogItemId: l.catalogItemId || '', name: l.name, quantity: String(l.quantity), unitCost: String(l.unitCost) }))
        : [{ catalogItemId: '', name: '', quantity: '', unitCost: '' }]);
    } else {
      setForm({ supplierId: '', supplierName: '', taxRate: '21', expectedDate: '', notes: '' });
      setLines([{ catalogItemId: '', name: '', quantity: '', unitCost: '' }]);
    }
  }, [editItem, isOpen]);

  if (!isOpen) return null;

  const addLine = () => setLines(prev => [...prev, { catalogItemId: '', name: '', quantity: '', unitCost: '' }]);
  const removeLine = (idx: number) => { if (lines.length <= 1) return; setLines(prev => prev.filter((_, i) => i !== idx)); };
  const updateLine = (idx: number, field: string, value: string) => setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));

  const handleSelectCatalogItem = (idx: number, itemId: string) => {
    const item = catalogItems.find(i => i._id === itemId);
    if (item) {
      setLines(prev => prev.map((l, i) => i === idx ? { ...l, catalogItemId: item._id, name: item.name, unitCost: String(item.costPrice || '') } : l));
    }
  };

  const handleSelectSupplier = (supplierId: string) => {
    const supplier = suppliers.find(s => s._id === supplierId);
    setForm(f => ({ ...f, supplierId, supplierName: supplier?.name || '' }));
  };

  const computedItems: PurchaseOrderItem[] = lines.filter(l => l.name.trim()).map((l, i) => ({
    id: editItem?.items[i]?.id || `poi-${Date.now()}-${i}`,
    catalogItemId: l.catalogItemId, sku: '', name: l.name,
    quantity: Number(l.quantity) || 0, unitCost: Number(l.unitCost) || 0,
    total: (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), received: 0, notes: '',
  }));

  const subtotal = computedItems.reduce((s, l) => s + l.total, 0);
  const taxRate = Number(form.taxRate) || 0;
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.supplierName.trim()) { toast.error('Selecciona un proveedor'); return; }
    if (computedItems.length === 0) { toast.error('Añade al menos una línea'); return; }
    onSave({
      ...editItem, supplierId: form.supplierId, supplierName: form.supplierName,
      items: computedItems, subtotal, taxRate, taxAmount, total,
      expectedDate: form.expectedDate, notes: form.notes,
      status: editItem?.status || 'draft', source: editItem?.source || 'manual',
    });
  };

  const ic = 'w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-400 dark:focus:border-gray-500 focus:ring-2 focus:ring-gray-100 dark:focus:ring-gray-800 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 transition-all';
  const lc = 'block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-700/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-900 dark:bg-gray-100 rounded-xl flex items-center justify-center">
              {editItem ? <Edit3 className="w-5 h-5 text-white dark:text-gray-900" /> : <Plus className="w-5 h-5 text-white dark:text-gray-900" />}
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{editItem ? 'Editar pedido' : 'Nuevo pedido de compra'}</h2>
              <p className="text-sm text-gray-400 dark:text-gray-500">{editItem ? 'Modifica los datos del pedido' : 'Crea un pedido manual a proveedor'}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <form id="po-form" onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={lc}>Proveedor *</label>
              {suppliers.length > 0 ? (
                <select className={ic} value={form.supplierId} onChange={e => handleSelectSupplier(e.target.value)}>
                  <option value="">Seleccionar proveedor</option>
                  {suppliers.filter(s => s.active).map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
                </select>
              ) : (
                <input className={ic} placeholder="Nombre del proveedor" value={form.supplierName} onChange={e => setForm(f => ({ ...f, supplierName: e.target.value }))} />
              )}
            </div>
            <div><label className={lc}>% IVA</label><input type="number" className={ic} value={form.taxRate} onChange={e => setForm(f => ({ ...f, taxRate: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className={lc}>Fecha entrega esperada</label><input type="date" className={ic} value={form.expectedDate} onChange={e => setForm(f => ({ ...f, expectedDate: e.target.value }))} /></div>
            <div />
          </div>

          {/* Lines */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Artículos del pedido</label>
              <button type="button" onClick={addLine} className="px-3 py-1.5 text-xs font-semibold bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg hover:bg-black dark:hover:bg-white transition-colors flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Línea
              </button>
            </div>
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="hidden sm:grid grid-cols-[1fr_5rem_6rem_5rem_2.5rem] gap-0 bg-gray-50 dark:bg-gray-900/60 px-3 py-2 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                <span>Artículo</span><span className="text-right">Cant.</span><span className="text-right">Coste</span><span className="text-right">Total</span><span />
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-700/60">
                {lines.map((line, idx) => (
                  <div key={idx} className="grid grid-cols-1 sm:grid-cols-[1fr_5rem_6rem_5rem_2.5rem] gap-2 sm:gap-0 px-3 py-2.5 items-center">
                    <div className="relative">
                      <input className="w-full px-2.5 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm outline-none focus:border-gray-400 dark:focus:border-gray-500 transition-colors" placeholder="Artículo" value={line.name} onChange={e => updateLine(idx, 'name', e.target.value)} />
                      {catalogItems.length > 0 && !line.name && (
                        <select className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => { if (e.target.value) handleSelectCatalogItem(idx, e.target.value); }}>
                          <option value="">Seleccionar del catálogo...</option>
                          {catalogItems.filter(ci => !form.supplierId || ci.supplierId === form.supplierId || !ci.supplierId).map(item => <option key={item._id} value={item._id}>{item.name} — {item.costPrice.toFixed(2)}€</option>)}
                        </select>
                      )}
                    </div>
                    <input type="number" className="w-full px-2.5 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm text-right outline-none focus:border-gray-400 dark:focus:border-gray-500 transition-colors" placeholder="0" value={line.quantity} onChange={e => updateLine(idx, 'quantity', e.target.value)} />
                    <input type="number" step="0.01" className="w-full px-2.5 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm text-right outline-none focus:border-gray-400 dark:focus:border-gray-500 transition-colors" placeholder="0.00" value={line.unitCost} onChange={e => updateLine(idx, 'unitCost', e.target.value)} />
                    <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 text-right tabular-nums">{((Number(line.quantity) || 0) * (Number(line.unitCost) || 0)).toFixed(2)}€</div>
                    <button type="button" onClick={() => removeLine(idx)} className="p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors justify-self-center" disabled={lines.length <= 1}>
                      <Minus className={`w-4 h-4 ${lines.length <= 1 ? 'text-gray-200 dark:text-gray-700' : 'text-red-400'}`} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-3 p-4 bg-gray-50 dark:bg-gray-900/40 rounded-xl text-sm space-y-1.5 tabular-nums">
              <div className="flex justify-between text-gray-500 dark:text-gray-400"><span>Subtotal</span><span>{subtotal.toFixed(2)}€</span></div>
              <div className="flex justify-between text-gray-500 dark:text-gray-400"><span>IVA ({taxRate}%)</span><span>{taxAmount.toFixed(2)}€</span></div>
              <div className="flex justify-between font-bold text-gray-900 dark:text-gray-100 pt-2 border-t border-gray-200 dark:border-gray-700 text-base"><span>Total</span><span>{total.toFixed(2)}€</span></div>
            </div>
          </div>

          <div><label className={lc}>Notas</label><textarea rows={2} className={`${ic} resize-none`} placeholder="Notas adicionales..." value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
        </form>
        <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700/60 px-6 py-4 flex gap-3 rounded-b-2xl">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-3 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">Cancelar</button>
          <button type="submit" form="po-form" className="flex-1 px-4 py-3 bg-gray-900 hover:bg-black dark:bg-gray-100 dark:hover:bg-white dark:text-gray-900 text-white rounded-xl font-semibold transition-colors">{editItem ? 'Guardar cambios' : 'Crear pedido'}</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Detail Modal ──────────────────────────────────────────────────────────── */

interface DetailModalProps {
  order: PurchaseOrder | null;
  onClose: () => void;
  onStatusChange: (order: PurchaseOrder, status: PurchaseOrderStatus) => void;
  onReceive: (order: PurchaseOrder) => void;
  onSend?: (order: PurchaseOrder, method: 'email' | 'whatsapp' | 'portal') => void;
  sendingOrderId?: string | null;
}

function DetailModal({ order, onClose, onStatusChange, onReceive, onSend, sendingOrderId }: DetailModalProps) {
  if (!order) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="p-6 border-b border-gray-100 dark:border-gray-700/60">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center">
                <Receipt className="w-6 h-6 text-gray-500 dark:text-gray-400" />
              </div>
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{order.orderNumber}</h2>
                  <StatusBadge status={order.status} />
                  {order.source === 'auto' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold bg-violet-50 text-violet-600 dark:bg-violet-900/20 dark:text-violet-400 rounded-lg">
                      <Zap className="w-3 h-3" /> Auto
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">{order.supplierName || 'Sin proveedor'}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"><X className="w-5 h-5 text-gray-400" /></button>
          </div>

          {/* Pipeline */}
          <div className="mt-4 flex items-center gap-1">
            {STATUS_PIPELINE.map((s, i) => {
              const active = STATUS_PIPELINE.indexOf(order.status) >= i || (order.status === 'cancelled' && false);
              const current = order.status === s;
              return (
                <div key={s} className="flex items-center gap-1 flex-1">
                  <div className={`h-1.5 flex-1 rounded-full transition-colors ${active ? 'bg-emerald-400 dark:bg-emerald-500' : 'bg-gray-100 dark:bg-gray-700'} ${current ? 'ring-2 ring-emerald-200 dark:ring-emerald-800' : ''}`} />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mt-1.5 text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">
            {STATUS_PIPELINE.map(s => <span key={s}>{STATUS_CONFIG[s].label}</span>)}
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Meta */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Creado', value: order.createdAt ? new Date(order.createdAt).toLocaleDateString('es-ES') : '-', icon: CalendarDays },
              { label: 'Entrega esperada', value: order.expectedDate ? new Date(order.expectedDate).toLocaleDateString('es-ES') : '-', icon: Truck },
              { label: 'Origen', value: SOURCE_LABEL[order.source] || order.source, icon: order.source === 'auto' ? Zap : FileText },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="bg-gray-50 dark:bg-gray-900/40 rounded-xl p-3">
                <div className="flex items-center gap-1.5 mb-1"><Icon className="w-3.5 h-3.5 text-gray-400" /><span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">{label}</span></div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{value}</p>
              </div>
            ))}
          </div>

          {/* Items table */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 mb-2.5 uppercase tracking-wider">Artículos ({order.items.length})</h3>
            <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900/60">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Artículo</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Cant.</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Coste</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Total</th>
                    {(order.status === 'received' || order.status === 'partial') && <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Recibido</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                  {order.items.map((item, idx) => (
                    <tr key={idx} className="hover:bg-gray-50/60 dark:hover:bg-gray-700/20 transition-colors">
                      <td className="px-4 py-2.5 text-gray-900 dark:text-gray-100 font-medium">{item.name}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600 dark:text-gray-300 tabular-nums">{item.quantity}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600 dark:text-gray-300 tabular-nums">{Number(item.unitCost).toFixed(2)}€</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{Number(item.total).toFixed(2)}€</td>
                      {(order.status === 'received' || order.status === 'partial') && (
                        <td className="px-4 py-2.5 text-right text-emerald-600 dark:text-emerald-400 font-semibold tabular-nums">{item.received}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 p-4 bg-gray-50 dark:bg-gray-900/40 rounded-xl text-sm space-y-1.5 tabular-nums">
              <div className="flex justify-between text-gray-500 dark:text-gray-400"><span>Subtotal</span><span>{order.subtotal.toFixed(2)}€</span></div>
              <div className="flex justify-between text-gray-500 dark:text-gray-400"><span>IVA ({order.taxRate}%)</span><span>{order.taxAmount.toFixed(2)}€</span></div>
              <div className="flex justify-between font-bold text-gray-900 dark:text-gray-100 pt-2 border-t border-gray-200 dark:border-gray-700 text-base"><span>Total</span><span>{order.total.toFixed(2)}€</span></div>
            </div>
          </div>

          {order.notes && (
            <div className="p-4 bg-amber-50/60 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800/30 rounded-xl text-sm text-gray-600 dark:text-gray-400">
              <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider block mb-1">Notas</span>
              {order.notes}
            </div>
          )}
        </div>

        {/* Send actions */}
        {onSend && (order.status === 'draft' || order.status === 'pending') && (
          <div className="px-6 pb-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2.5">Enviar pedido</p>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => onSend(order, 'email')}
                disabled={sendingOrderId === order._id}
                className="flex items-center gap-2 px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors disabled:opacity-50"
              >
                <Mail className="w-4 h-4 text-blue-500" />
                <div className="text-left">
                  <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">Email</p>
                  <p className="text-[10px] text-gray-400">Correo al proveedor</p>
                </div>
              </button>
              <button
                onClick={() => onSend(order, 'whatsapp')}
                disabled={sendingOrderId === order._id}
                className="flex items-center gap-2 px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-emerald-50 dark:hover:bg-emerald-900/10 transition-colors disabled:opacity-50"
              >
                <MessageCircle className="w-4 h-4 text-emerald-500" />
                <div className="text-left">
                  <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">WhatsApp</p>
                  <p className="text-[10px] text-gray-400">Mensaje directo</p>
                </div>
              </button>
              <button
                onClick={() => onSend(order, 'portal')}
                disabled={sendingOrderId === order._id}
                className="flex items-center gap-2 px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-violet-50 dark:hover:bg-violet-900/10 transition-colors disabled:opacity-50"
              >
                <Globe className="w-4 h-4 text-violet-500" />
                <div className="text-left">
                  <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">Portal Vertial</p>
                  <p className="text-[10px] text-gray-400">Portal proveedor</p>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Status actions */}
        <div className="border-t border-gray-100 dark:border-gray-700/60 px-6 py-4 flex flex-wrap gap-2">
          {order.status === 'draft' && (
            <button onClick={() => onStatusChange(order, 'pending')} className="px-4 py-2.5 bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 rounded-xl text-sm font-semibold hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors flex items-center gap-1.5 border border-amber-200/60 dark:border-amber-800/40">
              <Clock className="w-4 h-4" /> Marcar pendiente
            </button>
          )}
          {(order.status === 'sent' || order.status === 'partial') && (
            <button onClick={() => onReceive(order)} className="px-4 py-2.5 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 rounded-xl text-sm font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors flex items-center gap-1.5 border border-emerald-200/60 dark:border-emerald-800/40">
              <CheckCircle2 className="w-4 h-4" /> Marcar recibido
            </button>
          )}
          {order.status !== 'cancelled' && order.status !== 'received' && (
            <button onClick={() => onStatusChange(order, 'cancelled')} className="px-4 py-2.5 text-red-500 dark:text-red-400 rounded-xl text-sm font-medium hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center gap-1.5">
              <X className="w-4 h-4" /> Cancelar
            </button>
          )}
          <div className="flex-1" />
          <button onClick={onClose} className="px-4 py-2.5 border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">Cerrar</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Low Stock Panel ───────────────────────────────────────────────────────── */

function LowStockPanel({ items, loading }: { items: LowStockItem[]; loading: boolean }) {
  if (loading) return (
    <div className="flex items-center justify-center py-12">
      <div className="w-7 h-7 border-[3px] border-gray-200 border-t-gray-900 dark:border-gray-700 dark:border-t-gray-200 rounded-full animate-spin" />
    </div>
  );
  if (items.length === 0) return (
    <div className="text-center py-16 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl">
      <div className="w-16 h-16 mx-auto bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl flex items-center justify-center mb-4">
        <CheckCircle2 className="w-8 h-8 text-emerald-500" />
      </div>
      <h3 className="text-base font-semibold text-gray-700 dark:text-gray-300">Todo en orden</h3>
      <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Todos los artículos tienen stock suficiente</p>
    </div>
  );

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 dark:border-gray-700/60">
            <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Artículo</th>
            <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Stock</th>
            <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Mínimo</th>
            <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Déficit</th>
            <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Reorden</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Proveedor</th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Auto</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50 dark:divide-gray-700/40">
          {items.map(item => (
            <tr key={item._id} className={`hover:bg-gray-50/60 dark:hover:bg-gray-700/20 transition-colors ${item.stockQuantity === 0 ? 'bg-red-50/40 dark:bg-red-900/5' : ''}`}>
              <td className="px-5 py-3">
                <div className="font-semibold text-gray-900 dark:text-gray-100">{item.name}</div>
                {item.sku && <div className="text-xs text-gray-400 font-mono">{item.sku}</div>}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                <span className={`font-bold ${item.stockQuantity === 0 ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>{item.stockQuantity}</span>
              </td>
              <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300 tabular-nums">{item.minStock}</td>
              <td className="px-4 py-3 text-right tabular-nums">
                <span className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-md font-bold text-xs">-{item.deficit}</span>
              </td>
              <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300 tabular-nums">{item.reorderQuantity || '-'}</td>
              <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{item.supplierName || <span className="text-gray-300 dark:text-gray-600 italic text-xs">Sin asignar</span>}</td>
              <td className="px-4 py-3 text-center">{item.autoReorder ? <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" /> : <X className="w-4 h-4 text-gray-200 dark:text-gray-600 mx-auto" />}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Smart List Panel ─────────────────────────────────────────────────────── */

function SmartListPanel({ items, loading, selected, onToggle, onSelectUrgent, onCreateOrders }: {
  items: SmartListItem[];
  loading: boolean;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onSelectUrgent: () => void;
  onCreateOrders: () => void;
}) {
  if (loading) return (
    <div className="flex items-center justify-center py-12">
      <div className="w-7 h-7 border-[3px] border-gray-200 border-t-gray-900 dark:border-gray-700 dark:border-t-gray-200 rounded-full animate-spin" />
    </div>
  );
  if (items.length === 0) return (
    <div className="text-center py-16 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl">
      <div className="w-16 h-16 mx-auto bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl flex items-center justify-center mb-4">
        <CheckCircle2 className="w-8 h-8 text-emerald-500" />
      </div>
      <h3 className="text-base font-semibold text-gray-700 dark:text-gray-300">Sin sugerencias</h3>
      <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Todos los productos tienen stock suficiente</p>
    </div>
  );

  const urgencyBg: Record<string, string> = { critical: 'bg-red-50/60 dark:bg-red-900/10', high: 'bg-amber-50/40 dark:bg-amber-900/5', normal: '' };
  const urgencyDot: Record<string, string> = { critical: 'bg-red-500', high: 'bg-amber-500', normal: 'bg-gray-300 dark:bg-gray-600' };
  const reasonLabel: Record<string, string> = { stock_bajo: 'Stock bajo', prevision_finde: 'Prev. finde', 'campaña_activa': 'Campaña', historico: 'Histórico' };

  const totalSelected = items.filter((i) => selected.has(i.catalogItemId)).reduce((s, i) => s + i.estimatedTotal, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={onSelectUrgent} className="px-3 py-2 text-xs font-semibold bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors border border-red-200/60 dark:border-red-800/40">
            Seleccionar urgentes
          </button>
          <span className="text-xs text-gray-400">{selected.size} de {items.length} seleccionados</span>
        </div>
        {selected.size > 0 && (
          <button onClick={onCreateOrders} className="px-4 py-2.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:bg-black dark:hover:bg-white transition-colors flex items-center gap-2">
            <ShoppingBag className="w-4 h-4" /> Crear pedidos ({totalSelected.toFixed(2)}€)
          </button>
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700/60">
                <th className="w-10 px-3 py-3"><input type="checkbox" checked={selected.size === items.length} onChange={() => { if (selected.size === items.length) onToggle('__clear__'); else items.forEach((i) => { if (!selected.has(i.catalogItemId)) onToggle(i.catalogItemId); }); }} className="rounded" /></th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Producto</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Stock</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Mín.</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Prom/sem</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Sugerido</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Razón</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Proveedor</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Coste est.</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Urgencia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700/40">
              {items.map((item) => (
                <tr key={item.catalogItemId} className={`hover:bg-gray-50/60 dark:hover:bg-gray-700/20 transition-colors ${urgencyBg[item.urgency] || ''} ${item.alreadyOrdered ? 'opacity-50' : ''}`}>
                  <td className="px-3 py-2.5"><input type="checkbox" checked={selected.has(item.catalogItemId)} onChange={() => onToggle(item.catalogItemId)} disabled={item.alreadyOrdered} className="rounded" /></td>
                  <td className="px-4 py-2.5">
                    <div className="font-semibold text-gray-900 dark:text-gray-100">{item.name}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {item.sku && <span className="text-xs text-gray-400 font-mono">{item.sku}</span>}
                      {item.isCritical && <span className="px-1.5 py-0.5 text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded">CLAVE</span>}
                      {item.alreadyOrdered && <span className="px-1.5 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded">PEDIDO</span>}
                      {item.activeCampaigns.map((c, i) => <span key={i} className="px-1.5 py-0.5 text-[10px] font-bold bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 rounded">{c}</span>)}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums"><span className={`font-bold ${item.currentStock === 0 ? 'text-red-600 dark:text-red-400' : item.currentStock < item.minStock ? 'text-amber-600 dark:text-amber-400' : 'text-gray-600 dark:text-gray-300'}`}>{item.currentStock}</span></td>
                  <td className="px-3 py-2.5 text-right text-gray-600 dark:text-gray-300 tabular-nums">{item.minStock}</td>
                  <td className="px-3 py-2.5 text-right text-gray-600 dark:text-gray-300 tabular-nums">{item.weeklyAvg}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-gray-900 dark:text-gray-100 tabular-nums">{item.suggestedQuantity}</td>
                  <td className="px-3 py-2.5"><div className="flex flex-wrap gap-1">{item.recommendationReasons.map((r) => <span key={r} className="px-1.5 py-0.5 text-[10px] font-semibold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">{reasonLabel[r] || r}</span>)}</div></td>
                  <td className="px-3 py-2.5 text-gray-600 dark:text-gray-300 text-xs">{item.supplierName || <span className="text-gray-300 dark:text-gray-600 italic">Sin asignar</span>}</td>
                  <td className="px-3 py-2.5 text-right font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{item.estimatedTotal.toFixed(2)}€</td>
                  <td className="px-3 py-2.5 text-center"><div className={`w-2.5 h-2.5 rounded-full mx-auto ${urgencyDot[item.urgency] || urgencyDot.normal} ${item.urgency === 'critical' ? 'animate-pulse' : ''}`} title={item.urgency} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {items.length > 0 && (
        <div className="flex items-center justify-between px-5 py-3 bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-xl text-sm">
          <span className="text-gray-400">{items.length} sugerencia{items.length !== 1 ? 's' : ''} · {items.filter((i) => i.urgency === 'critical').length} críticas · {items.filter((i) => i.urgency === 'high').length} altas</span>
          <span className="font-bold text-gray-900 dark:text-gray-100 tabular-nums">Total estimado: {items.reduce((s, i) => s + i.estimatedTotal, 0).toFixed(2)}€</span>
        </div>
      )}
    </div>
  );
}

/* ─── Order Row (Card mode) ─────────────────────────────────────────────────── */

function OrderCard({ order, onView, onEdit, onDelete }: {
  order: PurchaseOrder;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm transition-all">
      <div className="p-4 flex items-center gap-4">
        {/* Icon */}
        <div className="w-11 h-11 bg-gray-50 dark:bg-gray-700/60 rounded-xl flex items-center justify-center shrink-0">
          <Factory className="w-5 h-5 text-gray-400 dark:text-gray-500" />
        </div>

        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-gray-900 dark:text-gray-100 text-sm">{order.orderNumber}</span>
            <StatusBadge status={order.status} />
            {order.source === 'auto' && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold bg-violet-50 text-violet-600 dark:bg-violet-900/20 dark:text-violet-400 rounded-md uppercase tracking-wider">
                <Zap className="w-2.5 h-2.5" /> Auto
              </span>
            )}
            <UrgencyBadge urgency={(order as any).urgency} />
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-sm text-gray-500 dark:text-gray-400 truncate">{order.supplierName || 'Sin proveedor'}</span>
            <span className="text-gray-200 dark:text-gray-600">·</span>
            <span className="text-xs text-gray-400 dark:text-gray-500">{order.items.length} artículo{order.items.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="mt-2">
            <StatusPipeline status={order.status} />
          </div>
        </div>

        {/* Amount + date */}
        <div className="text-right shrink-0 hidden sm:block">
          <p className="text-base font-bold text-gray-900 dark:text-gray-100 tabular-nums">{order.total.toFixed(2)}€</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{order.createdAt ? new Date(order.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}</p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button onClick={onView} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors" title="Ver detalle"><Eye className="w-4 h-4 text-gray-400 hover:text-gray-600" /></button>
          <button onClick={onEdit} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors" title="Editar"><Edit3 className="w-4 h-4 text-gray-400 hover:text-gray-600" /></button>
          <button onClick={onDelete} className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" title="Eliminar"><Trash2 className="w-4 h-4 text-gray-300 hover:text-red-500" /></button>
        </div>
      </div>
    </div>
  );
}

/* ─── Order Table View ──────────────────────────────────────────────────────── */

function OrderTable({ orders, onView, onEdit, onDelete }: {
  orders: PurchaseOrder[];
  onView: (o: PurchaseOrder) => void;
  onEdit: (o: PurchaseOrder) => void;
  onDelete: (o: PurchaseOrder) => void;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-700/60">
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Pedido</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Proveedor</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Estado</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Progreso</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Artículos</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Total</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Fecha</th>
              <th className="text-right px-5 py-3 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider w-28">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-700/40">
            {orders.map(order => (
              <tr key={order._id} className="hover:bg-gray-50/60 dark:hover:bg-gray-700/20 transition-colors group">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-900 dark:text-gray-100">{order.orderNumber}</span>
                    {order.source === 'auto' && <Zap className="w-3.5 h-3.5 text-violet-500" />}
                    <UrgencyBadge urgency={(order as any).urgency} />
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-300 max-w-[12rem] truncate">{order.supplierName || <span className="text-gray-300 dark:text-gray-600 italic">Sin proveedor</span>}</td>
                <td className="px-4 py-3 text-center"><StatusBadge status={order.status} /></td>
                <td className="px-4 py-3"><div className="flex justify-center"><StatusPipeline status={order.status} /></div></td>
                <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300 tabular-nums">{order.items.length}</td>
                <td className="px-4 py-3 text-right font-bold text-gray-900 dark:text-gray-100 tabular-nums">{order.total.toFixed(2)}€</td>
                <td className="px-4 py-3 text-right text-gray-400 dark:text-gray-500 text-xs tabular-nums">{order.createdAt ? new Date(order.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) : '-'}</td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => onView(order)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors" title="Ver"><Eye className="w-4 h-4 text-gray-400" /></button>
                    <button onClick={() => onEdit(order)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors" title="Editar"><Edit3 className="w-4 h-4 text-gray-400" /></button>
                    <button onClick={() => onDelete(order)} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" title="Eliminar"><Trash2 className="w-4 h-4 text-gray-300 hover:text-red-500" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const PO_IMPORT_FIELDS: ImportFieldDef[] = [
  { key: 'supplierName', label: 'Proveedor', required: true, example: 'Proveedor SL' },
  { key: 'itemName', label: 'Artículo', required: true, example: 'Producto A' },
  { key: 'quantity', label: 'Cantidad', required: true, example: '50' },
  { key: 'unitCost', label: 'Coste unitario', example: '3.50' },
  { key: 'notes', label: 'Notas', example: '' },
];

/* ─── Main Page ─────────────────────────────────────────────────────────────── */

export function PurchaseOrdersPage() {
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const dataUserId = resolveBusinessDataUserId(user, currentBusiness);
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const fromCountId = searchParams.get('fromCount') || '';
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [lowStockItems, setLowStockItems] = useState<LowStockItem[]>([]);
  const [smartList, setSmartList] = useState<SmartListItem[]>([]);
  const [smartListLoading, setSmartListLoading] = useState(false);
  const [selectedSmartItems, setSelectedSmartItems] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [lowStockLoading, setLowStockLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingOrder, setEditingOrder] = useState<PurchaseOrder | null>(null);
  const [viewingOrder, setViewingOrder] = useState<PurchaseOrder | null>(null);
  const [search, setSearch] = useState('');
  const { activeWorkCenters, hasWorkCenters } = useWorkCenters();
  const [filterWorkCenter, setFilterWorkCenter] = useState<string>('all');

  useModalClose(showCreate, () => { setShowCreate(false); setEditingOrder(null); });
  useModalClose(!!viewingOrder, () => setViewingOrder(null));
  const [activeTab, setActiveTab] = useState('all');
  const [generating, setGenerating] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [filterUrgency, setFilterUrgency] = useState<string>('all');
  const [showWizard, setShowWizard] = useState(false);
  const [sendingOrder, setSendingOrder] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!dataUserId) return;
    try {
      const [ords, sups, items] = await Promise.all([
        listPurchaseOrdersRequest(dataUserId),
        listSuppliersRequest(dataUserId),
        listCatalogItemsRequest(dataUserId),
      ]);
      setOrders(ords);
      setSuppliers(sups);
      setCatalogItems(items);
    } catch {
      toast.error('Error al cargar pedidos de compra');
    } finally {
      setLoading(false);
    }
  }, [dataUserId]);

  const loadLowStock = useCallback(async () => {
    if (!dataUserId) return;
    try {
      const report = await getLowStockReportRequest(dataUserId);
      setLowStockItems(report.items || []);
    } catch { /* ignore */ } finally {
      setLowStockLoading(false);
    }
  }, [dataUserId]);

  const loadSmartList = useCallback(async () => {
    if (!dataUserId) return;
    setSmartListLoading(true);
    try {
      const result = await getSmartPurchaseListRequest(dataUserId);
      setSmartList(result.items || []);
    } catch { /* ignore */ } finally {
      setSmartListLoading(false);
    }
  }, [dataUserId]);

  useEffect(() => { loadData(); loadLowStock(); loadSmartList(); }, [loadData, loadLowStock, loadSmartList]);

  useEffect(() => {
    if (fromCountId) setActiveTab('smart-list');
  }, [fromCountId]);

  const dismissFromCount = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('fromCount');
    setSearchParams(next, { replace: true });
  };

  const handleSaveOrder = async (data: Partial<PurchaseOrder>) => {
    if (!dataUserId) return;
    try {
      if (editingOrder) {
        const updated = await updatePurchaseOrderRequest(dataUserId, { ...editingOrder, ...data } as PurchaseOrder);
        setOrders(prev => prev.map(o => o._id === updated._id ? updated : o));
        toast.success('Pedido actualizado');
      } else {
        const created = await createPurchaseOrderRequest(dataUserId, data);
        setOrders(prev => [created, ...prev]);
        toast.success('Pedido creado');
      }
      setShowCreate(false);
      setEditingOrder(null);
    } catch (err: any) {
      toast.error(err?.message || 'Error al guardar pedido');
    }
  };

  const handleDelete = async (order: PurchaseOrder) => {
    if (!dataUserId) return;
    if (!confirm('¿Eliminar este pedido de compra?')) return;
    try {
      await deletePurchaseOrderRequest(dataUserId, order._id);
      setOrders(prev => prev.filter(o => o._id !== order._id));
      toast.success('Pedido eliminado');
    } catch (err: any) {
      toast.error(err?.message || 'Error al eliminar');
    }
  };

  const handleStatusChange = async (order: PurchaseOrder, status: PurchaseOrderStatus) => {
    if (!dataUserId) return;
    try {
      const updated = await updatePurchaseOrderRequest(dataUserId, {
        ...order,
        status,
        ...(status === 'sent' ? { sentAt: new Date().toISOString() } : {}),
      } as PurchaseOrder);
      setOrders(prev => prev.map(o => o._id === updated._id ? updated : o));
      setViewingOrder(updated);
      toast.success(`Estado cambiado a ${STATUS_CONFIG[status]?.label || status}`);
    } catch (err: any) {
      toast.error(err?.message || 'Error al cambiar estado');
    }
  };

  const handleReceive = async (order: PurchaseOrder) => {
    if (!dataUserId) return;
    try {
      const updated = await markOrderReceivedRequest(dataUserId, order._id);
      setOrders(prev => prev.map(o => o._id === updated._id ? updated : o));
      setViewingOrder(updated);
      toast.success('Pedido marcado como recibido — stock actualizado');
      loadLowStock();
    } catch (err: any) {
      toast.error(err?.message || 'Error al recibir pedido');
    }
  };

  const handleAutoGenerate = async () => {
    if (!dataUserId) return;
    setGenerating(true);
    try {
      const result = await triggerAutoOrdersRequest(dataUserId);
      if (result.created > 0) {
        setOrders(prev => [...(result.orders || []), ...prev]);
        toast.success(`${result.created} pedido(s) automático(s) generado(s)`);
        loadLowStock();
      } else {
        toast.info('No se encontraron artículos con stock bajo y reorden automático activado');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Error al generar pedidos automáticos');
    } finally {
      setGenerating(false);
    }
  };

  const handleSendOrder = async (order: PurchaseOrder, method: 'email' | 'whatsapp' | 'portal') => {
    if (!dataUserId) return;
    setSendingOrder(order._id);
    try {
      const result = await sendPurchaseOrderRequest(dataUserId, order._id, method);
      if (method === 'whatsapp' && result.waUrl) {
        window.open(result.waUrl, '_blank');
      }
      setOrders(prev => prev.map(o => o._id === order._id ? result.order : o));
      if (viewingOrder?._id === order._id) setViewingOrder(result.order);
      toast.success(`Pedido enviado por ${method === 'email' ? 'email' : method === 'whatsapp' ? 'WhatsApp' : 'Portal Vertial'}`);
    } catch (err: any) {
      toast.error(err?.message || 'Error al enviar pedido');
    } finally {
      setSendingOrder(null);
    }
  };

  const handleWizardComplete = (newOrders: PurchaseOrder[]) => {
    if (newOrders.length > 0) {
      setOrders(prev => [...newOrders, ...prev]);
      loadLowStock();
    }
    setShowWizard(false);
  };

  const handleReceptionUpdate = (updated: PurchaseOrder) => {
    setOrders(prev => prev.map(o => o._id === updated._id ? updated : o));
    loadLowStock();
  };

  const handleToggleSmartItem = (id: string) => {
    if (id === '__clear__') { setSelectedSmartItems(new Set()); return; }
    setSelectedSmartItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSelectUrgent = () => {
    const urgentIds = smartList.filter(i => (i.urgency === 'critical' || i.urgency === 'high') && !i.alreadyOrdered).map(i => i.catalogItemId);
    setSelectedSmartItems(new Set(urgentIds));
  };

  const handleCreateFromSmartList = async () => {
    if (!dataUserId || selectedSmartItems.size === 0) return;
    const selectedItems = smartList.filter(i => selectedSmartItems.has(i.catalogItemId));

    const groups: Record<string, typeof selectedItems> = {};
    for (const item of selectedItems) {
      const key = item.supplierId || '__no_supplier__';
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }

    const orderDataList = Object.values(groups).map(items => {
      const orderItems = items.map((item, idx) => ({
        id: `poi-smart-${Date.now()}-${idx}`,
        catalogItemId: item.catalogItemId,
        sku: item.sku,
        name: item.name,
        quantity: item.suggestedQuantity,
        unitCost: item.costPrice,
        total: item.suggestedQuantity * item.costPrice,
        received: 0,
        notes: '',
      }));
      const subtotal = orderItems.reduce((s, l) => s + l.total, 0);
      return {
        supplierId: items[0].supplierId,
        supplierName: items[0].supplierName,
        items: orderItems,
        subtotal,
        taxRate: 21,
        taxAmount: subtotal * 0.21,
        total: subtotal * 1.21,
        status: 'draft' as const,
        source: 'auto' as const,
        urgency: items.some(i => i.urgency === 'critical') ? 'critical' : items.some(i => i.urgency === 'high') ? 'high' : 'normal',
        notes: `Generado desde lista sugerida — ${items.length} producto(s)`,
        workCenterId: items[0].workCenterId || '',
        workCenterName: items[0].workCenterName || '',
      };
    });

    try {
      const result = await createBulkPurchaseOrdersRequest(dataUserId, orderDataList);
      if (result.created > 0) {
        setOrders(prev => [...(result.orders || []), ...prev]);
        toast.success(`${result.created} pedido(s) creado(s) desde lista sugerida`);
        setSelectedSmartItems(new Set());
        loadSmartList();
        loadLowStock();
      }
    } catch (err: any) {
      toast.error(err?.message || 'Error al crear pedidos');
    }
  };

  const receptionCount = useMemo(
    () => orders.filter(o => ['sent', 'partial'].includes(o.status)).length,
    [orders],
  );

  const tabs = useMemo(() => {
    const counts = { all: orders.length, draft: 0, pending: 0, sent: 0, received: 0 };
    orders.forEach(o => { if (o.status in counts) (counts as Record<string, number>)[o.status]++; });
    return [
      { id: 'all', label: 'Todos', count: counts.all },
      { id: 'draft', label: 'Borradores', count: counts.draft },
      { id: 'pending', label: 'Pendientes', count: counts.pending },
      { id: 'sent', label: 'Enviados', count: counts.sent },
      { id: 'received', label: 'Recibidos', count: counts.received },
      { id: 'reception', label: 'Recepción', count: receptionCount },
      { id: 'low-stock', label: 'Stock bajo', count: lowStockItems.length },
      { id: 'smart-list', label: 'Lista sugerida', count: smartList.length },
    ];
  }, [orders, lowStockItems.length, receptionCount, smartList.length]);

  const filtered = useMemo(() => {
    let list = orders;
    if (activeTab !== 'all' && activeTab !== 'low-stock' && activeTab !== 'reception' && activeTab !== 'smart-list') {
      list = list.filter(o => o.status === activeTab);
    }
    if (supplierFilter) {
      list = list.filter(o => o.supplierId === supplierFilter);
    }
    if (filterWorkCenter !== 'all') {
      list = list.filter(o => (o as any).workCenterId === filterWorkCenter);
    }
    if (filterUrgency !== 'all') {
      list = list.filter(o => (o as any).urgency === filterUrgency);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(o =>
        o.orderNumber.toLowerCase().includes(q) ||
        o.supplierName.toLowerCase().includes(q) ||
        o.items.some(i => i.name.toLowerCase().includes(q)),
      );
    }
    list.sort((a, b) => {
      const urgencyOrder: Record<string, number> = { critical: 0, high: 1, normal: 2 };
      return (urgencyOrder[(a as any).urgency] ?? 2) - (urgencyOrder[(b as any).urgency] ?? 2);
    });
    return list;
  }, [orders, activeTab, search, supplierFilter, filterWorkCenter, filterUrgency]);

  const stats = useMemo(() => {
    const totalValue = orders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + o.total, 0);
    const pendingCount = orders.filter(o => ['draft', 'pending', 'sent'].includes(o.status)).length;
    const autoCount = orders.filter(o => o.source === 'auto').length;
    return { totalValue, pendingCount, autoCount, lowStock: lowStockItems.length };
  }, [orders, lowStockItems.length]);

  const usedSuppliers = useMemo(() => {
    const ids = new Set(orders.map(o => o.supplierId).filter(Boolean));
    return suppliers.filter(s => ids.has(s._id));
  }, [orders, suppliers]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="w-8 h-8 border-[3px] border-gray-200 border-t-gray-900 dark:border-gray-700 dark:border-t-gray-200 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-0 max-w-[1400px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 bg-gray-900 dark:bg-gray-100 rounded-lg flex items-center justify-center">
                <ShoppingBag className="w-4 h-4 text-white dark:text-gray-900" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Pedidos a proveedores</h1>
            </div>
            <p className="text-sm text-gray-400 dark:text-gray-500 ml-10">Gestión manual y automática de pedidos de compra</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleAutoGenerate}
              disabled={generating}
              className="px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-medium text-sm transition-all flex items-center gap-2 disabled:opacity-50 shadow-sm shadow-violet-200 dark:shadow-none"
            >
              <Zap className={`w-4 h-4 ${generating ? 'animate-pulse' : ''}`} />
              {generating ? 'Generando...' : 'Auto-generar'}
            </button>
            <AddButtonDropdown
              label="Nuevo pedido"
              onQuickAdd={() => setShowWizard(true)}
              onAIAdd={() => { setEditingOrder(null); setShowCreate(true); }}
              onImport={() => setShowImportModal(true)}
              quickAddLabel="Asistente de pedido"
              quickAddDesc="Recomendación + manual + envío"
              aiAddLabel="Alta rápida"
              aiAddDesc="Formulario directo"
            />
          </div>
        </div>

        {fromCountId && dataUserId && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                Lista de compra desde inventario
              </p>
              <button
                type="button"
                onClick={dismissFromCount}
                className="text-xs font-semibold text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
              >
                Cerrar
              </button>
            </div>
            <StockPurchaseListPreview
              userId={dataUserId}
              countId={fromCountId}
              onOrdersCreated={() => void loadData()}
            />
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Valor total', value: `${stats.totalValue.toFixed(2)}€`, icon: ShoppingBag, iconBg: 'bg-gray-100 dark:bg-gray-700', iconColor: 'text-gray-500 dark:text-gray-400' },
            { label: 'En proceso', value: String(stats.pendingCount), icon: Clock, iconBg: 'bg-amber-50 dark:bg-amber-900/20', iconColor: 'text-amber-500' },
            { label: 'Automáticos', value: String(stats.autoCount), icon: Zap, iconBg: 'bg-violet-50 dark:bg-violet-900/20', iconColor: 'text-violet-500' },
            { label: 'Stock bajo', value: String(stats.lowStock), icon: TrendingDown, iconBg: stats.lowStock > 0 ? 'bg-red-50 dark:bg-red-900/20' : 'bg-emerald-50 dark:bg-emerald-900/20', iconColor: stats.lowStock > 0 ? 'text-red-500' : 'text-emerald-500' },
          ].map(({ label, value, icon: Icon, iconBg, iconColor }) => (
            <div key={label} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex items-center gap-3">
              <div className={`w-10 h-10 ${iconBg} rounded-xl flex items-center justify-center shrink-0`}>
                <Icon className={`w-5 h-5 ${iconColor}`} />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400 dark:text-gray-500">{label}</p>
                <p className="text-xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">{value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Toolbar: Tabs + filters */}
        <div className="space-y-3">
          <div className="overflow-x-auto">
            <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
          </div>

          {activeTab !== 'low-stock' && activeTab !== 'reception' && activeTab !== 'smart-list' && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              {/* Search */}
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300 dark:text-gray-600" />
                <input
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-400 dark:focus:border-gray-500 focus:ring-2 focus:ring-gray-100 dark:focus:ring-gray-800 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm transition-all"
                  placeholder="Buscar pedido, proveedor, artículo..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors">
                    <X className="w-3.5 h-3.5 text-gray-400" />
                  </button>
                )}
              </div>

              {/* Work center filter */}
              {hasWorkCenters && activeWorkCenters.length > 0 && (
                <div className="relative">
                  <Package className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300 dark:text-gray-600 pointer-events-none" />
                  <select
                    className="pl-9 pr-8 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm outline-none focus:border-gray-400 dark:focus:border-gray-500 appearance-none cursor-pointer transition-colors"
                    value={filterWorkCenter}
                    onChange={e => setFilterWorkCenter(e.target.value)}
                  >
                    <option value="all">Todas las sedes</option>
                    {activeWorkCenters.map((wc: any) => <option key={wc._id || wc.id} value={wc._id || wc.id}>{wc.name}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300 pointer-events-none" />
                </div>
              )}

              {/* Urgency filter */}
              <div className="relative">
                <AlertTriangle className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300 dark:text-gray-600 pointer-events-none" />
                <select
                  className="pl-9 pr-8 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm outline-none focus:border-gray-400 dark:focus:border-gray-500 appearance-none cursor-pointer transition-colors"
                  value={filterUrgency}
                  onChange={e => setFilterUrgency(e.target.value)}
                >
                  <option value="all">Toda urgencia</option>
                  <option value="critical">Crítica</option>
                  <option value="high">Alta</option>
                  <option value="normal">Normal</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300 pointer-events-none" />
              </div>

              {/* Supplier filter */}
              {usedSuppliers.length > 0 && (
                <div className="relative">
                  <Factory className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300 dark:text-gray-600 pointer-events-none" />
                  <select
                    className="pl-9 pr-8 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm outline-none focus:border-gray-400 dark:focus:border-gray-500 appearance-none cursor-pointer transition-colors"
                    value={supplierFilter}
                    onChange={e => setSupplierFilter(e.target.value)}
                  >
                    <option value="">Todos los proveedores</option>
                    {usedSuppliers.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300 pointer-events-none" />
                </div>
              )}

              {/* View toggle */}
              <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shrink-0 self-start">
                <button
                  onClick={() => setViewMode('cards')}
                  className={`p-2.5 transition-colors ${viewMode === 'cards' ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900' : 'bg-white dark:bg-gray-800 text-gray-400 hover:text-gray-600'}`}
                  title="Vista tarjetas"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('table')}
                  className={`p-2.5 transition-colors ${viewMode === 'table' ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900' : 'bg-white dark:bg-gray-800 text-gray-400 hover:text-gray-600'}`}
                  title="Vista tabla"
                >
                  <LayoutList className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Content */}
        {activeTab === 'smart-list' ? (
          <SmartListPanel
            items={smartList}
            loading={smartListLoading}
            selected={selectedSmartItems}
            onToggle={handleToggleSmartItem}
            onSelectUrgent={handleSelectUrgent}
            onCreateOrders={handleCreateFromSmartList}
          />
        ) : activeTab === 'reception' ? (
          <OrderReceptionView orders={orders} onOrderUpdated={handleReceptionUpdate} />
        ) : activeTab === 'low-stock' ? (
          <LowStockPanel items={lowStockItems} loading={lowStockLoading} />
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl">
            <div className="w-16 h-16 mx-auto bg-gray-50 dark:bg-gray-700/40 rounded-2xl flex items-center justify-center mb-4">
              <Package className="w-8 h-8 text-gray-300 dark:text-gray-600" />
            </div>
            <h3 className="text-base font-semibold text-gray-700 dark:text-gray-300">
              {search || supplierFilter ? 'Sin resultados' : 'No hay pedidos'}
            </h3>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1 max-w-xs mx-auto">
              {search || supplierFilter
                ? 'Prueba con otros criterios de búsqueda'
                : 'Crea un pedido manual o genera pedidos automáticos desde artículos con stock bajo'}
            </p>
            {!search && !supplierFilter && (
              <button
                onClick={() => { setEditingOrder(null); setShowCreate(true); }}
                className="mt-5 px-5 py-2.5 bg-gray-900 hover:bg-black dark:bg-gray-100 dark:hover:bg-white dark:text-gray-900 text-white rounded-xl font-medium text-sm transition-colors inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> Crear primer pedido
              </button>
            )}
          </div>
        ) : viewMode === 'table' ? (
          <OrderTable
            orders={filtered}
            onView={o => setViewingOrder(o)}
            onEdit={o => { setEditingOrder(o); setShowCreate(true); }}
            onDelete={handleDelete}
          />
        ) : (
          <div className="space-y-2">
            {filtered.map(order => (
              <OrderCard
                key={order._id}
                order={order}
                onView={() => setViewingOrder(order)}
                onEdit={() => { setEditingOrder(order); setShowCreate(true); }}
                onDelete={() => handleDelete(order)}
              />
            ))}
          </div>
        )}

        {/* Summary bar */}
        {activeTab !== 'low-stock' && activeTab !== 'reception' && activeTab !== 'smart-list' && filtered.length > 0 && (
          <div className="flex items-center justify-between px-5 py-3 bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-xl text-sm">
            <span className="text-gray-400 dark:text-gray-500">{filtered.length} pedido{filtered.length !== 1 ? 's' : ''}</span>
            <span className="font-bold text-gray-900 dark:text-gray-100 tabular-nums">
              Total: {filtered.filter(o => o.status !== 'cancelled').reduce((s, o) => s + o.total, 0).toFixed(2)}€
            </span>
          </div>
        )}

      <CreateOrderModal
        isOpen={showCreate}
        onClose={() => { setShowCreate(false); setEditingOrder(null); }}
        onSave={handleSaveOrder}
        suppliers={suppliers}
        catalogItems={catalogItems}
        editItem={editingOrder}
      />

      <DetailModal
        order={viewingOrder}
        onClose={() => setViewingOrder(null)}
        onStatusChange={handleStatusChange}
        onReceive={handleReceive}
        onSend={handleSendOrder}
        sendingOrderId={sendingOrder}
      />

      <NewOrderWizard
        isOpen={showWizard}
        onClose={() => setShowWizard(false)}
        onComplete={handleWizardComplete}
      />

      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Pedidos de compra"
        fields={PO_IMPORT_FIELDS}
        onImport={async (entries) => {
          if (!dataUserId) return;
          let created = 0;
          for (const entry of entries) {
            try {
              const supplier = suppliers.find(s => s.name === entry.supplierName);
              const qty = Number(entry.quantity) || 1;
              const unitCost = Number(entry.unitCost) || 0;
              const lineTotal = qty * unitCost;
              const items: PurchaseOrderItem[] = [{
                id: `poi-import-${Date.now()}-${created}`,
                catalogItemId: '',
                sku: '',
                name: entry.itemName || '',
                quantity: qty,
                unitCost,
                total: lineTotal,
                received: 0,
                notes: '',
              }];
              const order = await createPurchaseOrderRequest(dataUserId, {
                supplierId: supplier?._id || '',
                supplierName: entry.supplierName || '',
                items,
                subtotal: lineTotal,
                taxRate: 21,
                taxAmount: lineTotal * 0.21,
                total: lineTotal * 1.21,
                notes: entry.notes || '',
                status: 'draft' as PurchaseOrderStatus,
                source: 'manual',
              } as Partial<PurchaseOrder>);
              setOrders(prev => [order, ...prev]);
              created++;
            } catch { /* skip */ }
          }
          toast.success(`${created} pedido(s) importado(s)`);
        }}
      />
    </div>
  );
}
