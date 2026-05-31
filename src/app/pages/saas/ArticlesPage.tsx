import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useModalClose } from '../../hooks/useModalClose';
import { toast } from 'sonner';
import { Layout } from '../../components/saas/Layout';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { useActiveStoreScope } from '../../context/ActiveStoreScopeContext';
import { useSyncDeliveryPdvFilter } from '../../hooks/useSyncDeliveryPdvFilter';
import { resolveBusinessDataUserId } from '../../lib/tenantUserId';
import { listBrandsRequest, type Brand } from '../../lib/brandApi';
import { catalogItemOperatesAtWorkCenter } from '../../lib/pdvScope';
import { useVerticalCatalog } from '../../hooks/useVerticalCatalog';
import {
  listCatalogItemsRequest,
  createCatalogItemRequest,
  updateCatalogItemRequest,
  bulkCreateCatalogItemsRequest,
  listSuppliersRequest,
  listPurchaseInvoicesRequest,
  type CatalogItem,
  type Supplier,
  type PurchaseInvoice,
} from '../../lib/deliveryApi';
import { listSalesPoints, type SalesPoint } from '../../lib/salesPointsApi';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  X,
  Plus,
  Package,
  AlertTriangle,
  CheckCircle2,
  ArrowUpDown,
  Archive,
  BookOpen,
  Factory,
  ShoppingBag,
  ExternalLink,
  Search,
  TrendingDown,
  TrendingUp,
  BarChart3,
  MapPin,
  Camera,
  ShoppingCart,
  Warehouse,
  DollarSign,
  History,
  FileText,
  ChevronRight,
  CalendarDays,
  Ruler,
  Tag,
  ClipboardList,
  Shield,
  Bell,
  MessageSquare,
  Upload,
} from 'lucide-react';

// ─── Article label by vertical ─────────────────────────────────────────────────

const ARTICLE_LABELS: Record<string, { singular: string; plural: string }> = {
  carDealership: { singular: 'Compra', plural: 'Compras' },
  realEstate: { singular: 'Compra', plural: 'Compras' },
};

function getArticleLabel(businessType: string) {
  return ARTICLE_LABELS[businessType] || { singular: 'Stock', plural: 'Stock' };
}

// ─── Quick Add Modal ────────────────────────────────────────────────────────────

interface QuickAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<CatalogItem>, openDetail?: boolean) => Promise<void>;
  categories: string[];
  units: { value: string; label: string }[];
  articleLabel: string;
  businessType: string;
  suppliers: Supplier[];
}

