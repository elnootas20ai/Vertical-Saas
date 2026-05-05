import { useState, useEffect, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import {
  listSuppliersRequest,
  listCatalogItemsRequest,
  type Supplier,
  type CatalogItem,
} from '../../lib/deliveryApi';
import {
  getSalesForecastRequest,
  createBulkPurchaseOrdersRequest,
  sendPurchaseOrderRequest,
  type ForecastItem,
  type PurchaseOrder,
  type PurchaseOrderItem,
} from '../../lib/purchaseOrderApi';
import {
  ArrowLeft, ArrowRight, Check, Search, X, Plus, Minus, Zap, TrendingDown,
  Package, Factory, ShoppingBag, Send, Mail, MessageCircle, Globe, FileSpreadsheet,
  AlertTriangle, CheckCircle2, ChevronDown, Info,
} from 'lucide-react';

/* ─── Types ─────────────────────────────────────────────────────── */

interface SelectedItem {
  catalogItemId: string;
  name: string;
  sku: string;
  quantity: number;
  unitCost: number;
  supplierId: string;
  supplierName: string;
  source: 'recommendation' | 'manual';
}

interface SupplierGroup {
  supplierId: string;
  supplierName: string;
  supplierEmail: string;
  supplierPhone: string;
  items: SelectedItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
}

interface WizardProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (orders: PurchaseOrder[]) => void;
}

const STEPS = [
  { id: 'recommend', label: 'Recomendación', icon: Zap },
  { id: 'manual', label: 'Añadir manual', icon: Plus },
  { id: 'summary', label: 'Resumen', icon: ShoppingBag },
  { id: 'send', label: 'Enviar', icon: Send },
];

/* ─── Step Indicator ────────────────────────────────────────────── */

function StepIndicator({ currentStep, steps }: { currentStep: number; steps: typeof STEPS }) {
  return (
    <div className="flex items-center gap-1 px-6 py-4 bg-gray-50 dark:bg-gray-900/40 border-b border-gray-200 dark:border-gray-700">
      {steps.map((step, i) => {
        const Icon = step.icon;
        const isActive = i === currentStep;
        const isDone = i < currentStep;
        return (
          <div key={step.id} className="flex items-center gap-1 flex-1">
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
              isActive ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900' :
              isDone ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' :
              'text-gray-400 dark:text-gray-500'
            }`}>
              {isDone ? <CheckCircle2 className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
              <span className="text-xs font-semibold hidden sm:inline">{step.label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-0.5 rounded-full mx-1 ${isDone ? 'bg-emerald-300 dark:bg-emerald-700' : 'bg-gray-200 dark:bg-gray-700'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Step 1: Recommendation ────────────────────────────────────── */

function RecommendationStep({
  forecast, suppliers, selectedItems, onToggleItem, onUpdateItem, loading,
}: {
  forecast: ForecastItem[];
  suppliers: Supplier[];
  selectedItems: Map<string, SelectedItem>;
  onToggleItem: (item: ForecastItem) => void;
  onUpdateItem: (id: string, updates: Partial<SelectedItem>) => void;
  loading: boolean;
}) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return forecast;
    const q = search.toLowerCase();
    return forecast.filter(f =>
      f.name.toLowerCase().includes(q) || f.supplierName.toLowerCase().includes(q),
    );
  }, [forecast, search]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-[3px] border-gray-200 border-t-gray-900 dark:border-gray-700 dark:border-t-gray-200 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">Recomendación automática</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Artículos por debajo del stock mínimo y/o con alta rotación semanal. Selecciona los que necesitas pedir.
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
        <input
          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-sm outline-none focus:border-gray-400 dark:focus:border-gray-500 text-gray-900 dark:text-gray-100"
          placeholder="Buscar artículo o proveedor..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
          <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
          <p className="font-semibold text-gray-700 dark:text-gray-300">Todo en orden</p>
          <p className="text-sm text-gray-400 mt-1">No hay artículos que necesiten reposición</p>
        </div>
      ) : (
        <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-white dark:bg-gray-800">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700/60 bg-gray-50 dark:bg-gray-900/40">
                  <th className="w-10 px-3 py-3"><span className="sr-only">Seleccionar</span></th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Artículo</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Stock</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Mín.</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Venta/sem</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Sem. stock</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Pedir</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">PVC</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Proveedor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/40">
                {filtered.map(item => {
                  const selected = selectedItems.has(item._id);
                  const sel = selectedItems.get(item._id);
                  const urgent = item.stockQuantity === 0;
                  return (
                    <tr key={item._id} className={`transition-colors ${selected ? 'bg-blue-50/50 dark:bg-blue-900/10' : 'hover:bg-gray-50/50 dark:hover:bg-gray-700/10'} ${urgent ? 'border-l-2 border-l-red-400' : ''}`}>
                      <td className="px-3 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => onToggleItem(item)}
                          className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:ring-0"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-gray-900 dark:text-gray-100">{item.name}</div>
                        {item.sku && <div className="text-xs text-gray-400 font-mono">{item.sku}</div>}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        <span className={`font-bold ${urgent ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>
                          {item.stockQuantity}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-500 tabular-nums">{item.minStock}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        <span className="text-gray-700 dark:text-gray-300">{item.weeklyAvg}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-bold ${
                          item.weeksOfStock < 1 ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                          item.weeksOfStock < 2 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                          'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                        }`}>
                          {item.weeksOfStock >= 999 ? '—' : `${item.weeksOfStock}s`}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {selected ? (
                          <input
                            type="number"
                            min="1"
                            className="w-16 px-2 py-1 text-right border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 outline-none"
                            value={sel?.quantity || item.suggestedOrder}
                            onChange={e => onUpdateItem(item._id, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                          />
                        ) : (
                          <span className="text-gray-400 tabular-nums">{item.suggestedOrder || item.reorderQuantity || '—'}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-medium text-gray-700 dark:text-gray-300">
                        {item.costPrice > 0 ? `${item.costPrice.toFixed(2)}€` : '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        {selected && suppliers.length > 0 ? (
                          <select
                            className="w-full px-2 py-1 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 outline-none"
                            value={sel?.supplierId || item.supplierId}
                            onChange={e => {
                              const sup = suppliers.find(s => s._id === e.target.value);
                              onUpdateItem(item._id, { supplierId: sup?._id || '', supplierName: sup?.name || '' });
                            }}
                          >
                            <option value="">Sin asignar</option>
                            {suppliers.filter(s => s.active).map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
                          </select>
                        ) : (
                          <span className="text-gray-500 dark:text-gray-400 text-xs">{item.supplierName || <span className="italic text-gray-300">Sin asignar</span>}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900/40 border-t border-gray-100 dark:border-gray-700/60 flex items-center justify-between text-sm">
            <span className="text-gray-500">{filtered.length} artículo(s) recomendado(s)</span>
            <span className="font-semibold text-gray-900 dark:text-gray-100">
              {selectedItems.size} seleccionado(s)
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Step 2: Manual Add ────────────────────────────────────────── */

function ManualAddStep({
  catalogItems, suppliers, selectedItems, onAddItem, onRemoveItem, onUpdateItem,
}: {
  catalogItems: CatalogItem[];
  suppliers: Supplier[];
  selectedItems: Map<string, SelectedItem>;
  onAddItem: (item: SelectedItem) => void;
  onRemoveItem: (id: string) => void;
  onUpdateItem: (id: string, updates: Partial<SelectedItem>) => void;
}) {
  const [search, setSearch] = useState('');
  const [showCatalog, setShowCatalog] = useState(false);

  const catalogFiltered = useMemo(() => {
    const q = search.toLowerCase();
    return catalogItems
      .filter(ci => ci.active && !selectedItems.has(ci._id))
      .filter(ci => !q || ci.name.toLowerCase().includes(q) || (ci.sku || '').toLowerCase().includes(q));
  }, [catalogItems, search, selectedItems]);

  const manualItems = useMemo(
    () => Array.from(selectedItems.values()).filter(i => i.source === 'manual'),
    [selectedItems],
  );
  const recommendedItems = useMemo(
    () => Array.from(selectedItems.values()).filter(i => i.source === 'recommendation'),
    [selectedItems],
  );

  const handleAddFromCatalog = (ci: CatalogItem) => {
    onAddItem({
      catalogItemId: ci._id,
      name: ci.name,
      sku: ci.sku || '',
      quantity: ci.reorderQuantity || 1,
      unitCost: ci.costPrice || 0,
      supplierId: ci.supplierId || '',
      supplierName: ci.supplierName || '',
      source: 'manual',
    });
    setSearch('');
    setShowCatalog(false);
  };

  return (
    <div className="p-6 space-y-5">
      <div>
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">Añadir artículos manualmente</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Busca y selecciona artículos adicionales del catálogo.
        </p>
      </div>

      {/* Catalog search */}
      <div className="relative">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
            <input
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-sm outline-none focus:border-gray-400 text-gray-900 dark:text-gray-100"
              placeholder="Buscar artículo del catálogo..."
              value={search}
              onChange={e => { setSearch(e.target.value); setShowCatalog(true); }}
              onFocus={() => setShowCatalog(true)}
            />
          </div>
        </div>
        {showCatalog && search.trim() && (
          <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl max-h-64 overflow-y-auto">
            {catalogFiltered.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-400">No se encontraron artículos</div>
            ) : (
              catalogFiltered.slice(0, 20).map(ci => (
                <button
                  key={ci._id}
                  onClick={() => handleAddFromCatalog(ci)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left border-b border-gray-50 dark:border-gray-700/40 last:border-b-0"
                >
                  <Package className="w-4 h-4 text-gray-300 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{ci.name}</span>
                    {ci.sku && <span className="ml-2 text-xs text-gray-400 font-mono">{ci.sku}</span>}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold text-gray-700 dark:text-gray-300">{ci.costPrice > 0 ? `${ci.costPrice.toFixed(2)}€` : '—'}</div>
                    <div className="text-xs text-gray-400">Stock: {ci.stockQuantity}</div>
                  </div>
                  {ci.supplierName && <span className="text-xs text-gray-400 shrink-0">{ci.supplierName}</span>}
                  <Plus className="w-4 h-4 text-emerald-500 shrink-0" />
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Selected items list */}
      {recommendedItems.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-violet-500" /> Desde recomendación ({recommendedItems.length})
          </h4>
          <div className="space-y-1.5">
            {recommendedItems.map(item => (
              <ItemRow key={item.catalogItemId} item={item} suppliers={suppliers} onUpdate={onUpdateItem} onRemove={onRemoveItem} />
            ))}
          </div>
        </div>
      )}

      {manualItems.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5 text-blue-500" /> Añadidos manualmente ({manualItems.length})
          </h4>
          <div className="space-y-1.5">
            {manualItems.map(item => (
              <ItemRow key={item.catalogItemId} item={item} suppliers={suppliers} onUpdate={onUpdateItem} onRemove={onRemoveItem} />
            ))}
          </div>
        </div>
      )}

      {selectedItems.size === 0 && (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
          <Package className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-sm text-gray-500">No hay artículos seleccionados</p>
          <p className="text-xs text-gray-400 mt-1">Busca en el catálogo o vuelve al paso anterior para usar las recomendaciones</p>
        </div>
      )}
    </div>
  );
}

function ItemRow({ item, suppliers, onUpdate, onRemove }: {
  item: SelectedItem; suppliers: Supplier[];
  onUpdate: (id: string, u: Partial<SelectedItem>) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5">
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate block">{item.name}</span>
        {item.sku && <span className="text-xs text-gray-400 font-mono">{item.sku}</span>}
      </div>
      <input
        type="number" min="1"
        className="w-16 px-2 py-1 text-right border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 outline-none"
        value={item.quantity}
        onChange={e => onUpdate(item.catalogItemId, { quantity: Math.max(1, Number(e.target.value) || 1) })}
      />
      <input
        type="number" step="0.01" min="0"
        className="w-20 px-2 py-1 text-right border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 outline-none"
        value={item.unitCost}
        onChange={e => onUpdate(item.catalogItemId, { unitCost: Number(e.target.value) || 0 })}
      />
      <select
        className="w-36 px-2 py-1 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 outline-none"
        value={item.supplierId}
        onChange={e => {
          const sup = suppliers.find(s => s._id === e.target.value);
          onUpdate(item.catalogItemId, { supplierId: sup?._id || '', supplierName: sup?.name || '' });
        }}
      >
        <option value="">Proveedor...</option>
        {suppliers.filter(s => s.active).map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
      </select>
      <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 tabular-nums w-20 text-right">
        {(item.quantity * item.unitCost).toFixed(2)}€
      </span>
      <button onClick={() => onRemove(item.catalogItemId)} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
        <X className="w-4 h-4 text-red-400" />
      </button>
    </div>
  );
}

/* ─── Step 3: Summary by Supplier ───────────────────────────────── */

function SummaryStep({ supplierGroups }: { supplierGroups: SupplierGroup[] }) {
  if (supplierGroups.length === 0) {
    return (
      <div className="p-6 text-center py-20">
        <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-3" />
        <p className="font-semibold text-gray-700 dark:text-gray-300">Sin artículos seleccionados</p>
        <p className="text-sm text-gray-400 mt-1">Vuelve a los pasos anteriores para seleccionar artículos</p>
      </div>
    );
  }

  const grandTotal = supplierGroups.reduce((s, g) => s + g.total, 0);
  const totalItems = supplierGroups.reduce((s, g) => s + g.items.length, 0);

  return (
    <div className="p-6 space-y-5">
      <div>
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">Resumen por proveedor</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {supplierGroups.length} proveedor(es) · {totalItems} artículo(s) · Total estimado: {grandTotal.toFixed(2)}€
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 text-center">
          <Factory className="w-6 h-6 text-gray-400 mx-auto mb-1" />
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{supplierGroups.length}</p>
          <p className="text-xs text-gray-400">Proveedores</p>
        </div>
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 text-center">
          <Package className="w-6 h-6 text-gray-400 mx-auto mb-1" />
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{totalItems}</p>
          <p className="text-xs text-gray-400">Artículos</p>
        </div>
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 text-center">
          <ShoppingBag className="w-6 h-6 text-gray-400 mx-auto mb-1" />
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{grandTotal.toFixed(2)}€</p>
          <p className="text-xs text-gray-400">Total estimado</p>
        </div>
      </div>

      {/* Per-supplier breakdown */}
      <div className="space-y-4">
        {supplierGroups.map(group => (
          <div key={group.supplierId || '__none'} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 bg-gray-50 dark:bg-gray-900/40 border-b border-gray-100 dark:border-gray-700/60">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center">
                  <Factory className="w-4.5 h-4.5 text-gray-500" />
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 dark:text-gray-100">{group.supplierName || 'Sin proveedor asignado'}</h4>
                  <p className="text-xs text-gray-400">{group.items.length} artículo(s)</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-gray-900 dark:text-gray-100 tabular-nums">{group.total.toFixed(2)}€</p>
                <p className="text-xs text-gray-400">IVA {group.taxRate}% incl.</p>
              </div>
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/40">
                {group.items.map((item, idx) => (
                  <tr key={idx} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/10">
                    <td className="px-5 py-2.5 text-gray-900 dark:text-gray-100 font-medium">{item.name}</td>
                    <td className="px-3 py-2.5 text-right text-gray-500 tabular-nums">{item.quantity}</td>
                    <td className="px-3 py-2.5 text-right text-gray-500 tabular-nums">{item.unitCost.toFixed(2)}€</td>
                    <td className="px-5 py-2.5 text-right font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{(item.quantity * item.unitCost).toFixed(2)}€</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Step 4: Send ──────────────────────────────────────────────── */

function SendStep({
  supplierGroups, createdOrders, sending, onSend,
}: {
  supplierGroups: SupplierGroup[];
  createdOrders: PurchaseOrder[];
  sending: Record<string, boolean>;
  onSend: (orderId: string, method: 'email' | 'whatsapp' | 'portal') => void;
}) {
  return (
    <div className="p-6 space-y-5">
      <div>
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">Enviar pedidos</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {createdOrders.length > 0
            ? `Se han creado ${createdOrders.length} pedido(s). Elige cómo enviar cada uno.`
            : 'Los pedidos se crearán y podrás enviarlos por el canal que prefieras.'}
        </p>
      </div>

      {createdOrders.length > 0 ? (
        <div className="space-y-4">
          {createdOrders.map(order => {
            const isSending = sending[order._id];
            const isSent = order.status === 'sent';
            return (
              <div key={order._id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="font-bold text-gray-900 dark:text-gray-100">{order.orderNumber}</h4>
                    <p className="text-sm text-gray-500">{order.supplierName || 'Sin proveedor'} · {order.items.length} artículo(s) · {order.total.toFixed(2)}€</p>
                  </div>
                  {isSent && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 rounded-lg">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Enviado
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    onClick={() => onSend(order._id, 'email')}
                    disabled={isSending || isSent}
                    className="flex items-center gap-2.5 px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors disabled:opacity-50"
                  >
                    <Mail className="w-5 h-5 text-blue-500" />
                    <div className="text-left">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Email</p>
                      <p className="text-xs text-gray-400">PDF por correo</p>
                    </div>
                  </button>
                  <button
                    onClick={() => onSend(order._id, 'whatsapp')}
                    disabled={isSending || isSent}
                    className="flex items-center gap-2.5 px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors disabled:opacity-50"
                  >
                    <MessageCircle className="w-5 h-5 text-emerald-500" />
                    <div className="text-left">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">WhatsApp</p>
                      <p className="text-xs text-gray-400">Mensaje directo</p>
                    </div>
                  </button>
                  <button
                    onClick={() => onSend(order._id, 'portal')}
                    disabled={isSending || isSent}
                    className="flex items-center gap-2.5 px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors disabled:opacity-50"
                  >
                    <Globe className="w-5 h-5 text-violet-500" />
                    <div className="text-left">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Portal Vertial</p>
                      <p className="text-xs text-gray-400">Acceso proveedor</p>
                    </div>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12 bg-gray-50 dark:bg-gray-900/40 rounded-xl">
          <div className="w-8 h-8 border-[3px] border-gray-200 border-t-gray-900 dark:border-gray-700 dark:border-t-gray-200 rounded-full animate-spin mx-auto" />
          <p className="text-sm text-gray-500 mt-3">Creando pedidos...</p>
        </div>
      )}
    </div>
  );
}

/* ─── Main Wizard ───────────────────────────────────────────────── */

export function NewOrderWizard({ isOpen, onClose, onComplete }: WizardProps) {
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [forecast, setForecast] = useState<ForecastItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<Map<string, SelectedItem>>(new Map());
  const [loading, setLoading] = useState(true);
  const [createdOrders, setCreatedOrders] = useState<PurchaseOrder[]>([]);
  const [sending, setSending] = useState<Record<string, boolean>>({});
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!isOpen || !user?.id) return;
    setStep(0);
    setSelectedItems(new Map());
    setCreatedOrders([]);
    setSending({});
    setCreating(false);
    loadData();
  }, [isOpen, user?.id]);

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [forecastRes, sups, items] = await Promise.all([
        getSalesForecastRequest(user.id),
        listSuppliersRequest(user.id),
        listCatalogItemsRequest(user.id),
      ]);
      setForecast(forecastRes.forecast || []);
      setSuppliers(sups);
      setCatalogItems(items);
    } catch {
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const handleToggleRecommendedItem = useCallback((item: ForecastItem) => {
    setSelectedItems(prev => {
      const next = new Map(prev);
      if (next.has(item._id)) {
        next.delete(item._id);
      } else {
        next.set(item._id, {
          catalogItemId: item._id,
          name: item.name,
          sku: item.sku,
          quantity: item.suggestedOrder || item.reorderQuantity || 1,
          unitCost: item.costPrice,
          supplierId: item.supplierId,
          supplierName: item.supplierName,
          source: 'recommendation',
        });
      }
      return next;
    });
  }, []);

  const handleAddManualItem = useCallback((item: SelectedItem) => {
    setSelectedItems(prev => {
      const next = new Map(prev);
      next.set(item.catalogItemId, item);
      return next;
    });
  }, []);

  const handleRemoveItem = useCallback((id: string) => {
    setSelectedItems(prev => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const handleUpdateItem = useCallback((id: string, updates: Partial<SelectedItem>) => {
    setSelectedItems(prev => {
      const next = new Map(prev);
      const existing = next.get(id);
      if (existing) next.set(id, { ...existing, ...updates });
      return next;
    });
  }, []);

  const supplierGroups = useMemo((): SupplierGroup[] => {
    const groups: Record<string, SupplierGroup> = {};
    for (const item of selectedItems.values()) {
      const key = item.supplierId || '__none';
      if (!groups[key]) {
        const sup = suppliers.find(s => s._id === item.supplierId);
        groups[key] = {
          supplierId: item.supplierId,
          supplierName: item.supplierName,
          supplierEmail: sup?.email || '',
          supplierPhone: sup?.phone || '',
          items: [],
          subtotal: 0, taxRate: 21, taxAmount: 0, total: 0,
        };
      }
      groups[key].items.push(item);
    }
    for (const g of Object.values(groups)) {
      g.subtotal = g.items.reduce((s, i) => s + i.quantity * i.unitCost, 0);
      g.taxAmount = g.subtotal * (g.taxRate / 100);
      g.total = g.subtotal + g.taxAmount;
    }
    return Object.values(groups).sort((a, b) => (a.supplierName || 'zzz').localeCompare(b.supplierName || 'zzz'));
  }, [selectedItems, suppliers]);

  const handleCreateOrders = async () => {
    if (!user?.id || creating) return;
    setCreating(true);
    try {
      const ordersData = supplierGroups.map(g => ({
        supplierId: g.supplierId,
        supplierName: g.supplierName,
        status: 'draft' as const,
        source: 'manual' as const,
        items: g.items.map((item, i) => ({
          id: `poi-${Date.now()}-${i}`,
          catalogItemId: item.catalogItemId,
          sku: item.sku,
          name: item.name,
          quantity: item.quantity,
          unitCost: item.unitCost,
          total: item.quantity * item.unitCost,
          received: 0,
          notes: '',
        })),
        subtotal: g.subtotal,
        taxRate: g.taxRate,
        taxAmount: g.taxAmount,
        total: g.total,
        notes: '',
      }));

      const result = await createBulkPurchaseOrdersRequest(user.id, ordersData);
      setCreatedOrders(result.orders);
      toast.success(`${result.created} pedido(s) creado(s)`);
    } catch (err: any) {
      toast.error(err?.message || 'Error al crear pedidos');
    } finally {
      setCreating(false);
    }
  };

  const handleSend = async (orderId: string, method: 'email' | 'whatsapp' | 'portal') => {
    if (!user?.id) return;
    setSending(prev => ({ ...prev, [orderId]: true }));
    try {
      const result = await sendPurchaseOrderRequest(user.id, orderId, method);
      if (method === 'whatsapp' && result.waUrl) {
        window.open(result.waUrl, '_blank');
      }
      setCreatedOrders(prev => prev.map(o => o._id === orderId ? result.order : o));
      toast.success(`Pedido enviado por ${method === 'email' ? 'email' : method === 'whatsapp' ? 'WhatsApp' : 'Portal Vertial'}`);
    } catch (err: any) {
      toast.error(err?.message || 'Error al enviar pedido');
    } finally {
      setSending(prev => ({ ...prev, [orderId]: false }));
    }
  };

  const handleNext = () => {
    if (step === 2) {
      handleCreateOrders();
    }
    setStep(s => Math.min(s + 1, STEPS.length - 1));
  };

  const canProceed = step === 0 || step === 1 ? true : step === 2 ? selectedItems.size > 0 : true;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-900 dark:bg-gray-100 rounded-xl flex items-center justify-center">
              <ShoppingBag className="w-5 h-5 text-white dark:text-gray-900" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Nuevo pedido de compra</h2>
              <p className="text-sm text-gray-400">{selectedItems.size} artículo(s) seleccionado(s)</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Step indicator */}
        <StepIndicator currentStep={step} steps={STEPS} />

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {step === 0 && (
            <RecommendationStep
              forecast={forecast}
              suppliers={suppliers}
              selectedItems={selectedItems}
              onToggleItem={handleToggleRecommendedItem}
              onUpdateItem={handleUpdateItem}
              loading={loading}
            />
          )}
          {step === 1 && (
            <ManualAddStep
              catalogItems={catalogItems}
              suppliers={suppliers}
              selectedItems={selectedItems}
              onAddItem={handleAddManualItem}
              onRemoveItem={handleRemoveItem}
              onUpdateItem={handleUpdateItem}
            />
          )}
          {step === 2 && <SummaryStep supplierGroups={supplierGroups} />}
          {step === 3 && (
            <SendStep
              supplierGroups={supplierGroups}
              createdOrders={createdOrders}
              sending={sending}
              onSend={handleSend}
            />
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          <button
            onClick={() => step > 0 ? setStep(s => s - 1) : onClose()}
            className="px-4 py-2.5 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 rounded-xl font-medium text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            {step === 0 ? 'Cancelar' : 'Anterior'}
          </button>

          <div className="flex items-center gap-2">
            {step < STEPS.length - 1 ? (
              <button
                onClick={handleNext}
                disabled={step === 2 && selectedItems.size === 0}
                className="px-5 py-2.5 bg-gray-900 hover:bg-black dark:bg-gray-100 dark:hover:bg-white text-white dark:text-gray-900 rounded-xl font-semibold text-sm transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {step === 2 ? (creating ? 'Creando...' : 'Crear pedidos') : 'Siguiente'}
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={() => { onComplete(createdOrders); onClose(); }}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold text-sm transition-colors flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                Finalizar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