function QuickAddArticleModal({ isOpen, onClose, onSave, categories, units, articleLabel, businessType, suppliers }: QuickAddModalProps) {
  const [name, setName] = useState('');
  const [unit, setUnit] = useState(units[0]?.value || 'ud');
  const [category, setCategory] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState('');

  useEffect(() => {
    if (isOpen) {
      setName('');
      setUnit(units[0]?.value || 'ud');
      setCategory('');
      setCostPrice('');
      setShowNewCategory(false);
      setNewCategory('');
      setSelectedSupplier('');
    }
  }, [isOpen, units]);
  useModalClose(isOpen, onClose);

  if (!isOpen) return null;

  const doSave = async (openDetail: boolean) => {
    if (!name.trim()) { toast.error('El nombre es obligatorio'); return; }
    const finalCategory = showNewCategory ? newCategory.trim() : category;
    const sup = suppliers.find(s => s._id === selectedSupplier);
    setSubmitting(true);
    try {
      await onSave({
        vertical: businessType,
        name: name.trim(),
        unit,
        category: finalCategory,
        costPrice: Number(costPrice) || 0,
        supplierId: selectedSupplier || '',
        supplierName: sup?.name || '',
        active: true,
        available: true,
        stockQuantity: 0,
        minStock: 0,
      }, openDetail);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await doSave(false);
  };

  const inputClass = 'w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100';
  const labelClass = 'block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Añadir {articleLabel.toLowerCase()}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Alta rápida</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors">
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className={labelClass}>Nombre *</label>
            <input className={inputClass} placeholder={`Nombre del ${articleLabel.toLowerCase()}...`} value={name} onChange={e => setName(e.target.value)} autoFocus />
          </div>
          <div>
            <label className={labelClass}>Unidad de medida</label>
            <select className={inputClass} value={unit} onChange={e => setUnit(e.target.value)}>
              {units.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Categoría</label>
            {showNewCategory ? (
              <div className="flex gap-2">
                <input
                  className={`${inputClass} flex-1`}
                  placeholder="Nueva categoría..."
                  value={newCategory}
                  onChange={e => setNewCategory(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') { setShowNewCategory(false); setNewCategory(''); } }}
                  autoFocus
                />
                <button type="button" onClick={() => { setShowNewCategory(false); setNewCategory(''); }} className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-sm rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">✕</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <select className={`${inputClass} flex-1`} value={category} onChange={e => setCategory(e.target.value)}>
                  <option value="">Sin categoría</option>
                  {categories.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                </select>
                <button type="button" onClick={() => setShowNewCategory(true)} className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-sm rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors whitespace-nowrap" title="Nueva categoría">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
          <div>
            <label className={labelClass}>Coste (€)</label>
            <input type="number" step="0.01" className={inputClass} placeholder="0.00" value={costPrice} onChange={e => setCostPrice(e.target.value)} />
          </div>
          {suppliers.length > 0 && (
            <div>
              <label className={labelClass}>Proveedor</label>
              <select className={inputClass} value={selectedSupplier} onChange={e => setSelectedSupplier(e.target.value)}>
                <option value="">Sin proveedor</option>
                {suppliers.filter(s => s.active !== false).map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancelar</button>
            <button type="submit" disabled={submitting || !name.trim()} className="flex-1 px-4 py-3 bg-gray-900 hover:bg-black dark:bg-gray-100 dark:hover:bg-white dark:text-gray-900 text-white rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {submitting ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
          <button
            type="button"
            onClick={() => doSave(true)}
            disabled={submitting || !name.trim()}
            className="w-full px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Plus className="w-3.5 h-3.5" />
            Guardar y completar ficha
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Stock Adjust Modal ─────────────────────────────────────────────────────────

interface StockAdjustModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: CatalogItem | null;
  onAdjust: (item: CatalogItem, newQuantity: number) => void;
}

function StockAdjustModal({ isOpen, onClose, item, onAdjust }: StockAdjustModalProps) {
  const [adjustment, setAdjustment] = useState('');
  useEffect(() => { setAdjustment(''); }, [isOpen]);
  if (!isOpen || !item) return null;
  const newQty = item.stockQuantity + (Number(adjustment) || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Ajustar stock</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{item.name}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors">
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900 rounded-xl">
            <span className="text-sm text-gray-600 dark:text-gray-400">Stock actual</span>
            <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">{item.stockQuantity} {item.unit}</span>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
              Ajuste (positivo para añadir, negativo para restar)
            </label>
            <input type="number" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-center text-xl font-bold" placeholder="0" value={adjustment} onChange={e => setAdjustment(e.target.value)} autoFocus />
          </div>
          <div className={`flex items-center justify-between p-4 rounded-xl ${newQty < item.minStock ? 'bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800' : 'bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800'}`}>
            <span className={`text-sm ${newQty < item.minStock ? 'text-red-600' : 'text-green-600'}`}>Nuevo stock</span>
            <span className={`text-2xl font-bold ${newQty < item.minStock ? 'text-red-700 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}>{newQty} {item.unit}</span>
          </div>
          <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 -mx-6 px-6 -mb-6 pb-6 pt-4 flex gap-3 rounded-b-2xl">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancelar</button>
            <button type="button" onClick={() => onAdjust(item, newQty)} disabled={!adjustment || Number(adjustment) === 0} className="flex-1 px-4 py-3 bg-gray-900 hover:bg-black dark:bg-gray-100 dark:hover:bg-white dark:text-gray-900 text-white rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed">Aplicar ajuste</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Article Detail Drawer ──────────────────────────────────────────────────────

type DetailTab = 'info' | 'compras' | 'stocks' | 'costes' | 'historico' | 'documentacion';

interface ArticleDetailDrawerProps {
  item: CatalogItem | null;
  onClose: () => void;
  onStockAdjust: (item: CatalogItem) => void;
  onUpdate: (item: CatalogItem) => Promise<void>;
  suppliers: Supplier[];
  invoices: PurchaseInvoice[];
  allItems: CatalogItem[];
  navigate: (path: string) => void;
  articleLabel: string;
}

function ArticleDetailDrawer({ item, onClose, onStockAdjust, onUpdate, suppliers, invoices, allItems, navigate, articleLabel }: ArticleDetailDrawerProps) {
  const [tab, setTab] = useState<DetailTab>('info');
  const [note, setNote] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [optimalStock, setOptimalStock] = useState('');
  const [maxStock, setMaxStock] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editSupplierId, setEditSupplierId] = useState('');
  const [editUnitPrice, setEditUnitPrice] = useState('');
  const [editCostPrice, setEditCostPrice] = useState('');

  useEffect(() => {
    if (item) {
      setTab('info');
      setNote('');
      setImageUrl(item.image || '');
      setOptimalStock(String((item.customFields as Record<string, unknown>)?.optimalStock || ''));
      setMaxStock(String((item.customFields as Record<string, unknown>)?.maxStock || ''));
      setEditDescription(item.description || '');
      setEditSupplierId(item.supplierId || '');
      setEditUnitPrice(String(item.unitPrice || ''));
      setEditCostPrice(String(item.costPrice || ''));
    }
  }, [item?._id]);

  useModalClose(!!item, onClose);

  if (!item) return null;

  const supplier = suppliers.find(s => s._id === item.supplierId);

  const itemInvoices = invoices.filter(inv =>
    inv.lines?.some(l => l.itemName?.toLowerCase() === item.name.toLowerCase())
  );
  const purchaseHistory = itemInvoices
    .map(inv => {
      const line = inv.lines.find(l => l.itemName?.toLowerCase() === item.name.toLowerCase());
      const sup = suppliers.find(s => s._id === inv.supplierId);
      return {
        date: inv.date,
        supplierName: inv.supplierName || sup?.name || '—',
        supplierId: inv.supplierId,
        quantity: line?.quantity || 0,
        unitCost: line?.unitPrice || 0,
        total: line?.total || 0,
      };
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const lastPurchase = purchaseHistory[0];
  const avgCost = purchaseHistory.length > 0
    ? purchaseHistory.reduce((s, p) => s + p.unitCost * p.quantity, 0) / purchaseHistory.reduce((s, p) => s + p.quantity, 0)
    : item.costPrice;

  const costEvolution = purchaseHistory
    .slice()
    .reverse()
    .map(p => ({
      date: new Date(p.date).toLocaleDateString('es-ES', { month: 'short', year: '2-digit' }),
      coste: Number(p.unitCost.toFixed(2)),
    }));

  const usedInProducts = allItems.filter(
    i => i._id !== item._id && i.category === item.category
  ).slice(0, 5);

  const inventoryValue = item.stockQuantity * item.costPrice;
  const isLow = item.stockQuantity <= item.minStock;

  const tabs: { id: DetailTab; label: string; icon: React.ReactNode }[] = [
    { id: 'info', label: 'Info', icon: <Camera className="w-4 h-4" /> },
    { id: 'compras', label: 'Compras', icon: <ShoppingCart className="w-4 h-4" /> },
    { id: 'stocks', label: 'Stocks', icon: <Warehouse className="w-4 h-4" /> },
    { id: 'costes', label: 'Costes', icon: <DollarSign className="w-4 h-4" /> },
    { id: 'historico', label: 'Histórico', icon: <History className="w-4 h-4" /> },
    { id: 'documentacion', label: 'Docs', icon: <FileText className="w-4 h-4" /> },
  ];

  const handleSaveInfo = async () => {
    const sup = suppliers.find(s => s._id === editSupplierId);
    await onUpdate({
      ...item,
      image: imageUrl,
      description: editDescription,
      supplierId: editSupplierId || '',
      supplierName: sup?.name || '',
      unitPrice: Number(editUnitPrice) || 0,
      costPrice: Number(editCostPrice) || 0,
    });
    toast.success('Información actualizada');
  };

  const infoHasChanges = imageUrl !== (item.image || '') ||
    editDescription !== (item.description || '') ||
    editSupplierId !== (item.supplierId || '') ||
    editUnitPrice !== String(item.unitPrice || '') ||
    editCostPrice !== String(item.costPrice || '');

  const handleSaveStockLevels = async () => {
    const cf = { ...(item.customFields || {}), optimalStock: Number(optimalStock) || 0, maxStock: Number(maxStock) || 0 };
    await onUpdate({ ...item, customFields: cf });
    toast.success('Niveles de stock actualizados');
  };

  const handleAddNote = async () => {
    if (!note.trim()) return;
    const existingNotes = item.notes || '';
    const timestamp = new Date().toLocaleString('es-ES');
    const newNotes = `${existingNotes}\n[${timestamp}] ${note.trim()}`.trim();
    await onUpdate({ ...item, notes: newNotes });
    setNote('');
    toast.success('Nota añadida');
  };

  const inputClass = 'w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100';

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white dark:bg-gray-800 w-full max-w-2xl h-full overflow-y-auto shadow-2xl animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3 min-w-0">
              {item.image ? (
                <img src={item.image} alt="" className="w-12 h-12 rounded-xl object-cover shrink-0" />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0">
                  <Package className="w-5 h-5 text-gray-400" />
                </div>
              )}
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">{item.name}</h2>
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                  {item.category && <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded-md text-xs">{item.category}</span>}
                  <span>{item.unit}</span>
                  {item.sku && <span>· SKU: {item.sku}</span>}
                </div>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors shrink-0">
              <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 px-4 pb-2 overflow-x-auto">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors ${tab === t.id ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="p-4 space-y-4">

          {/* ── Info tab ── */}
          {tab === 'info' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">Fotografía del {articleLabel.toLowerCase()}</label>
                {imageUrl ? (
                  <div className="relative">
                    <img src={imageUrl} alt={item.name} className="w-full h-48 object-cover rounded-xl border-2 border-gray-200 dark:border-gray-700" />
                    <button onClick={() => setImageUrl('')} className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-black/70 rounded-lg transition-colors">
                      <X className="w-4 h-4 text-white" />
                    </button>
                  </div>
                ) : (
                  <div className="w-full h-48 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl flex flex-col items-center justify-center text-gray-400 gap-2">
                    <Upload className="w-8 h-8" />
                    <span className="text-sm">Sin imagen</span>
                  </div>
                )}
                <div className="flex gap-2">
                  <input className={`${inputClass} flex-1 text-sm`} placeholder="URL de la imagen..." value={imageUrl} onChange={e => setImageUrl(e.target.value)} />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Descripción</label>
                <textarea
                  className={`${inputClass} text-sm min-h-[60px] resize-none`}
                  placeholder={`Describe el ${articleLabel.toLowerCase()}...`}
                  value={editDescription}
                  onChange={e => setEditDescription(e.target.value)}
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Coste (€)</label>
                  <input type="number" step="0.01" className={`${inputClass} text-sm`} placeholder="0.00" value={editCostPrice} onChange={e => setEditCostPrice(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Precio venta (€)</label>
                  <input type="number" step="0.01" className={`${inputClass} text-sm`} placeholder="0.00" value={editUnitPrice} onChange={e => setEditUnitPrice(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-xl">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Stock actual</div>
                  <div className={`text-lg font-bold ${isLow ? 'text-red-600' : 'text-gray-900 dark:text-gray-100'}`}>{item.stockQuantity} {item.unit}</div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Proveedor</label>
                  <select className={`${inputClass} text-sm`} value={editSupplierId} onChange={e => setEditSupplierId(e.target.value)}>
                    <option value="">Sin proveedor</option>
                    {suppliers.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
                  </select>
                  {editSupplierId && (
                    <button
                      onClick={() => navigate('/saas/suppliers')}
                      className="mt-1 text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                    >
                      Ver ficha del proveedor <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {editCostPrice && editUnitPrice && Number(editCostPrice) > 0 && Number(editUnitPrice) > 0 && (
                <div className="p-3 bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800 rounded-xl">
                  <div className="text-xs font-semibold text-green-700 dark:text-green-400 mb-1">Margen</div>
                  <div className="text-lg font-bold text-green-900 dark:text-green-200">
                    {(Number(editUnitPrice) - Number(editCostPrice)).toFixed(2)}€
                    <span className="text-sm font-normal ml-2">
                      ({((Number(editUnitPrice) - Number(editCostPrice)) / Number(editCostPrice) * 100).toFixed(0)}%)
                    </span>
                  </div>
                </div>
              )}

              <button
                onClick={handleSaveInfo}
                disabled={!infoHasChanges}
                className="w-full px-4 py-3 bg-gray-900 hover:bg-black dark:bg-gray-100 dark:hover:bg-white dark:text-gray-900 text-white rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Guardar cambios
              </button>
            </div>
          )}

          {/* ── Compras tab ── */}
          {tab === 'compras' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-xl">
                <ShoppingCart className="w-5 h-5 text-blue-600 shrink-0" />
                <p className="text-sm text-blue-800 dark:text-blue-300">Historial de compras a proveedores</p>
              </div>

              {purchaseHistory.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <ShoppingCart className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Sin compras registradas</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {purchaseHistory.map((p, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700 rounded-xl hover:border-gray-300 dark:hover:border-gray-600 transition-colors">
                      <div className="min-w-0">
                        <button onClick={() => navigate('/saas/suppliers')} className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline truncate block">
                          {p.supplierName}
                        </button>
                        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          <CalendarDays className="w-3 h-3" />
                          {new Date(p.date).toLocaleDateString('es-ES')}
                          <span>·</span>
                          <span>{p.quantity} {item.unit}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-bold text-gray-900 dark:text-gray-100">{p.unitCost.toFixed(2)}€/{item.unit}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Total: {p.total.toFixed(2)}€</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {lastPurchase && (
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-800 rounded-xl">
                  <div className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">Última compra</div>
                  <div className="text-sm text-amber-900 dark:text-amber-200">
                    {new Date(lastPurchase.date).toLocaleDateString('es-ES')} — {lastPurchase.unitCost.toFixed(2)}€/{item.unit} de {lastPurchase.supplierName}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Stocks tab ── */}
          {tab === 'stocks' && (
            <div className="space-y-4">
              <div className={`p-4 rounded-xl border-2 ${isLow ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className={`text-xs font-semibold ${isLow ? 'text-red-700 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}>Stock actual</div>
                    <div className={`text-3xl font-bold ${isLow ? 'text-red-600' : 'text-green-700 dark:text-green-300'}`}>{item.stockQuantity} {item.unit}</div>
                  </div>
                  <button onClick={() => onStockAdjust(item)} className="px-4 py-2 bg-gray-900 dark:bg-gray-100 dark:text-gray-900 text-white rounded-xl text-sm font-medium hover:bg-black dark:hover:bg-white transition-colors">
                    <ArrowUpDown className="w-4 h-4 inline mr-1.5" />Ajustar
                  </button>
                </div>
              </div>

              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-xl">
                <div className="text-xs font-semibold text-blue-700 dark:text-blue-400 mb-1">Valor del inventario</div>
                <div className="text-2xl font-bold text-blue-900 dark:text-blue-200">{inventoryValue.toLocaleString('es-ES', { maximumFractionDigits: 2 })}€</div>
                <div className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">{item.stockQuantity} {item.unit} × {item.costPrice.toFixed(2)}€</div>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100">Niveles de stock</h4>
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-xl">
                    <div className="text-xs text-red-700 dark:text-red-400 mb-1">Mínimo</div>
                    <div className="text-lg font-bold text-red-900 dark:text-red-200">{item.minStock}</div>
                  </div>
                  <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-800 rounded-xl">
                    <div className="text-xs text-amber-700 dark:text-amber-400 mb-1">Óptimo</div>
                    <input type="number" className="w-full bg-transparent text-lg font-bold text-amber-900 dark:text-amber-200 outline-none" placeholder="—" value={optimalStock} onChange={e => setOptimalStock(e.target.value)} />
                  </div>
                  <div className="p-3 bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800 rounded-xl">
                    <div className="text-xs text-green-700 dark:text-green-400 mb-1">Máximo</div>
                    <input type="number" className="w-full bg-transparent text-lg font-bold text-green-900 dark:text-green-200 outline-none" placeholder="—" value={maxStock} onChange={e => setMaxStock(e.target.value)} />
                  </div>
                </div>
                <button onClick={handleSaveStockLevels} className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  Guardar niveles
                </button>
              </div>

              {/* Visual stock gauge */}
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100">Gauge</h4>
                <div className="h-4 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden relative">
                  {item.minStock > 0 && (
                    <div className="absolute h-full border-r-2 border-red-500" style={{ left: `${Math.min(100, (item.minStock / (Number(maxStock) || item.minStock * 4)) * 100)}%` }} />
                  )}
                  {Number(optimalStock) > 0 && (
                    <div className="absolute h-full border-r-2 border-amber-500" style={{ left: `${Math.min(100, (Number(optimalStock) / (Number(maxStock) || item.minStock * 4)) * 100)}%` }} />
                  )}
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${isLow ? 'bg-red-500' : item.stockQuantity > (Number(optimalStock) || item.minStock * 2) ? 'bg-green-500' : 'bg-amber-500'}`}
                    style={{ width: `${Math.min(100, (item.stockQuantity / (Number(maxStock) || item.minStock * 4 || 100)) * 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                  <span>0</span>
                  {item.minStock > 0 && <span className="text-red-500">Min: {item.minStock}</span>}
                  {Number(optimalStock) > 0 && <span className="text-amber-500">Ópt: {optimalStock}</span>}
                  {Number(maxStock) > 0 && <span className="text-green-500">Max: {maxStock}</span>}
                </div>
              </div>
            </div>
          )}

          {/* ── Costes tab ── */}
          {tab === 'costes' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-xl">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Última compra</div>
                  <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{lastPurchase ? `${lastPurchase.unitCost.toFixed(2)}€` : '—'}</div>
                  {lastPurchase && <div className="text-xs text-gray-400 mt-0.5">{new Date(lastPurchase.date).toLocaleDateString('es-ES')}</div>}
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-xl">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Coste promedio ponderado</div>
                  <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{avgCost.toFixed(2)}€</div>
                  <div className="text-xs text-gray-400 mt-0.5">{purchaseHistory.length} compras</div>
                </div>
              </div>

              {item.costPrice > 0 && item.unitPrice > 0 && (
                <div className="p-3 bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800 rounded-xl">
                  <div className="text-xs font-semibold text-green-700 dark:text-green-400 mb-1">Margen</div>
                  <div className="text-lg font-bold text-green-900 dark:text-green-200">
                    {(item.unitPrice - item.costPrice).toFixed(2)}€
                    <span className="text-sm font-normal ml-2">
                      ({((item.unitPrice - item.costPrice) / item.costPrice * 100).toFixed(0)}%)
                    </span>
                  </div>
                </div>
              )}

              {/* Cost evolution chart */}
              {costEvolution.length > 1 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100">Evolución de costes</h4>
                  <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-3">
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={costEvolution}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                        <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" tickFormatter={v => `${v}€`} />
                        <Tooltip formatter={(v: number) => [`${v.toFixed(2)}€`, 'Coste']} />
                        <Line type="monotone" dataKey="coste" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Used in products */}
              {usedInProducts.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100">Usado en productos de la misma categoría</h4>
                  <div className="space-y-1">
                    {usedInProducts.map(p => (
                      <div key={p._id} className="flex items-center justify-between p-2.5 bg-gray-50 dark:bg-gray-900 rounded-lg">
                        <span className="text-sm text-gray-700 dark:text-gray-300">{p.name}</span>
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Histórico tab ── */}
          {tab === 'historico' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 bg-purple-50 dark:bg-purple-900/20 border-2 border-purple-200 dark:border-purple-800 rounded-xl">
                <History className="w-5 h-5 text-purple-600 shrink-0" />
                <p className="text-sm text-purple-800 dark:text-purple-300">Movimientos y notas del {articleLabel.toLowerCase()}</p>
              </div>

              {/* Timeline */}
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100">Movimientos</h4>
                {purchaseHistory.length > 0 ? (
                  <div className="space-y-1">
                    {purchaseHistory.slice(0, 10).map((p, i) => (
                      <div key={i} className="flex items-start gap-3 p-2.5 bg-gray-50 dark:bg-gray-900 rounded-lg">
                        <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-sm text-gray-700 dark:text-gray-300">
                            <span className="font-medium">Recepción de compra</span> — {p.quantity} {item.unit} de {p.supplierName}
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5">{new Date(p.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4 text-gray-400 text-sm">Sin movimientos registrados</div>
                )}
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100">Notas</h4>
                {item.notes ? (
                  <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-xl text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {item.notes}
                  </div>
                ) : (
                  <div className="text-sm text-gray-400">Sin notas</div>
                )}
                <div className="flex gap-2">
                  <input className={`${inputClass} flex-1 text-sm`} placeholder="Añadir nota..." value={note} onChange={e => setNote(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleAddNote(); }} />
                  <button onClick={handleAddNote} disabled={!note.trim()} className="px-4 py-2 bg-gray-900 dark:bg-gray-100 dark:text-gray-900 text-white text-sm rounded-xl font-medium disabled:opacity-50 transition-colors">
                    <MessageSquare className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Documentación tab ── */}
          {tab === 'documentacion' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 bg-indigo-50 dark:bg-indigo-900/20 border-2 border-indigo-200 dark:border-indigo-800 rounded-xl">
                <FileText className="w-5 h-5 text-indigo-600 shrink-0" />
                <p className="text-sm text-indigo-800 dark:text-indigo-300">Documentación, fichas técnicas y certificados</p>
              </div>

              {[
                { icon: <ClipboardList className="w-5 h-5" />, title: 'Información nutricional', desc: 'Valores nutricionales, ingredientes, alérgenos', color: 'orange' },
                { icon: <FileText className="w-5 h-5" />, title: 'Ficha técnica', desc: 'Especificaciones técnicas del producto', color: 'blue' },
                { icon: <Shield className="w-5 h-5" />, title: 'Certificados', desc: 'Certificados de calidad, sanitarios, origen', color: 'green' },
                { icon: <Bell className="w-5 h-5" />, title: 'Alertas', desc: 'Alertas de caducidad, retirada, normativa', color: 'red' },
              ].map((doc, i) => {
                const colorMap: Record<string, string> = {
                  orange: 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800 text-orange-600',
                  blue: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-600',
                  green: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-600',
                  red: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-600',
                };
                return (
                  <div key={i} className={`p-4 border-2 rounded-xl ${colorMap[doc.color]} flex items-start gap-3 cursor-pointer hover:opacity-80 transition-opacity`}>
                    <div className="shrink-0 mt-0.5">{doc.icon}</div>
                    <div>
                      <div className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{doc.title}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{doc.desc}</div>
                      <div className="text-xs text-gray-400 mt-2">Sin documentos adjuntos · Haz clic para añadir</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────────

export function ArticlesPage() {
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const activeStoreScope = useActiveStoreScope();
  const dataUserId = resolveBusinessDataUserId(user, currentBusiness);
  const navigate = useNavigate();
  const { config: vc, businessType } = useVerticalCatalog();
  const articleLabels = getArticleLabel(businessType);

  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [salesPoints, setSalesPoints] = useState<SalesPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const [stockAdjustItem, setStockAdjustItem] = useState<CatalogItem | null>(null);
  const [detailItem, setDetailItem] = useState<CatalogItem | null>(null);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const [searchStock, setSearchStock] = useState('');
  const [filterStockStatus, setFilterStockStatus] = useState<'all' | 'low' | 'ok'>('all');
  const [filterSalesPoint, setFilterSalesPoint] = useState('all');

  useModalClose(!!stockAdjustItem, () => setStockAdjustItem(null));

  const loadData = useCallback(async () => {
    if (!dataUserId) return;
    const businessId = String(currentBusiness?.business_id || currentBusiness?.id || '');
    try {
      const [items, sps, sups, invs, brandList] = await Promise.all([
        listCatalogItemsRequest(dataUserId, 'stock'),
        listSalesPoints(dataUserId),
        listSuppliersRequest(dataUserId).catch(() => [] as Supplier[]),
        listPurchaseInvoicesRequest(dataUserId).catch(() => [] as PurchaseInvoice[]),
        businessId ? listBrandsRequest(businessId).catch(() => [] as Brand[]) : Promise.resolve([] as Brand[]),
      ]);
      setCatalogItems(items);
      setSalesPoints(sps);
      setSuppliers(sups);
      setInvoices(invs);
      setBrands(brandList);
    } catch {
      toast.error('Error al cargar stock');
    } finally {
      setLoading(false);
    }
  }, [dataUserId, currentBusiness?.business_id, currentBusiness?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  const activeWorkCenterId = useMemo(() => {
    const pdv = activeStoreScope.pointsOfSale.find(
      (p) => p._id === activeStoreScope.activeSalesPointId,
    );
    return String(pdv?.workCenterId || '').trim();
  }, [activeStoreScope.pointsOfSale, activeStoreScope.activeSalesPointId]);

  const applyStoreFilter = useCallback((pdvId: string | undefined) => {
    if (!pdvId) return;
    const pdv = activeStoreScope.pointsOfSale.find((p) => p._id === pdvId);
    const wc = String(pdv?.workCenterId || '').trim();
    if (wc) setFilterSalesPoint(wc);
  }, [activeStoreScope.pointsOfSale]);

  useSyncDeliveryPdvFilter(activeStoreScope.pointsOfSale, applyStoreFilter);

  useEffect(() => {
    if (activeWorkCenterId) setFilterSalesPoint(activeWorkCenterId);
  }, [activeWorkCenterId]);

  const handleStockAdjust = async (item: CatalogItem, newQuantity: number) => {
    if (!user?.id) return;
    try {
      const updated = await updateCatalogItemRequest(user.id, { ...item, stockQuantity: newQuantity });
      setCatalogItems(prev => prev.map(i => i._id === updated._id ? updated : i));
      if (detailItem?._id === updated._id) setDetailItem(updated);
      setStockAdjustItem(null);
      toast.success(`Stock de "${item.name}" actualizado a ${newQuantity}`);
    } catch {
      toast.error('Error al ajustar el stock');
    }
  };

  const handleQuickAdd = async (data: Partial<CatalogItem>, openDetail = false) => {
    if (!user?.id) return;
    try {
      const created = await createCatalogItemRequest(user.id, { ...data, module: 'stock' } as any);
      setCatalogItems(prev => [...prev, created]);
      toast.success(`"${created.name}" añadido`);
      if (openDetail) setDetailItem(created);
    } catch {
      toast.error('Error al crear el elemento');
    }
  };

  const handleUpdateItem = async (item: CatalogItem) => {
    if (!user?.id) return;
    try {
      const updated = await updateCatalogItemRequest(user.id, item);
      setCatalogItems(prev => prev.map(i => i._id === updated._id ? updated : i));
      if (detailItem?._id === updated._id) setDetailItem(updated);
    } catch {
      toast.error('Error al actualizar');
    }
  };

  const ARTICLE_AI_FIELDS: AIFieldDef[] = useMemo(() => {
    const f: AIFieldDef[] = [
      { key: 'name', label: 'Nombre' },
      { key: 'description', label: 'Descripción' },
      { key: 'category', label: 'Categoría' },
      { key: 'unit', label: `Unidad (${vc.units.map(u => u.value).slice(0, 4).join('/')})` },
      { key: 'unitPrice', label: 'Precio venta', type: 'number' },
      { key: 'costPrice', label: 'Precio coste', type: 'number' },
      { key: 'stockQuantity', label: 'Stock actual', type: 'number' },
      { key: 'minStock', label: 'Stock mínimo', type: 'number' },
      { key: 'notes', label: 'Notas' },
    ];
    return f;
  }, [vc.units]);

  const ARTICLE_IMPORT_FIELDS: ImportFieldDef[] = useMemo(() => [
    { key: 'name', label: 'Nombre', required: true, example: 'Tornillo M6x20' },
    { key: 'description', label: 'Descripción', example: 'Tornillo métrico cabeza hexagonal' },
    { key: 'category', label: 'Categoría', example: vc.categories[0] || 'general' },
    { key: 'unit', label: 'Unidad', example: vc.units[0]?.value || 'ud' },
    { key: 'unitPrice', label: 'Precio venta', required: true, example: '2.50' },
    { key: 'costPrice', label: 'Precio coste', example: '0.80' },
    { key: 'stockQuantity', label: 'Stock actual', example: '100' },
    { key: 'minStock', label: 'Stock mínimo', example: '20' },
    { key: 'sku', label: 'SKU / Referencia', example: 'TORN-M6-20' },
    { key: 'barcode', label: 'Código de barras', example: '8412345678901' },
    { key: 'notes', label: 'Notas', example: '' },
  ], [vc]);

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    if (!user?.id) return;
    const items = entries.map(entry => ({
      name: String(entry.name || ''),
      description: String(entry.description || ''),
      category: String(entry.category || ''),
      unit: String(entry.unit || vc.units[0]?.value || 'ud'),
      vertical: businessType,
      module: 'stock' as const,
      unitPrice: Number(entry.unitPrice) || 0,
      costPrice: Number(entry.costPrice) || 0,
      stockQuantity: Number(entry.stockQuantity) || 0,
      minStock: Number(entry.minStock) || 0,
      active: true,
      webVisible: true,
      available: true,
      notes: String(entry.notes || ''),
    }));
    try {
      const result = await bulkCreateCatalogItemsRequest(user.id, items as any);
      if (result.created > 0) {
        toast.success(`${result.created} ${articleLabels.singular.toLowerCase()}(s) creado(s) con IA`);
        loadData();
      }
      if (result.errors > 0) {
        toast.error(`${result.errors} artículo(s) no se pudieron crear`);
      }
    } catch {
      toast.error('Error en la importación con IA');
    }
    setShowAIModal(false);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    if (!user?.id) return;
    const items = entries.map(entry => ({
      name: entry.name || '',
      description: entry.description || '',
      category: entry.category || '',
      unit: entry.unit || vc.units[0]?.value || 'ud',
      vertical: businessType,
      module: 'stock' as const,
      unitPrice: Number(entry.unitPrice) || 0,
      costPrice: Number(entry.costPrice) || 0,
      stockQuantity: Number(entry.stockQuantity) || 0,
      minStock: Number(entry.minStock) || 0,
      sku: entry.sku || '',
      barcode: entry.barcode || '',
      active: true,
      webVisible: true,
      available: true,
      notes: entry.notes || '',
    }));
    const result = await bulkCreateCatalogItemsRequest(user.id, items as any);
    if (result.created > 0) {
      loadData();
    }
    if (result.errors > 0) {
      toast.error(`${result.errors} artículo(s) no se pudieron importar`);
    }
    return result.created;
  };

  const categories = useMemo(() => {
    const fromItems = catalogItems.map(i => i.category).filter(Boolean);
    const fromConfig = vc.categories || [];
    return [...new Set([...fromConfig, ...fromItems])].sort();
  }, [catalogItems, vc.categories]);

  const kpis = useMemo(() => ({
    totalItems: catalogItems.length,
    lowStock: catalogItems.filter(i => i.active && i.stockQuantity <= i.minStock).length,
    totalUnits: catalogItems.reduce((s, i) => s + i.stockQuantity, 0),
    inventoryValue: catalogItems.reduce((s, i) => s + (i.stockQuantity * i.costPrice), 0),
  }), [catalogItems]);

  const filteredItems = useMemo(() => {
    let items = [...catalogItems];
    if (searchStock) {
      const q = searchStock.toLowerCase();
      items = items.filter(i => i.name.toLowerCase().includes(q) || i.category?.toLowerCase().includes(q) || i.sku?.toLowerCase().includes(q) || i.salesPointName?.toLowerCase().includes(q));
    }
    if (filterStockStatus === 'low') {
      items = items.filter(i => i.active && i.stockQuantity <= i.minStock);
    } else if (filterStockStatus === 'ok') {
      items = items.filter(i => !i.active || i.stockQuantity > i.minStock);
    }
    if (filterSalesPoint !== 'all') {
      items = items.filter((i) => catalogItemOperatesAtWorkCenter(i, brands, filterSalesPoint));
    }
    items.sort((a, b) => {
      const aLow = a.stockQuantity <= a.minStock ? 0 : 1;
      const bLow = b.stockQuantity <= b.minStock ? 0 : 1;
      return aLow - bLow || a.stockQuantity - b.stockQuantity;
    });
    return items;
  }, [catalogItems, searchStock, filterStockStatus, filterSalesPoint, brands]);

  const lowStockItems = useMemo(() => catalogItems.filter(i => i.active && i.stockQuantity <= i.minStock), [catalogItems]);

  return (
    <Layout title={articleLabels.plural} subtitle="Control de inventario y gestión de stock">
      <div className="space-y-6">
        {/* Quick nav + Add button */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <button onClick={() => navigate('/saas/catalog')} className="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5" /> Catálogo <ExternalLink className="w-3 h-3" />
            </button>
            <button onClick={() => navigate('/saas/suppliers')} className="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex items-center gap-1.5">
              <Factory className="w-3.5 h-3.5" /> Proveedores <ExternalLink className="w-3 h-3" />
            </button>
            <button onClick={() => navigate('/saas/orders')} className="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex items-center gap-1.5">
              <ShoppingBag className="w-3.5 h-3.5" /> Pedidos <ExternalLink className="w-3 h-3" />
            </button>
          </div>
          <AddButtonDropdown
            label={articleLabels.singular}
            onQuickAdd={() => setShowQuickAdd(true)}
            onAIAdd={() => setShowAIModal(true)}
            onImport={() => setShowImportModal(true)}
            quickAddLabel="Alta rápida"
            quickAddDesc={`Formulario de ${articleLabels.singular.toLowerCase()}`}
          />
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
            <input className="pl-9 pr-4 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-56" placeholder={`Buscar ${articleLabels.singular.toLowerCase()}...`} value={searchStock} onChange={e => setSearchStock(e.target.value)} />
          </div>
          {salesPoints.length > 0 && (
            <div className="relative">
              <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-gray-500 pointer-events-none" />
              <select
                value={filterSalesPoint}
                onChange={e => setFilterSalesPoint(e.target.value)}
                className="pl-8 pr-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-gray-900 outline-none"
              >
                <option value="all">Todos los centros</option>
                {salesPoints.map(sp => (<option key={sp.id} value={sp.id}>{sp.name}</option>))}
              </select>
            </div>
          )}
          <div className="flex gap-1.5">
            {(['all', 'low', 'ok'] as const).map(status => (
              <button key={status} onClick={() => setFilterStockStatus(status)}
                className={`px-3 py-2 text-xs font-semibold rounded-xl border-2 transition-colors ${filterStockStatus === status ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-400'}`}>
                {status === 'all' ? 'Todos' : status === 'low' ? 'Stock bajo' : 'Stock OK'}
              </button>
            ))}
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-xl">
            <div className="text-blue-600 mb-2"><Package className="w-5 h-5" /></div>
            <div className="text-2xl font-bold text-blue-900 dark:text-blue-200">{kpis.totalItems}</div>
            <div className="text-xs text-blue-700 dark:text-blue-400 mt-0.5">{articleLabels.plural} registrados</div>
          </div>
          <div className={`p-4 border-2 rounded-xl ${kpis.lowStock > 0 ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'}`}>
            <div className={`mb-2 ${kpis.lowStock > 0 ? 'text-red-600' : 'text-green-600'}`}>{kpis.lowStock > 0 ? <TrendingDown className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}</div>
            <div className={`text-2xl font-bold ${kpis.lowStock > 0 ? 'text-red-900 dark:text-red-200' : 'text-green-900 dark:text-green-200'}`}>{kpis.lowStock}</div>
            <div className={`text-xs mt-0.5 ${kpis.lowStock > 0 ? 'text-red-700 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}>Stock bajo</div>
          </div>
          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-800 rounded-xl">
            <div className="text-amber-600 mb-2"><BarChart3 className="w-5 h-5" /></div>
            <div className="text-2xl font-bold text-amber-900 dark:text-amber-200">{kpis.totalUnits.toLocaleString('es-ES')}</div>
            <div className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">Unidades totales</div>
          </div>
          <div className="p-4 bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800 rounded-xl">
            <div className="text-green-600 mb-2"><TrendingUp className="w-5 h-5" /></div>
            <div className="text-2xl font-bold text-green-900 dark:text-green-200">{kpis.inventoryValue.toLocaleString('es-ES', { maximumFractionDigits: 0 })}€</div>
            <div className="text-xs text-green-700 dark:text-green-400 mt-0.5">Valor del inventario</div>
          </div>
        </div>

        {/* Low stock alert */}
        {lowStockItems.length > 0 && (
          <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-xl p-4">
            <h3 className="font-bold text-red-900 dark:text-red-300 mb-3 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              Alertas de stock bajo ({lowStockItems.length})
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {lowStockItems.map(item => (
                <div key={item._id} className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-xl border border-red-200 dark:border-red-800">
                  <div>
                    <div className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{item.name}</div>
                    <div className="text-xs text-red-600">Stock: {item.stockQuantity} {item.unit} (mín: {item.minStock})</div>
                  </div>
                  <button onClick={() => setStockAdjustItem(item)} className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-colors">Reponer</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stock grid */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-500 dark:text-gray-400">
            <div className="animate-spin w-6 h-6 border-2 border-gray-300 border-t-gray-900 rounded-full mr-3" />
            Cargando {articleLabels.plural.toLowerCase()}...
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
            <Archive className="w-12 h-12 text-gray-300 mb-3" />
            <p className="font-semibold">Sin {articleLabels.plural.toLowerCase()} en inventario</p>
            <p className="text-sm mt-1">Añade {articleLabels.plural.toLowerCase()} para comenzar</p>
            <button onClick={() => setShowQuickAdd(true)} className="mt-4 px-4 py-2.5 bg-gray-900 dark:bg-gray-100 dark:text-gray-900 text-white rounded-xl text-sm font-semibold flex items-center gap-2">
              <Plus className="w-4 h-4" /> Añadir {articleLabels.singular.toLowerCase()}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredItems.map(item => {
              const isLow = item.stockQuantity <= item.minStock;
              const stockPct = item.minStock > 0 ? Math.min(100, Math.round((item.stockQuantity / (item.minStock * 3)) * 100)) : 100;
              return (
                <div
                  key={item._id}
                  className={`bg-white dark:bg-gray-800 border-2 rounded-xl p-4 transition-all cursor-pointer hover:shadow-md ${isLow ? 'border-red-300 dark:border-red-800' : 'border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500'}`}
                  onClick={() => setDetailItem(item)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-900 dark:text-gray-100 text-sm truncate">{item.name}</div>
                      {item.category && <span className="text-xs text-gray-500 dark:text-gray-400">{item.category}</span>}
                    </div>
                    {isLow && <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />}
                  </div>
                  <div className={`text-3xl font-bold mb-1 ${isLow ? 'text-red-600' : 'text-gray-900 dark:text-gray-100'}`}>{item.stockQuantity}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{item.unit} · Mín: {item.minStock}</div>
                  {item.supplierName && (
                    <button onClick={e => { e.stopPropagation(); navigate('/saas/suppliers'); }} className="text-xs text-blue-600 dark:text-blue-400 hover:underline mb-1 block">{item.supplierName}</button>
                  )}
                  {item.salesPointName && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-800 mb-2">
                      <MapPin className="w-3 h-3" />{item.salesPointName}
                    </span>
                  )}
                  <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden mb-3">
                    <div className={`h-full rounded-full transition-all duration-500 ${isLow ? 'bg-red-500' : stockPct > 60 ? 'bg-green-500' : 'bg-amber-500'}`} style={{ width: `${stockPct}%` }} />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={e => { e.stopPropagation(); setStockAdjustItem(item); }} className="flex-1 px-3 py-2 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center justify-center gap-1.5">
                      <ArrowUpDown className="w-3.5 h-3.5" /> Ajustar
                    </button>
                    <button onClick={e => { e.stopPropagation(); navigate('/saas/orders'); }} className="px-3 py-2 border-2 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400 rounded-xl text-xs font-medium hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors flex items-center justify-center gap-1.5">
                      <ShoppingBag className="w-3.5 h-3.5" /> Pedir
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <StockAdjustModal
        isOpen={!!stockAdjustItem}
        onClose={() => setStockAdjustItem(null)}
        item={stockAdjustItem}
        onAdjust={handleStockAdjust}
      />

      <QuickAddArticleModal
        isOpen={showQuickAdd}
        onClose={() => setShowQuickAdd(false)}
        onSave={handleQuickAdd}
        categories={categories}
        units={vc.units.length > 0 ? vc.units : [{ value: 'ud', label: 'Unidad' }, { value: 'kg', label: 'Kilogramo' }, { value: 'l', label: 'Litro' }]}
        articleLabel={articleLabels.singular}
        businessType={businessType}
        suppliers={suppliers}
      />

      <ArticleDetailDrawer
        item={detailItem}
        onClose={() => setDetailItem(null)}
        onStockAdjust={setStockAdjustItem}
        onUpdate={handleUpdateItem}
        suppliers={suppliers}
        invoices={invoices}
        allItems={catalogItems}
        navigate={navigate}
        articleLabel={articleLabels.singular}
      />

      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="articles"
        moduleLabel={articleLabels.plural}
        fields={ARTICLE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
        placeholder={`Ej: Tornillo M6x20, precio 0.50€, coste 0.15€, stock 500, mínimo 100, categoría Tornillería...`}
      />

      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel={articleLabels.plural}
        fields={ARTICLE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
