import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import JSZip from 'jszip';
import { Layout } from '../../components/saas/Layout';
import { useModalClose } from '../../hooks/useModalClose';
import { Tabs } from '../../components/saas/Tabs';
import { useAuth } from '../../context/AuthContext';
import {
  listCatalogItemsRequest,
  createCatalogItemRequest,
  updateCatalogItemRequest,
  deleteCatalogItemRequest,
  bulkCreateCatalogItemsRequest,
  listSuppliersRequest,
  createSupplierRequest,
  updateSupplierRequest,
  deleteSupplierRequest,
  listPurchaseInvoicesRequest,
  createPurchaseInvoiceRequest,
  updatePurchaseInvoiceRequest,
  deletePurchaseInvoiceRequest,
  type CatalogItem,
  type Supplier,
  type PurchaseInvoice,
  type PurchaseInvoiceLine,
} from '../../lib/deliveryApi';
import {
  Plus,
  Search,
  X,
  Trash2,
  Edit3,
  Package,
  Layers,
  Truck,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Clock,
  DollarSign,
  BarChart3,
  ArrowUpDown,
  Minus,
  Users,
  Archive,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';
import { CatalogDeleteGuardModal } from '../../components/saas/CatalogDeleteGuardModal';

// ─── Unit options ─────────────────────────────────────────────────────────────

const UNIT_OPTIONS = [
  { value: 'ud', label: 'Unidad' },
  { value: 'kg', label: 'Kilogramo' },
  { value: 'g', label: 'Gramo' },
  { value: 'l', label: 'Litro' },
  { value: 'ml', label: 'Mililitro' },
  { value: 'caja', label: 'Caja' },
  { value: 'pack', label: 'Pack' },
  { value: 'bolsa', label: 'Bolsa' },
  { value: 'm', label: 'Metro' },
];

const INVOICE_STATUS_CONFIG: Record<string, { label: string; badgeClass: string }> = {
  pending: { label: 'Pendiente', badgeClass: 'bg-amber-100 text-amber-700 border-amber-200' },
  paid: { label: 'Pagada', badgeClass: 'bg-green-100 text-green-700 border-green-200' },
  overdue: { label: 'Vencida', badgeClass: 'bg-red-100 text-red-700 border-red-200' },
};

// ─── Create Catalog Item Wizard (7 steps) ────────────────────────────────────

const ALLERGEN_OPTIONS = [
  'Gluten', 'Crustáceos', 'Huevos', 'Pescado', 'Cacahuetes', 'Soja',
  'Lácteos', 'Frutos de cáscara', 'Apio', 'Mostaza', 'Sésamo', 'Sulfitos', 'Moluscos', 'Altramuces',
];

const STEP_LABELS = [
  'Información básica',
  'Categoría y unidad',
  'Precios',
  'Stock',
  'Imagen',
  'Alérgenos y notas',
  'Visibilidad web',
];

function normalizeMediaKey(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

const SAMPLE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9pO7s/0AAAAASUVORK5CYII=';

interface CreateCatalogItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: Partial<CatalogItem>) => Promise<void>;
  editItem?: CatalogItem | null;
}

function CreateCatalogItemModal({ isOpen, onClose, onCreate, editItem }: CreateCatalogItemModalProps) {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    itemType: 'product' as CatalogItem['itemType'],
    name: '',
    description: '',
    category: '',
    brandIdsCsv: '',
    unit: 'ud',
    unitPrice: '',
    costPrice: '',
    stockQuantity: '',
    minStock: '',
    image: '',
    allergens: [] as string[],
    notes: '',
    webVisible: true,
    available: true,
  });

  useEffect(() => {
    if (editItem) {
      setForm({
        itemType: editItem.itemType || 'product',
        name: editItem.name,
        description: editItem.description,
        category: editItem.category,
        brandIdsCsv: Array.isArray(editItem.brandIds) ? editItem.brandIds.join(', ') : '',
        unit: editItem.unit || 'ud',
        unitPrice: String(editItem.unitPrice || ''),
        costPrice: String(editItem.costPrice || ''),
        stockQuantity: String(editItem.stockQuantity || ''),
        minStock: String(editItem.minStock || ''),
        image: editItem.image || '',
        allergens: editItem.allergens || [],
        notes: editItem.notes || '',
        webVisible: editItem.webVisible ?? true,
        available: editItem.available ?? true,
      });
    } else {
      setForm({
        itemType: 'product', name: '', description: '', category: '', unit: 'ud',
        brandIdsCsv: '',
        unitPrice: '', costPrice: '', stockQuantity: '', minStock: '',
        image: '', allergens: [], notes: '', webVisible: true, available: true,
      });
    }
    setStep(1);
  }, [editItem, isOpen]);
  useModalClose(isOpen, onClose);

  if (!isOpen) return null;

  const totalSteps = 7;
  const isEditMode = Boolean(editItem);

  const handleFinalSubmit = async () => {
    if (!form.name.trim()) {
      toast.error('El nombre es obligatorio');
      if (!isEditMode) setStep(1);
      return;
    }
    setSubmitting(true);
    try {
      const parsedBrandIds = String(form.brandIdsCsv || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      await onCreate({
        ...editItem,
        name: form.name,
        description: form.description,
        category: form.category,
        brandIds: parsedBrandIds,
        itemType: form.itemType,
        unitPrice: Number(form.unitPrice) || 0,
        costPrice: Number(form.costPrice) || 0,
        stockQuantity: form.itemType === 'service' ? 0 : Number(form.stockQuantity) || 0,
        minStock: form.itemType === 'service' ? 0 : Number(form.minStock) || 0,
        unit: form.unit,
        image: form.image,
        allergens: form.allergens,
        notes: form.notes,
        active: editItem?.active ?? true,
        webVisible: form.webVisible,
        available: form.available,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const canNext = () => {
    if (step === 1) return form.name.trim().length > 0;
    return true;
  };

  const toggleAllergen = (a: string) => {
    setForm(f => ({
      ...f,
      allergens: f.allergens.includes(a) ? f.allergens.filter(x => x !== a) : [...f.allergens, a],
    }));
  };

  const inputClass = 'w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100';
  const labelClass = 'block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5';

  const margin = Number(form.unitPrice) - Number(form.costPrice);
  const marginPct = Number(form.costPrice) > 0 ? ((margin / Number(form.costPrice)) * 100).toFixed(0) : '—';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-800 z-10 p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                {editItem ? 'Editar artículo' : 'Nuevo artículo'}
              </h2>
              {!isEditMode && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  Paso {step} de {totalSteps} — {STEP_LABELS[step - 1]}
                </p>
              )}
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors">
              <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </button>
          </div>
          {!isEditMode && (
            <>
              {/* Progress bar */}
              <div className="flex gap-1.5">
                {Array.from({ length: totalSteps }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-1.5 flex-1 rounded-full transition-colors cursor-pointer ${
                      i + 1 <= step ? 'bg-gray-900 dark:bg-gray-100' : 'bg-gray-200 dark:bg-gray-700'
                    }`}
                    onClick={() => { if (i + 1 <= step) setStep(i + 1); }}
                  />
                ))}
              </div>
            </>
          )}
          {editItem && (
            <div className="mt-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Producto que estas editando
              </p>
              <div className="mt-1.5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">
                    {form.name || editItem.name || 'Sin nombre'}
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                    {form.description || editItem.description || 'Sin descripcion'}
                  </p>
                </div>
                <span className="shrink-0 inline-flex items-center rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-2 py-1 text-xs font-semibold text-gray-700 dark:text-gray-300">
                  {form.category || editItem.category || 'Sin categoria'}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5">
                  <span className="text-gray-500 dark:text-gray-400">Precio</span>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">{Number(form.unitPrice || 0).toFixed(2)}€</p>
                </div>
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5">
                  <span className="text-gray-500 dark:text-gray-400">Stock</span>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">{Number(form.stockQuantity || 0)}</p>
                </div>
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5">
                  <span className="text-gray-500 dark:text-gray-400">Estado</span>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">{form.available ? 'Disponible' : 'No disponible'}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Step content */}
        <div className="p-6 min-h-[280px]">
          {/* Step 1: Información básica */}
          {(step === 1 || isEditMode) && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-xl mb-2">
                <Package className="w-6 h-6 text-blue-600 shrink-0" />
                <p className="text-sm text-blue-800 dark:text-blue-300">Introduce el nombre y descripción del producto que aparecerá en el catálogo y en la web.</p>
              </div>
              <div>
                <label className={labelClass}>Tipo de elemento</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: 'product', label: 'Producto', desc: 'Se vende y puede tener stock' },
                    { value: 'service', label: 'Servicio', desc: 'No descuenta inventario' },
                    { value: 'combo', label: 'Combo', desc: 'Paquete o menú compuesto' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, itemType: option.value as CatalogItem['itemType'] }))}
                      className={`rounded-xl border-2 p-3 text-left transition-colors ${
                        form.itemType === option.value
                          ? 'border-gray-900 dark:border-gray-100 bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-400'
                      }`}
                    >
                      <div className="text-sm font-bold">{option.label}</div>
                      <div className={`mt-1 text-xs ${form.itemType === option.value ? 'text-white/75 dark:text-gray-600' : 'text-gray-500 dark:text-gray-400'}`}>{option.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className={labelClass}>Nombre del producto *</label>
                <input className={inputClass} placeholder="Ej: Hamburguesa clásica, Coca-Cola 33cl..." value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus />
              </div>
              <div>
                <label className={labelClass}>Descripción</label>
                <textarea rows={3} className={`${inputClass} resize-none`} placeholder="Descripción detallada del producto..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div>
                <label className={labelClass}>Marca (para reporting interno)</label>
                <input
                  className={inputClass}
                  placeholder="Ej: pizza, burger, comunes (separadas por coma)"
                  value={form.brandIdsCsv}
                  onChange={(e) => setForm((f) => ({ ...f, brandIdsCsv: e.target.value }))}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Esto se copiará a cada línea del pedido al vender (histórico). Recomendado: usar <b>comunes</b> para bebidas/extras compartidos.
                </p>
              </div>
            </div>
          )}

          {/* Step 2: Categoría y unidad */}
          {(step === 2 || isEditMode) && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 p-4 bg-purple-50 dark:bg-purple-900/20 border-2 border-purple-200 dark:border-purple-800 rounded-xl mb-2">
                <Layers className="w-6 h-6 text-purple-600 shrink-0" />
                <p className="text-sm text-purple-800 dark:text-purple-300">Clasifica el producto para organizar tu catálogo y facilitar la búsqueda.</p>
              </div>
              <div>
                <label className={labelClass}>Categoría</label>
                <input className={inputClass} placeholder="Ej: Bebidas, Entrantes, Postres..." value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} autoFocus />
              </div>
              <div>
                <label className={labelClass}>Unidad de medida</label>
                <select className={inputClass} value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
                  {UNIT_OPTIONS.map(u => (<option key={u.value} value={u.value}>{u.label}</option>))}
                </select>
              </div>
            </div>
          )}

          {/* Step 3: Precios */}
          {(step === 3 || isEditMode) && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800 rounded-xl mb-2">
                <DollarSign className="w-6 h-6 text-green-600 shrink-0" />
                <p className="text-sm text-green-800 dark:text-green-300">Define el precio de venta al público y el coste de compra para calcular márgenes.</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Precio venta (€)</label>
                  <input type="number" step="0.01" className={inputClass} placeholder="0.00" value={form.unitPrice} onChange={e => setForm(f => ({ ...f, unitPrice: e.target.value }))} autoFocus />
                </div>
                <div>
                  <label className={labelClass}>Precio coste (€)</label>
                  <input type="number" step="0.01" className={inputClass} placeholder="0.00" value={form.costPrice} onChange={e => setForm(f => ({ ...f, costPrice: e.target.value }))} />
                </div>
              </div>
              {(Number(form.unitPrice) > 0 || Number(form.costPrice) > 0) && (
                <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-xl">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">Margen</span>
                    <span className={`font-bold ${margin >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {margin.toFixed(2)}€ ({marginPct}%)
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 4: Stock */}
          {(step === 4 || isEditMode) && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-800 rounded-xl mb-2">
                <Archive className="w-6 h-6 text-amber-600 shrink-0" />
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  {form.itemType === 'service'
                    ? 'Los servicios no gestionan stock. Puedes continuar sin cantidades.'
                    : 'Configura las cantidades de inventario y la alerta de stock mínimo.'}
                </p>
              </div>
              {form.itemType !== 'service' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Stock actual</label>
                    <input type="number" className={inputClass} placeholder="0" value={form.stockQuantity} onChange={e => setForm(f => ({ ...f, stockQuantity: e.target.value }))} autoFocus />
                  </div>
                  <div>
                    <label className={labelClass}>Stock mínimo (alerta)</label>
                    <input type="number" className={inputClass} placeholder="0" value={form.minStock} onChange={e => setForm(f => ({ ...f, minStock: e.target.value }))} />
                  </div>
                </div>
              )}
              {form.itemType !== 'service' && Number(form.stockQuantity) > 0 && Number(form.minStock) > 0 && (
                <div className={`p-4 rounded-xl border-2 ${Number(form.stockQuantity) <= Number(form.minStock) ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                  <div className="flex items-center gap-2">
                    {Number(form.stockQuantity) <= Number(form.minStock) ? (
                      <><AlertTriangle className="w-5 h-5 text-red-600" /><span className="text-sm font-semibold text-red-700">Stock por debajo del mínimo</span></>
                    ) : (
                      <><CheckCircle2 className="w-5 h-5 text-green-600" /><span className="text-sm font-semibold text-green-700">Stock correcto</span></>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 5: Imagen */}
          {(step === 5 || isEditMode) && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 p-4 bg-indigo-50 dark:bg-indigo-900/20 border-2 border-indigo-200 dark:border-indigo-800 rounded-xl mb-2">
                <Package className="w-6 h-6 text-indigo-600 shrink-0" />
                <p className="text-sm text-indigo-800 dark:text-indigo-300">Añade una imagen del producto que se mostrará en la web pública.</p>
              </div>
              <div>
                <label className={labelClass}>URL de imagen</label>
                <input className={inputClass} placeholder="https://ejemplo.com/imagen.jpg" value={form.image} onChange={e => setForm(f => ({ ...f, image: e.target.value }))} autoFocus />
              </div>
              {form.image && (
                <div className="flex justify-center">
                  <div className="w-48 h-48 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden bg-gray-100 dark:bg-gray-900">
                    <img src={form.image} alt="Preview" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  </div>
                </div>
              )}
              {!form.image && (
                <div className="flex justify-center">
                  <div className="w-48 h-48 rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
                    <div className="text-center text-gray-400">
                      <Package className="w-10 h-10 mx-auto mb-2" />
                      <p className="text-xs">Sin imagen</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 6: Alérgenos y notas */}
          {(step === 6 || isEditMode) && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 p-4 bg-orange-50 dark:bg-orange-900/20 border-2 border-orange-200 dark:border-orange-800 rounded-xl mb-2">
                <AlertTriangle className="w-6 h-6 text-orange-600 shrink-0" />
                <p className="text-sm text-orange-800 dark:text-orange-300">Marca los alérgenos presentes y añade notas internas sobre el producto.</p>
              </div>
              <div>
                <label className={labelClass}>Alérgenos</label>
                <div className="flex flex-wrap gap-2">
                  {ALLERGEN_OPTIONS.map(a => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => toggleAllergen(a)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border-2 transition-colors ${
                        form.allergens.includes(a)
                          ? 'bg-orange-100 border-orange-400 text-orange-800'
                          : 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-400'
                      }`}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className={labelClass}>Notas internas</label>
                <textarea rows={3} className={`${inputClass} resize-none`} placeholder="Notas adicionales (solo visibles para el equipo)..." value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
          )}

          {/* Step 7: Visibilidad web */}
          {(step === 7 || isEditMode) && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 p-4 bg-cyan-50 dark:bg-cyan-900/20 border-2 border-cyan-200 dark:border-cyan-800 rounded-xl mb-2">
                <Package className="w-6 h-6 text-cyan-600 shrink-0" />
                <p className="text-sm text-cyan-800 dark:text-cyan-300">Controla si este producto aparece en la web pública y si está disponible para pedidos.</p>
              </div>

              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, webVisible: !f.webVisible }))}
                className={`w-full p-5 rounded-2xl border-2 text-left transition-all ${
                  form.webVisible
                    ? 'border-green-400 bg-green-50 dark:bg-green-900/20'
                    : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold text-gray-900 dark:text-gray-100">Visible en la web</div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {form.webVisible ? 'Este producto aparece en la tienda online' : 'Este producto está oculto de la tienda online'}
                    </p>
                  </div>
                  <div className={`w-12 h-7 rounded-full transition-colors relative ${form.webVisible ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
                    <div className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${form.webVisible ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, available: !f.available }))}
                className={`w-full p-5 rounded-2xl border-2 text-left transition-all ${
                  form.available
                    ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-red-300 bg-red-50 dark:bg-red-900/20'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold text-gray-900 dark:text-gray-100">
                      {form.available ? 'Disponible' : 'No disponible'}
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {form.available
                        ? 'Los clientes pueden pedir este producto'
                        : 'Aparecerá como "agotado" en la web'}
                    </p>
                  </div>
                  <div className={`w-12 h-7 rounded-full transition-colors relative ${form.available ? 'bg-blue-500' : 'bg-red-400'}`}>
                    <div className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${form.available ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </div>
                </div>
              </button>

              {/* Summary preview */}
              <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700">
                <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Resumen del producto</h4>
                <div className="flex gap-4">
                  {form.image ? (
                    <img src={form.image} alt="" className="w-16 h-16 rounded-xl object-cover shrink-0" />
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-gray-200 dark:bg-gray-700 flex items-center justify-center shrink-0"><Package className="w-6 h-6 text-gray-400" /></div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-gray-900 dark:text-gray-100 truncate">{form.name || 'Sin nombre'}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{form.category || 'Sin categoría'} · {form.unit}</div>
                    <div className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-1">{Number(form.unitPrice).toFixed(2)}€</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 dark:bg-gray-900 p-6 border-t border-gray-200 dark:border-gray-700 flex gap-3">
          {isEditMode ? (
            <>
              <button type="button" onClick={onClose} className="px-5 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-white dark:hover:bg-gray-800 transition-colors">
                Cancelar
              </button>
              <div className="flex-1" />
              <button
                type="button"
                onClick={handleFinalSubmit}
                disabled={submitting}
                className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold transition-colors disabled:opacity-60 disabled:cursor-wait"
              >
                {submitting ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </>
          ) : (
            <>
              {step > 1 ? (
                <button type="button" onClick={() => setStep(s => s - 1)} className="px-5 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-white dark:hover:bg-gray-800 transition-colors">
                  Atrás
                </button>
              ) : (
                <button type="button" onClick={onClose} className="px-5 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-white dark:hover:bg-gray-800 transition-colors">
                  Cancelar
                </button>
              )}
              <div className="flex-1" />
              {step < totalSteps ? (
                <button
                  type="button"
                  onClick={() => setStep(s => s + 1)}
                  disabled={!canNext()}
                  className="px-6 py-3 bg-gray-900 hover:bg-black text-white rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Siguiente
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleFinalSubmit}
                  disabled={submitting}
                  className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold transition-colors disabled:opacity-60 disabled:cursor-wait"
                >
                  {submitting ? 'Guardando…' : 'Crear artículo'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Create Supplier Modal ────────────────────────────────────────────────────

interface CreateSupplierModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: Partial<Supplier>) => Promise<void>;
  editItem?: Supplier | null;
}

function CreateSupplierModal({ isOpen, onClose, onCreate, editItem }: CreateSupplierModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: '',
    cif: '',
    email: '',
    phone: '',
    address: '',
    contactPerson: '',
    category: '',
    paymentTerms: '',
    notes: '',
  });

  useEffect(() => {
    if (editItem) {
      setForm({
        name: editItem.name,
        cif: editItem.cif || '',
        email: editItem.email || '',
        phone: editItem.phone || '',
        address: editItem.address || '',
        contactPerson: editItem.contactPerson || '',
        category: editItem.category || '',
        paymentTerms: editItem.paymentTerms || '',
        notes: editItem.notes || '',
      });
    } else {
      setForm({ name: '', cif: '', email: '', phone: '', address: '', contactPerson: '', category: '', paymentTerms: '', notes: '' });
    }
  }, [editItem, isOpen]);
  useModalClose(isOpen, onClose);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }
    setSubmitting(true);
    try {
      await onCreate({
        ...editItem,
        name: form.name,
        cif: form.cif,
        email: form.email,
        phone: form.phone,
        address: form.address,
        contactPerson: form.contactPerson,
        category: form.category,
        paymentTerms: form.paymentTerms,
        notes: form.notes,
        active: editItem?.active ?? true,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              {editItem ? 'Editar proveedor' : 'Nuevo proveedor'}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {editItem ? 'Modifica los datos del proveedor' : 'Registra un nuevo proveedor'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors">
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Nombre *</label>
              <input
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                placeholder="Nombre del proveedor"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">CIF/NIF</label>
              <input
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-mono uppercase"
                placeholder="B12345678"
                value={form.cif}
                onChange={e => setForm(f => ({ ...f, cif: e.target.value.toUpperCase() }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Email</label>
              <input
                type="email"
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                placeholder="proveedor@email.com"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Teléfono</label>
              <input
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                placeholder="600 000 000"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Dirección</label>
            <input
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              placeholder="Dirección del proveedor"
              value={form.address}
              onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Persona de contacto</label>
              <input
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                placeholder="Nombre del contacto"
                value={form.contactPerson}
                onChange={e => setForm(f => ({ ...f, contactPerson: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Categoría</label>
              <input
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                placeholder="Ej: Alimentación, Limpieza..."
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Condiciones de pago</label>
            <input
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              placeholder="Ej: 30 días, contado..."
              value={form.paymentTerms}
              onChange={e => setForm(f => ({ ...f, paymentTerms: e.target.value }))}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Notas</label>
            <textarea
              rows={2}
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-none"
              placeholder="Notas adicionales..."
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            />
          </div>

          <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 -mx-6 px-6 -mb-6 pb-6 pt-4 flex gap-3 rounded-b-2xl">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-3 bg-gray-900 hover:bg-black text-white rounded-xl font-semibold transition-colors disabled:opacity-60 disabled:cursor-wait"
            >
              {submitting ? 'Guardando…' : editItem ? 'Guardar cambios' : 'Crear proveedor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Create Purchase Invoice Modal ────────────────────────────────────────────

interface CreateInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: Partial<PurchaseInvoice>) => Promise<void>;
  suppliers: Supplier[];
  editItem?: PurchaseInvoice | null;
}

function CreateInvoiceModal({ isOpen, onClose, onCreate, suppliers, editItem }: CreateInvoiceModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    supplierName: '',
    supplierId: '',
    date: '',
    dueDate: '',
    taxRate: '21',
    notes: '',
  });
  const [lines, setLines] = useState<{ itemName: string; quantity: string; unitPrice: string }[]>([
    { itemName: '', quantity: '', unitPrice: '' },
  ]);

  useEffect(() => {
    if (editItem) {
      setForm({
        supplierName: editItem.supplierName || '',
        supplierId: editItem.supplierId || '',
        date: editItem.date ? editItem.date.slice(0, 10) : '',
        dueDate: editItem.dueDate ? editItem.dueDate.slice(0, 10) : '',
        taxRate: String(editItem.taxRate ?? 21),
        notes: editItem.notes || '',
      });
      setLines(
        editItem.lines.length > 0
          ? editItem.lines.map(l => ({ itemName: l.itemName, quantity: String(l.quantity), unitPrice: String(l.unitPrice) }))
          : [{ itemName: '', quantity: '', unitPrice: '' }],
      );
    } else {
      setForm({ supplierName: '', supplierId: '', date: '', dueDate: '', taxRate: '21', notes: '' });
      setLines([{ itemName: '', quantity: '', unitPrice: '' }]);
    }
  }, [editItem, isOpen]);
  useModalClose(isOpen, onClose);

  if (!isOpen) return null;

  const addLine = () => setLines(prev => [...prev, { itemName: '', quantity: '', unitPrice: '' }]);

  const removeLine = (idx: number) => {
    if (lines.length <= 1) return;
    setLines(prev => prev.filter((_, i) => i !== idx));
  };

  const updateLine = (idx: number, field: string, value: string) => {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));
  };

  const computedLines: PurchaseInvoiceLine[] = lines
    .filter(l => l.itemName.trim())
    .map((l, i) => ({
      id: editItem?.lines[i]?.id || `line-${Date.now()}-${i}`,
      itemName: l.itemName,
      quantity: Number(l.quantity) || 0,
      unitPrice: Number(l.unitPrice) || 0,
      total: (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0),
    }));

  const subtotal = computedLines.reduce((s, l) => s + l.total, 0);
  const taxRate = Number(form.taxRate) || 0;
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

  const handleSelectSupplier = (supplierId: string) => {
    const supplier = suppliers.find(s => s._id === supplierId);
    setForm(f => ({
      ...f,
      supplierId,
      supplierName: supplier?.name || '',
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.supplierName.trim()) {
      toast.error('Selecciona un proveedor');
      return;
    }
    if (computedLines.length === 0) {
      toast.error('Añade al menos una línea');
      return;
    }
    setSubmitting(true);
    try {
      await onCreate({
        ...editItem,
        supplierName: form.supplierName,
        supplierId: form.supplierId,
        date: form.date || new Date().toISOString().slice(0, 10),
        dueDate: form.dueDate,
        lines: computedLines,
        subtotal,
        taxRate,
        taxAmount,
        total,
        notes: form.notes,
        status: editItem?.status || 'pending',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              {editItem ? 'Editar factura' : 'Nueva factura de compra'}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {editItem ? 'Modifica los datos de la factura' : 'Registra una nueva factura de proveedor'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors">
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Proveedor *</label>
              {suppliers.length > 0 ? (
                <select
                  className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  value={form.supplierId}
                  onChange={e => handleSelectSupplier(e.target.value)}
                >
                  <option value="">Seleccionar proveedor</option>
                  {suppliers.filter(s => s.active).map(s => (
                    <option key={s._id} value={s._id}>{s.name}</option>
                  ))}
                </select>
              ) : (
                <input
                  className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  placeholder="Nombre del proveedor"
                  value={form.supplierName}
                  onChange={e => setForm(f => ({ ...f, supplierName: e.target.value }))}
                />
              )}
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">% IVA</label>
              <input
                type="number"
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                placeholder="21"
                value={form.taxRate}
                onChange={e => setForm(f => ({ ...f, taxRate: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Fecha factura</label>
              <input
                type="date"
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Fecha vencimiento</label>
              <input
                type="date"
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                value={form.dueDate}
                onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
              />
            </div>
          </div>

          {/* Invoice lines */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Líneas de factura</label>
              <AddButtonDropdown
                label="Nuevo producto"
                onQuickAdd={addLine}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de producto"
              />
            </div>
            <div className="space-y-2">
              {lines.map((line, idx) => (
                <div key={idx} className="flex gap-2 items-start">
                  <input
                    className="flex-1 px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                    placeholder="Artículo"
                    value={line.itemName}
                    onChange={e => updateLine(idx, 'itemName', e.target.value)}
                  />
                  <input
                    type="number"
                    className="w-24 px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                    placeholder="Cant."
                    value={line.quantity}
                    onChange={e => updateLine(idx, 'quantity', e.target.value)}
                  />
                  <input
                    type="number"
                    step="0.01"
                    className="w-28 px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                    placeholder="Precio €"
                    value={line.unitPrice}
                    onChange={e => updateLine(idx, 'unitPrice', e.target.value)}
                  />
                  <div className="w-24 px-3 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 text-right">
                    {((Number(line.quantity) || 0) * (Number(line.unitPrice) || 0)).toFixed(2)}€
                  </div>
                  <button
                    type="button"
                    onClick={() => removeLine(idx)}
                    className="p-2 hover:bg-red-100 rounded-lg transition-colors shrink-0"
                    disabled={lines.length <= 1}
                  >
                    <Minus className="w-4 h-4 text-red-500" />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-xl text-sm space-y-1">
              <div className="flex justify-between text-gray-600 dark:text-gray-400">
                <span>Subtotal</span>
                <span>{subtotal.toFixed(2)}€</span>
              </div>
              <div className="flex justify-between text-gray-600 dark:text-gray-400">
                <span>IVA ({taxRate}%)</span>
                <span>{taxAmount.toFixed(2)}€</span>
              </div>
              <div className="flex justify-between font-bold text-gray-900 dark:text-gray-100 pt-1 border-t border-gray-200 dark:border-gray-700">
                <span>Total</span>
                <span>{total.toFixed(2)}€</span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Notas</label>
            <textarea
              rows={2}
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-none"
              placeholder="Notas adicionales..."
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            />
          </div>

          <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 -mx-6 px-6 -mb-6 pb-6 pt-4 flex gap-3 rounded-b-2xl">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-3 bg-gray-900 hover:bg-black text-white rounded-xl font-semibold transition-colors disabled:opacity-60 disabled:cursor-wait"
            >
              {submitting ? 'Guardando…' : editItem ? 'Guardar cambios' : 'Crear factura'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Stock Adjustment Modal ───────────────────────────────────────────────────

interface StockAdjustModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: CatalogItem | null;
  onAdjust: (item: CatalogItem, newQuantity: number) => void;
}

function StockAdjustModal({ isOpen, onClose, item, onAdjust }: StockAdjustModalProps) {
  const [adjustment, setAdjustment] = useState('');

  useEffect(() => { setAdjustment(''); }, [isOpen]);
  useModalClose(isOpen, onClose);

  if (!isOpen || !item) return null;

  const newQty = item.stockQuantity + (Number(adjustment) || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
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
            <input
              type="number"
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-center text-xl font-bold"
              placeholder="0"
              value={adjustment}
              onChange={e => setAdjustment(e.target.value)}
              autoFocus
            />
          </div>
          <div className={`flex items-center justify-between p-4 rounded-xl ${newQty < item.minStock ? 'bg-red-50 border-2 border-red-200' : 'bg-green-50 border-2 border-green-200'}`}>
            <span className={`text-sm ${newQty < item.minStock ? 'text-red-600' : 'text-green-600'}`}>Nuevo stock</span>
            <span className={`text-2xl font-bold ${newQty < item.minStock ? 'text-red-700' : 'text-green-700'}`}>{newQty} {item.unit}</span>
          </div>
          <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 -mx-6 px-6 -mb-6 pb-6 pt-4 flex gap-3 rounded-b-2xl">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => onAdjust(item, newQty)}
              disabled={!adjustment || Number(adjustment) === 0}
              className="flex-1 px-4 py-3 bg-gray-900 hover:bg-black text-white rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Aplicar ajuste
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function CatalogPage() {
  const { user } = useAuth();
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('catalog');

  // Catalog state
  const [showCreateItem, setShowCreateItem] = useState(false);
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null);
  const [searchCatalog, setSearchCatalog] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterType, setFilterType] = useState<CatalogItem['itemType'] | 'all'>('all');
  const [deletingItemIds, setDeletingItemIds] = useState<Set<string>>(new Set());
  const [bulkDeletingCatalog, setBulkDeletingCatalog] = useState(false);
  type CatalogDeleteOp =
    | null
    | { mode: 'single'; item: CatalogItem }
    | { mode: 'bulk'; items: CatalogItem[] };
  const [catalogDeleteGuard, setCatalogDeleteGuard] = useState<CatalogDeleteOp>(null);
  const catalogDeleteOpRef = useRef<CatalogDeleteOp>(null);
  useEffect(() => {
    catalogDeleteOpRef.current = catalogDeleteGuard;
  }, [catalogDeleteGuard]);

  // Stock state
  const [stockAdjustItem, setStockAdjustItem] = useState<CatalogItem | null>(null);

  // Supplier state
  const [showCreateSupplier, setShowCreateSupplier] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  // Invoice state
  const [showCreateInvoice, setShowCreateInvoice] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<PurchaseInvoice | null>(null);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [imageZipMap, setImageZipMap] = useState<Record<string, string>>({});
  const [loadingImageZip, setLoadingImageZip] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'itemType', label: 'Tipo (product/service/combo)' },
    { key: 'category', label: 'Categoría' },
    { key: 'price', label: 'Precio' },
    { key: 'description', label: 'Descripción' },
    { key: 'allergens', label: 'Alérgenos' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: '' },
    { key: 'sku', label: 'SKU', example: 'SKU-001' },
    { key: 'itemType', label: 'Tipo', example: 'product' },
    { key: 'category', label: 'Categoría', example: '' },
    { key: 'price', label: 'Precio', example: '' },
    { key: 'description', label: 'Descripción', example: '' },
    { key: 'allergens', label: 'Alérgenos', example: '' },
    { key: 'image', label: 'Imagen (URL opcional)', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    if (!user?.id) return;
    const items = entries
      .map((entry) => ({
        name: String(entry.name || '').trim(),
        category: String(entry.category || '').trim(),
        itemType: ['product', 'service', 'combo'].includes(String(entry.itemType || '').trim())
          ? String(entry.itemType).trim() as CatalogItem['itemType']
          : 'product',
        unitPrice: Number(String(entry.price ?? entry.unitPrice ?? '').replace(',', '.')) || 0,
        description: String(entry.description || '').trim(),
        allergens: String(entry.allergens || '')
          .split(',')
          .map((a) => a.trim())
          .filter(Boolean),
        active: true,
        available: true,
        webVisible: true,
        module: 'catalog' as const,
      }))
      .filter((item) => item.name);
    if (items.length === 0) {
      toast.error('No hay productos válidos para importar');
      return;
    }
    const result = await bulkCreateCatalogItemsRequest(user.id, items as Partial<CatalogItem>[]);
    if (result.created > 0) {
      await loadCatalog();
      toast.success(`${result.created} producto(s) importado(s) con IA`);
    }
    if (result.errors > 0) {
      const firstError = result.errorDetails?.[0];
      toast.error(
        firstError
          ? `${result.errors} producto(s) no se pudieron importar. Ej: ${firstError.name || 'sin nombre'} -> ${firstError.error}`
          : `${result.errors} producto(s) no se pudieron importar`,
      );
    }
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    if (!user?.id) return 0;
    const zipProvided = Object.keys(imageZipMap).length > 0;
    const unmatchedImageRefs: string[] = [];
    const items: Partial<CatalogItem>[] = entries
      .map((entry, index) => {
        const name = String(entry.name || '').trim();
        if (!name) return null;
        const sku = String(entry.sku || '').trim();
        const imageFromZip =
          imageZipMap[normalizeMediaKey(sku)] ||
          imageZipMap[normalizeMediaKey(name)] ||
          '';
        const image = String(entry.image || '').trim() || imageFromZip;
        if (zipProvided && !image) unmatchedImageRefs.push(sku || name || `fila ${index + 2}`);
        return {
          name,
          category: String(entry.category || '').trim(),
          itemType: ['product', 'service', 'combo'].includes(String(entry.itemType || '').trim())
            ? String(entry.itemType).trim() as CatalogItem['itemType']
            : 'product',
          description: String(entry.description || '').trim(),
          unitPrice: Number(String(entry.price || entry.unitPrice || '').replace(',', '.')) || 0,
          costPrice: Number(String(entry.costPrice || '').replace(',', '.')) || 0,
          stockQuantity: Number(String(entry.stockQuantity || '').replace(',', '.')) || 0,
          minStock: Number(String(entry.minStock || '').replace(',', '.')) || 0,
          allergens: String(entry.allergens || '')
            .split(',')
            .map((a) => a.trim())
            .filter(Boolean),
          image,
          sku: sku || undefined,
          unit: String(entry.unit || 'ud'),
          active: true,
          available: true,
          webVisible: true,
          module: 'catalog',
        } as Partial<CatalogItem>;
      })
      .filter((item): item is Partial<CatalogItem> => Boolean(item));

    if (items.length === 0) {
      toast.error('No hay productos válidos para importar');
      return 0;
    }
    if (zipProvided && unmatchedImageRefs.length > 0) {
      const sample = unmatchedImageRefs.slice(0, 6).join(', ');
      toast.warning(`ZIP: ${unmatchedImageRefs.length} producto(s) sin imagen coincidente. Se importarán igual. Ej: ${sample}`);
    }
    let result = await bulkCreateCatalogItemsRequest(user.id, items);
    const suspiciousSingleCreate = items.length > 1 && result.created <= 1 && result.errors >= items.length - 1;
    if (suspiciousSingleCreate) {
      let recovered = 0;
      let recoveredErrors = 0;
      for (const item of items) {
        try {
          await createCatalogItemRequest(user.id, item);
          recovered += 1;
        } catch (error) {
          recoveredErrors += 1;
          const message = error instanceof Error ? error.message : '';
          if (!message.toLowerCase().includes('ya existe')) {
            console.warn('Import recovery failed for item', item?.name, message);
          }
        }
      }
      result = {
        ...result,
        created: recovered,
        errors: recoveredErrors,
      };
      toast.warning('Detectado fallo en bulk; se aplicó importación por ítem para recuperar el lote.');
    }
    if (result.created > 0) {
      await loadCatalog();
      const importedWithImage = items.filter((i) => Boolean(i.image)).length;
      toast.success(
        `${result.created} producto(s) importado(s)` +
          (importedWithImage > 0 ? ` · ${importedWithImage} con imagen` : ''),
      );
    }
    if (result.errors > 0) toast.error(`${result.errors} producto(s) no se pudieron importar`);
    return result.created || 0;
  };

  const handleZipFileSelected = useCallback(async (file: File | null) => {
    if (!file) return;
    setLoadingImageZip(true);
    try {
      const zip = await JSZip.loadAsync(file);
      const map: Record<string, string> = {};
      const entries = Object.values(zip.files).filter((entry) => {
        if (entry.dir) return false;
        const lower = entry.name.toLowerCase();
        return lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') || lower.endsWith('.webp');
      });
      for (const entry of entries) {
        const blob = await entry.async('blob');
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        const filename = entry.name.split('/').pop() || entry.name;
        const basename = filename.replace(/\.[^.]+$/, '');
        const key = normalizeMediaKey(basename);
        if (key) map[key] = dataUrl;
      }
      setImageZipMap(map);
      toast.success(`ZIP cargado: ${Object.keys(map).length} imagen(es) lista(s) para mapear por nombre/SKU`);
    } catch {
      toast.error('No se pudo leer el ZIP de imágenes');
    } finally {
      setLoadingImageZip(false);
    }
  }, []);

  const handleDownloadSampleZip = useCallback(async () => {
    try {
      const zip = new JSZip();
      zip.file('SKU-001.png', SAMPLE_PNG_BASE64, { base64: true });
      zip.file('SKU-002.png', SAMPLE_PNG_BASE64, { base64: true });
      zip.file(
        'LEEME.txt',
        [
          'Ejemplo de ZIP de imagenes para Delivery Catalogo',
          '',
          '1) Nombra cada foto por SKU (recomendado) o por nombre del producto.',
          '2) Formatos soportados: .jpg, .jpeg, .png, .webp',
          '3) Usa los mismos valores que en las columnas sku o name del Excel.',
        ].join('\n'),
      );
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'ejemplo_zip_delivery_catalogo.zip';
      link.click();
      URL.revokeObjectURL(url);
      toast.success('ZIP de ejemplo descargado');
    } catch {
      toast.error('No se pudo generar el ZIP de ejemplo');
    }
  }, []);

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadCatalog = useCallback(async () => {
    if (!user?.id) return;
    try {
      const items = await listCatalogItemsRequest(user.id);
      setCatalogItems(items);
    } catch {
      toast.error('Error al cargar el catálogo');
    }
  }, [user?.id]);

  const loadSuppliers = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await listSuppliersRequest(user.id);
      setSuppliers(data);
    } catch {
      toast.error('Error al cargar proveedores');
    }
  }, [user?.id]);

  const loadInvoices = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await listPurchaseInvoicesRequest(user.id);
      setInvoices(data);
    } catch {
      toast.error('Error al cargar facturas');
    }
  }, [user?.id]);

  useEffect(() => {
    Promise.all([loadCatalog(), loadSuppliers(), loadInvoices()]).finally(() => setLoading(false));
  }, [loadCatalog, loadSuppliers, loadInvoices]);

  // ── CRUD: Catalog Items ─────────────────────────────────────────────────────

  const handleCreateItem = async (data: Partial<CatalogItem>) => {
    if (!user?.id) {
      toast.error('Sesión no válida. Recarga la página e inicia sesión de nuevo.');
      return;
    }
    try {
      if (editingItem) {
        const updated = await updateCatalogItemRequest(user.id, { ...editingItem, ...data } as CatalogItem);
        setCatalogItems(prev => prev.map(i => i._id === updated._id ? updated : i));
        toast.success('Artículo actualizado');
      } else {
        const created = await createCatalogItemRequest(user.id, { ...data, module: 'catalog' } as any);
        setCatalogItems(prev => [created, ...prev]);
        toast.success('Artículo creado');
      }
      setShowCreateItem(false);
      setEditingItem(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar el artículo');
    }
  };

  const handleDeleteItem = (item: CatalogItem) => {
    if (!user?.id) return;
    if (bulkDeletingCatalog || deletingItemIds.has(item._id)) return;
    setCatalogDeleteGuard({ mode: 'single', item });
  };

  const handleDeleteFilteredCatalog = () => {
    if (!user?.id || filteredCatalog.length === 0 || bulkDeletingCatalog) return;
    setCatalogDeleteGuard({ mode: 'bulk', items: [...filteredCatalog] });
  };

  const executeCatalogDeleteAfterGuard = useCallback(async () => {
    const op = catalogDeleteOpRef.current;
    setCatalogDeleteGuard(null);
    if (!user?.id || !op) return;

    if (op.mode === 'single') {
      const item = op.item;
      setDeletingItemIds((prev) => new Set(prev).add(item._id));
      try {
        await deleteCatalogItemRequest(user.id, item._id);
        setCatalogItems((prev) => prev.filter((i) => i._id !== item._id));
        toast.success('Artículo eliminado');
      } catch {
        toast.error('Error al eliminar el artículo');
      } finally {
        setDeletingItemIds((prev) => {
          const next = new Set(prev);
          next.delete(item._id);
          return next;
        });
      }
      return;
    }

    const list = op.items;
    setBulkDeletingCatalog(true);
    let deleted = 0;
    let failed = 0;
    try {
      for (const item of list) {
        try {
          await deleteCatalogItemRequest(user.id, item._id);
          deleted += 1;
        } catch {
          failed += 1;
        }
      }
      await loadCatalog();
      if (deleted > 0) toast.success(`${deleted} artículo(s) eliminado(s)`);
      if (failed > 0) toast.error(`${failed} artículo(s) no se pudieron eliminar`);
    } finally {
      setBulkDeletingCatalog(false);
    }
  }, [user?.id, loadCatalog]);

  const handleToggleField = async (item: CatalogItem, field: 'webVisible' | 'available' | 'active') => {
    if (!user?.id) return;
    try {
      const updated = await updateCatalogItemRequest(user.id, { ...item, [field]: !item[field] });
      setCatalogItems(prev => prev.map(i => i._id === updated._id ? updated : i));
      const labels: Record<string, [string, string]> = {
        webVisible: ['visible en web', 'oculto de la web'],
        available: ['disponible', 'no disponible'],
        active: ['activo', 'inactivo'],
      };
      const [on, off] = labels[field];
      toast.success(`"${item.name}" marcado como ${!item[field] ? on : off}`);
    } catch {
      toast.error('Error al actualizar el artículo');
    }
  };

  const handleStockAdjust = async (item: CatalogItem, newQuantity: number) => {
    if (!user?.id) return;
    try {
      const updated = await updateCatalogItemRequest(user.id, { ...item, stockQuantity: newQuantity });
      setCatalogItems(prev => prev.map(i => i._id === updated._id ? updated : i));
      setStockAdjustItem(null);
      toast.success(`Stock de "${item.name}" actualizado a ${newQuantity}`);
    } catch {
      toast.error('Error al ajustar el stock');
    }
  };

  // ── CRUD: Suppliers ─────────────────────────────────────────────────────────

  const handleCreateSupplier = async (data: Partial<Supplier>) => {
    if (!user?.id) { toast.error('Sesión no válida. Recarga la página e inicia sesión de nuevo.'); return; }
    try {
      if (editingSupplier) {
        const updated = await updateSupplierRequest(user.id, { ...editingSupplier, ...data } as Supplier);
        setSuppliers(prev => prev.map(s => s._id === updated._id ? updated : s));
        toast.success('Proveedor actualizado');
      } else {
        const created = await createSupplierRequest(user.id, data);
        setSuppliers(prev => [created, ...prev]);
        toast.success('Proveedor creado');
      }
      setShowCreateSupplier(false);
      setEditingSupplier(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar el proveedor');
    }
  };

  const handleDeleteSupplier = async (supplier: Supplier) => {
    if (!user?.id) return;
    if (!confirm(`¿Eliminar "${supplier.name}"?`)) return;
    try {
      await deleteSupplierRequest(user.id, supplier._id);
      setSuppliers(prev => prev.filter(s => s._id !== supplier._id));
      toast.success('Proveedor eliminado');
    } catch {
      toast.error('Error al eliminar el proveedor');
    }
  };

  // ── CRUD: Invoices ──────────────────────────────────────────────────────────

  const handleCreateInvoice = async (data: Partial<PurchaseInvoice>) => {
    if (!user?.id) { toast.error('Sesión no válida. Recarga la página e inicia sesión de nuevo.'); return; }
    try {
      if (editingInvoice) {
        const updated = await updatePurchaseInvoiceRequest(user.id, { ...editingInvoice, ...data } as PurchaseInvoice);
        setInvoices(prev => prev.map(i => i._id === updated._id ? updated : i));
        toast.success('Factura actualizada');
      } else {
        const created = await createPurchaseInvoiceRequest(user.id, data);
        setInvoices(prev => [created, ...prev]);
        toast.success('Factura creada');
      }
      setShowCreateInvoice(false);
      setEditingInvoice(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar la factura');
    }
  };

  const handleDeleteInvoice = async (invoice: PurchaseInvoice) => {
    if (!user?.id) return;
    if (!confirm(`¿Eliminar factura ${invoice.invoiceNumber}?`)) return;
    try {
      await deletePurchaseInvoiceRequest(user.id, invoice._id);
      setInvoices(prev => prev.filter(i => i._id !== invoice._id));
      toast.success('Factura eliminada');
    } catch {
      toast.error('Error al eliminar la factura');
    }
  };

  const handleToggleInvoiceStatus = async (invoice: PurchaseInvoice) => {
    if (!user?.id) return;
    const newStatus = invoice.status === 'paid' ? 'pending' : 'paid';
    try {
      const updated = await updatePurchaseInvoiceRequest(user.id, {
        ...invoice,
        status: newStatus,
        paidAt: newStatus === 'paid' ? new Date().toISOString() : '',
      });
      setInvoices(prev => prev.map(i => i._id === updated._id ? updated : i));
      toast.success(`Factura marcada como ${INVOICE_STATUS_CONFIG[newStatus].label.toLowerCase()}`);
    } catch {
      toast.error('Error al actualizar la factura');
    }
  };

  // ── Derived data ────────────────────────────────────────────────────────────

  const categories = useMemo(() => {
    return [...new Set(catalogItems.map(i => i.category).filter(Boolean))].sort();
  }, [catalogItems]);

  const filteredCatalog = useMemo(() => {
    return catalogItems.filter(item => {
      if (filterCategory !== 'all' && item.category !== filterCategory) return false;
      if (filterType !== 'all' && (item.itemType || 'product') !== filterType) return false;
      if (searchCatalog) {
        const q = searchCatalog.toLowerCase();
        return (
          item.name.toLowerCase().includes(q) ||
          item.sku?.toLowerCase().includes(q) ||
          item.category?.toLowerCase().includes(q) ||
          item.description?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [catalogItems, searchCatalog, filterCategory, filterType]);

  const catalogKpis = useMemo(() => ({
    totalItems: catalogItems.length,
    products: catalogItems.filter(i => (i.itemType || 'product') === 'product').length,
    services: catalogItems.filter(i => i.itemType === 'service').length,
    combos: catalogItems.filter(i => i.itemType === 'combo').length,
    lowStock: catalogItems.filter(i => i.active && (i.itemType || 'product') === 'product' && Number(i.minStock || 0) > 0 && Number(i.stockQuantity || 0) <= Number(i.minStock || 0)).length,
    categories: new Set(catalogItems.map(i => i.category).filter(Boolean)).size,
    inventoryValue: catalogItems.reduce((s, i) => {
      if (!i.active || (i.itemType || 'product') !== 'product') return s;
      const quantity = Math.max(0, Number(i.stockQuantity || 0));
      const cost = Number(i.costPrice || 0);
      return s + quantity * cost;
    }, 0),
  }), [catalogItems]);

  const supplierKpis = useMemo(() => ({
    total: suppliers.length,
    active: suppliers.filter(s => s.active).length,
  }), [suppliers]);

  const invoiceKpis = useMemo(() => ({
    total: invoices.length,
    pending: invoices.filter(i => i.status === 'pending').length,
    paid: invoices.filter(i => i.status === 'paid').length,
    totalAmount: invoices.reduce((s, i) => s + (i.total || 0), 0),
  }), [invoices]);

  // ── Tab: Catálogo ───────────────────────────────────────────────────────────

  const renderCatalogTab = () => (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 bg-blue-50 border-2 border-blue-200 rounded-xl">
          <div className="text-blue-600 mb-2"><Package className="w-5 h-5" /></div>
          <div className="text-2xl font-bold text-blue-900">{catalogKpis.totalItems}</div>
          <div className="text-xs text-blue-700 mt-0.5">Total artículos</div>
        </div>
        <div className="p-4 bg-red-50 border-2 border-red-200 rounded-xl">
          <div className="text-red-600 mb-2"><AlertTriangle className="w-5 h-5" /></div>
          <div className="text-2xl font-bold text-red-900">{catalogKpis.lowStock}</div>
          <div className="text-xs text-red-700 mt-0.5">Stock bajo</div>
        </div>
        <div className="p-4 bg-purple-50 border-2 border-purple-200 rounded-xl">
          <div className="text-purple-600 mb-2"><Layers className="w-5 h-5" /></div>
          <div className="text-2xl font-bold text-purple-900">{catalogKpis.categories}</div>
          <div className="text-xs text-purple-700 mt-0.5">Categorías</div>
        </div>
        <div className="p-4 bg-green-50 border-2 border-green-200 rounded-xl">
          <div className="text-green-600 mb-2"><DollarSign className="w-5 h-5" /></div>
          <div className="text-2xl font-bold text-green-900">{catalogKpis.inventoryValue.toLocaleString('es-ES', { maximumFractionDigits: 0 })}€</div>
          <div className="text-xs text-green-700 mt-0.5">Valor inventario</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
            <input
              className="pl-9 pr-4 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-56"
              placeholder="Buscar artículo, SKU..."
              value={searchCatalog}
              onChange={e => setSearchCatalog(e.target.value)}
            />
          </div>
          <select
            className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-gray-900 outline-none"
            value={filterType}
            onChange={e => setFilterType(e.target.value as CatalogItem['itemType'] | 'all')}
          >
            <option value="all">Todos los tipos</option>
            <option value="product">Productos ({catalogKpis.products})</option>
            <option value="service">Servicios ({catalogKpis.services})</option>
            <option value="combo">Combos ({catalogKpis.combos})</option>
          </select>
          <select
            className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-gray-900 outline-none"
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
          >
            <option value="all">Todas las categorías</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowImportModal(true)}
            className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl flex items-center gap-2 font-medium transition-colors hover:bg-gray-50"
          >
            Importar Excel
          </button>
          <button
            onClick={() => { setEditingItem(null); setShowCreateItem(true); }}
            className="px-4 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl flex items-center gap-2 font-medium transition-colors"
          >
            <Plus className="w-5 h-5" />
            Nuevo artículo
          </button>
          <button
            onClick={handleDeleteFilteredCatalog}
            disabled={bulkDeletingCatalog || filteredCatalog.length === 0}
            className="px-4 py-2.5 border border-red-300 text-red-700 rounded-xl flex items-center gap-2 font-medium transition-colors hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-5 h-5" />
            {bulkDeletingCatalog ? 'Eliminando...' : `Eliminar filtro (${filteredCatalog.length})`}
          </button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-500 dark:text-gray-400">
          <div className="animate-spin w-6 h-6 border-2 border-gray-300 border-t-gray-900 rounded-full mr-3" />
          Cargando catálogo...
        </div>
      ) : filteredCatalog.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
          <Package className="w-12 h-12 text-gray-300 mb-3" />
          <p className="font-semibold">No hay artículos en el catálogo</p>
          <p className="text-sm mt-1">Añade el primer artículo</p>
          <button
            onClick={() => { setEditingItem(null); setShowCreateItem(true); }}
            className="mt-4 px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-medium"
          >
            + Nuevo artículo
          </button>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Nombre</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Tipo</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Categoría</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Precio</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Stock</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Web</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Disponible</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Estado</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filteredCatalog.map(item => {
                const itemType = item.itemType || 'product';
                const isLowStock = itemType === 'product' && item.stockQuantity <= item.minStock;
                const typeBadgeClass = itemType === 'service'
                  ? 'bg-purple-100 text-purple-700 border-purple-200'
                  : itemType === 'combo'
                    ? 'bg-amber-100 text-amber-700 border-amber-200'
                    : 'bg-blue-100 text-blue-700 border-blue-200';
                const typeLabel = itemType === 'service' ? 'Servicio' : itemType === 'combo' ? 'Combo' : 'Producto';
                return (
                  <tr key={item._id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {item.image ? (
                          <img src={item.image} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0">
                            <Package className="w-4 h-4 text-gray-400" />
                          </div>
                        )}
                        <div>
                          <div className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{item.name}</div>
                          {item.description && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate max-w-xs">{item.description}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-lg border ${typeBadgeClass}`}>
                        {typeLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {item.category ? (
                        <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-medium rounded-lg">
                          {item.category}
                        </span>
                      ) : <span className="text-gray-400 text-sm">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-bold text-gray-900 dark:text-gray-100">{item.unitPrice.toFixed(2)}€</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Coste: {item.costPrice.toFixed(2)}€</div>
                    </td>
                    <td className="px-4 py-3">
                      {itemType === 'service' ? (
                        <span className="text-sm text-gray-400">No aplica</span>
                      ) : (
                        <div className={`text-sm font-bold ${isLowStock ? 'text-red-600' : 'text-gray-900 dark:text-gray-100'}`}>
                          {item.stockQuantity} {item.unit}
                        </div>
                      )}
                      {isLowStock && (
                        <div className="text-xs text-red-500 flex items-center gap-1 mt-0.5">
                          <AlertTriangle className="w-3 h-3" /> Min: {item.minStock}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleToggleField(item, 'webVisible')}
                        title={item.webVisible ? 'Visible en web — clic para ocultar' : 'Oculto de la web — clic para mostrar'}
                        className={`w-9 h-5 rounded-full transition-colors relative inline-block ${item.webVisible ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                      >
                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${item.webVisible ? 'translate-x-4' : 'translate-x-0.5'}`} />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleToggleField(item, 'available')}
                        title={item.available ? 'Disponible — clic para marcar agotado' : 'No disponible — clic para habilitar'}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-full border transition-colors ${
                          item.available
                            ? 'bg-green-100 text-green-700 border-green-200 hover:bg-green-200'
                            : 'bg-red-100 text-red-700 border-red-200 hover:bg-red-200'
                        }`}
                      >
                        {item.available ? 'Sí' : 'Agotado'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggleField(item, 'active')}
                        className={`px-2 py-1 text-xs font-semibold rounded-full border cursor-pointer transition-colors ${
                          item.active
                            ? 'bg-green-100 text-green-700 border-green-200 hover:bg-green-200'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {item.active ? 'Activo' : 'Inactivo'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => { setEditingItem(item); setShowCreateItem(true); }}
                          className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                          title="Editar"
                        >
                          <Edit3 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                        </button>
                        <button
                          onClick={() => setStockAdjustItem(item)}
                          className="p-1.5 hover:bg-blue-100 rounded-lg transition-colors"
                          title="Ajustar stock"
                        >
                          <ArrowUpDown className="w-4 h-4 text-blue-600" />
                        </button>
                        <button
                          onClick={() => handleDeleteItem(item)}
                          disabled={bulkDeletingCatalog || deletingItemIds.has(item._id)}
                          className="p-1.5 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  // ── Tab: Artículos (Stock) ──────────────────────────────────────────────────

  const renderStockTab = () => {
    const stockItems = catalogItems.filter(i => (i.itemType || 'product') === 'product');
    const sortedByStock = [...stockItems].sort((a, b) => {
      const aLow = a.stockQuantity <= a.minStock ? 0 : 1;
      const bLow = b.stockQuantity <= b.minStock ? 0 : 1;
      return aLow - bLow || a.stockQuantity - b.stockQuantity;
    });

    const lowStockItems = stockItems.filter(i => i.active && Number(i.minStock || 0) > 0 && i.stockQuantity <= i.minStock);

    return (
      <div className="space-y-5">
        {/* Low stock alert */}
        {lowStockItems.length > 0 && (
          <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4">
            <h3 className="font-bold text-red-900 mb-3 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              Alertas de stock bajo ({lowStockItems.length})
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {lowStockItems.map(item => (
                <div key={item._id} className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-xl border border-red-200">
                  <div>
                    <div className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{item.name}</div>
                    <div className="text-xs text-red-600">
                      Stock: {item.stockQuantity} {item.unit} (mín: {item.minStock})
                    </div>
                  </div>
                  <button
                    onClick={() => setStockAdjustItem(item)}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-colors"
                  >
                    Reponer
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stock grid */}
        {sortedByStock.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
            <Archive className="w-12 h-12 text-gray-300 mb-3" />
            <p className="font-semibold">Sin artículos en inventario</p>
            <p className="text-sm mt-1">Añade artículos desde la pestaña Catálogo</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {sortedByStock.map(item => {
              const isLow = item.stockQuantity <= item.minStock;
              const stockPct = item.minStock > 0
                ? Math.min(100, Math.round((item.stockQuantity / (item.minStock * 3)) * 100))
                : 100;
              return (
                <div
                  key={item._id}
                  className={`bg-white dark:bg-gray-800 border-2 rounded-xl p-4 transition-all ${
                    isLow ? 'border-red-300 dark:border-red-800' : 'border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{item.name}</div>
                      {item.category && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">{item.category}</span>
                      )}
                    </div>
                    {isLow && <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />}
                  </div>

                  <div className={`text-3xl font-bold mb-1 ${isLow ? 'text-red-600' : 'text-gray-900 dark:text-gray-100'}`}>
                    {item.stockQuantity}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-3">{item.unit} · Mín: {item.minStock}</div>

                  {/* Stock bar */}
                  <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden mb-3">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isLow ? 'bg-red-500' : stockPct > 60 ? 'bg-green-500' : 'bg-amber-500'
                      }`}
                      style={{ width: `${stockPct}%` }}
                    />
                  </div>

                  <button
                    onClick={() => setStockAdjustItem(item)}
                    className="w-full px-3 py-2 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <ArrowUpDown className="w-3.5 h-3.5" /> Ajustar stock
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // ── Tab: Proveedores ────────────────────────────────────────────────────────

  const renderSuppliersTab = () => (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-2 gap-4">
        <div className="p-4 bg-blue-50 border-2 border-blue-200 rounded-xl">
          <div className="text-blue-600 mb-2"><Users className="w-5 h-5" /></div>
          <div className="text-2xl font-bold text-blue-900">{supplierKpis.total}</div>
          <div className="text-xs text-blue-700 mt-0.5">Total proveedores</div>
        </div>
        <div className="p-4 bg-green-50 border-2 border-green-200 rounded-xl">
          <div className="text-green-600 mb-2"><CheckCircle2 className="w-5 h-5" /></div>
          <div className="text-2xl font-bold text-green-900">{supplierKpis.active}</div>
          <div className="text-xs text-green-700 mt-0.5">Activos</div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end">
        <button
          onClick={() => { setEditingSupplier(null); setShowCreateSupplier(true); }}
          className="px-4 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl flex items-center gap-2 font-medium transition-colors"
        >
          <Plus className="w-5 h-5" />
          Nuevo proveedor
        </button>
      </div>

      {/* Table */}
      {suppliers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
          <Truck className="w-12 h-12 text-gray-300 mb-3" />
          <p className="font-semibold">Sin proveedores registrados</p>
          <p className="text-sm mt-1">Añade el primer proveedor</p>
          <button
            onClick={() => { setEditingSupplier(null); setShowCreateSupplier(true); }}
            className="mt-4 px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-medium"
          >
            + Nuevo proveedor
          </button>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Nombre</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">CIF</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Email</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Teléfono</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Contacto</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Categoría</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Estado</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {suppliers.map(supplier => (
                <tr key={supplier._id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{supplier.name}</div>
                    {supplier.address && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate max-w-xs">{supplier.address}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-sm text-gray-700 dark:text-gray-300">{supplier.cif || '—'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-700 dark:text-gray-300">{supplier.email || '—'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-700 dark:text-gray-300">{supplier.phone || '—'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-700 dark:text-gray-300">{supplier.contactPerson || '—'}</span>
                  </td>
                  <td className="px-4 py-3">
                    {supplier.category ? (
                      <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-medium rounded-lg">
                        {supplier.category}
                      </span>
                    ) : <span className="text-gray-400 text-sm">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full border ${
                      supplier.active
                        ? 'bg-green-100 text-green-700 border-green-200'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700'
                    }`}>
                      {supplier.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => { setEditingSupplier(supplier); setShowCreateSupplier(true); }}
                        className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                        title="Editar"
                      >
                        <Edit3 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                      </button>
                      <button
                        onClick={() => handleDeleteSupplier(supplier)}
                        className="p-1.5 hover:bg-red-100 rounded-lg transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  // ── Tab: Facturas ───────────────────────────────────────────────────────────

  const renderInvoicesTab = () => {
    const invoicesWithOverdue = invoices.map(inv => {
      if (inv.status === 'pending' && inv.dueDate && new Date(inv.dueDate) < new Date()) {
        return { ...inv, status: 'overdue' };
      }
      return inv;
    });

    return (
      <div className="space-y-5">
        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-blue-50 border-2 border-blue-200 rounded-xl">
            <div className="text-blue-600 mb-2"><FileText className="w-5 h-5" /></div>
            <div className="text-2xl font-bold text-blue-900">{invoiceKpis.total}</div>
            <div className="text-xs text-blue-700 mt-0.5">Total facturas</div>
          </div>
          <div className="p-4 bg-amber-50 border-2 border-amber-200 rounded-xl">
            <div className="text-amber-600 mb-2"><Clock className="w-5 h-5" /></div>
            <div className="text-2xl font-bold text-amber-900">{invoiceKpis.pending}</div>
            <div className="text-xs text-amber-700 mt-0.5">Pendientes</div>
          </div>
          <div className="p-4 bg-green-50 border-2 border-green-200 rounded-xl">
            <div className="text-green-600 mb-2"><CheckCircle2 className="w-5 h-5" /></div>
            <div className="text-2xl font-bold text-green-900">{invoiceKpis.paid}</div>
            <div className="text-xs text-green-700 mt-0.5">Pagadas</div>
          </div>
          <div className="p-4 bg-purple-50 border-2 border-purple-200 rounded-xl">
            <div className="text-purple-600 mb-2"><BarChart3 className="w-5 h-5" /></div>
            <div className="text-2xl font-bold text-purple-900">{invoiceKpis.totalAmount.toLocaleString('es-ES', { maximumFractionDigits: 0 })}€</div>
            <div className="text-xs text-purple-700 mt-0.5">Total importe</div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end">
          <button
            onClick={() => { setEditingInvoice(null); setShowCreateInvoice(true); }}
            className="px-4 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl flex items-center gap-2 font-medium transition-colors"
          >
            <Plus className="w-5 h-5" />
            Nueva factura
          </button>
        </div>

        {/* Table */}
        {invoicesWithOverdue.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
            <FileText className="w-12 h-12 text-gray-300 mb-3" />
            <p className="font-semibold">Sin facturas de compra</p>
            <p className="text-sm mt-1">Registra la primera factura de proveedor</p>
            <button
              onClick={() => { setEditingInvoice(null); setShowCreateInvoice(true); }}
              className="mt-4 px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-medium"
            >
              + Nueva factura
            </button>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Nº Factura</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Proveedor</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Fecha</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Vencimiento</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Estado</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Total</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {invoicesWithOverdue.map(invoice => {
                  const statusCfg = INVOICE_STATUS_CONFIG[invoice.status] || INVOICE_STATUS_CONFIG.pending;
                  const originalInvoice = invoices.find(i => i._id === invoice._id)!;
                  return (
                    <tr key={invoice._id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-mono text-sm font-bold text-gray-900 dark:text-gray-100">
                          {invoice.invoiceNumber || '—'}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{invoice.supplierName}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          {invoice.date ? new Date(invoice.date).toLocaleDateString('es-ES') : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-sm ${invoice.status === 'overdue' ? 'text-red-600 font-semibold' : 'text-gray-700 dark:text-gray-300'}`}>
                          {invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString('es-ES') : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full border ${statusCfg.badgeClass}`}>
                          {statusCfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-bold text-gray-900 dark:text-gray-100 text-sm">
                          {(invoice.total || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })}€
                        </div>
                        {invoice.lines.length > 0 && (
                          <div className="text-xs text-gray-500 dark:text-gray-400">{invoice.lines.length} línea{invoice.lines.length !== 1 ? 's' : ''}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {originalInvoice.status !== 'paid' && (
                            <button
                              onClick={() => handleToggleInvoiceStatus(originalInvoice)}
                              className="p-1.5 hover:bg-green-100 rounded-lg transition-colors"
                              title="Marcar como pagada"
                            >
                              <CheckCircle2 className="w-4 h-4 text-green-600" />
                            </button>
                          )}
                          {originalInvoice.status === 'paid' && (
                            <button
                              onClick={() => handleToggleInvoiceStatus(originalInvoice)}
                              className="p-1.5 hover:bg-amber-100 rounded-lg transition-colors"
                              title="Marcar como pendiente"
                            >
                              <Clock className="w-4 h-4 text-amber-600" />
                            </button>
                          )}
                          <button
                            onClick={() => { setEditingInvoice(originalInvoice); setShowCreateInvoice(true); }}
                            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                            title="Editar"
                          >
                            <Edit3 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                          </button>
                          <button
                            onClick={() => handleDeleteInvoice(originalInvoice)}
                            className="p-1.5 hover:bg-red-100 rounded-lg transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  // ── Tabs config ─────────────────────────────────────────────────────────────

  const tabsConfig = [
    { id: 'catalog', label: 'Catálogo', count: catalogItems.length || undefined },
    { id: 'stock', label: 'Artículos', count: catalogKpis.lowStock || undefined },
    { id: 'suppliers', label: 'Proveedores', count: supplierKpis.active || undefined },
    { id: 'invoices', label: 'Facturas', count: invoiceKpis.pending || undefined },
  ];

  return (
    <Layout title="Catálogo" subtitle="Gestión de productos, proveedores y compras">
      <div className="space-y-6">
        <Tabs tabs={tabsConfig} activeTab={activeTab} onChange={setActiveTab} />
        {activeTab === 'catalog' && renderCatalogTab()}
        {activeTab === 'stock' && renderStockTab()}
        {activeTab === 'suppliers' && renderSuppliersTab()}
        {activeTab === 'invoices' && renderInvoicesTab()}
      </div>

      <CreateCatalogItemModal
        isOpen={showCreateItem}
        onClose={() => { setShowCreateItem(false); setEditingItem(null); }}
        onCreate={handleCreateItem}
        editItem={editingItem}
      />

      <CreateSupplierModal
        isOpen={showCreateSupplier}
        onClose={() => { setShowCreateSupplier(false); setEditingSupplier(null); }}
        onCreate={handleCreateSupplier}
        editItem={editingSupplier}
      />

      <CreateInvoiceModal
        isOpen={showCreateInvoice}
        onClose={() => { setShowCreateInvoice(false); setEditingInvoice(null); }}
        onCreate={handleCreateInvoice}
        suppliers={suppliers}
        editItem={editingInvoice}
      />

      <StockAdjustModal
        isOpen={!!stockAdjustItem}
        onClose={() => setStockAdjustItem(null)}
        item={stockAdjustItem}
        onAdjust={handleStockAdjust}
      />
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="delivery_catalog"
        moduleLabel="Catálogo"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <CatalogDeleteGuardModal
        open={catalogDeleteGuard !== null}
        payload={
          catalogDeleteGuard?.mode === 'single'
            ? { mode: 'single', itemName: catalogDeleteGuard.item.name }
            : catalogDeleteGuard?.mode === 'bulk'
              ? { mode: 'bulk', count: catalogDeleteGuard.items.length }
              : null
        }
        onClose={() => setCatalogDeleteGuard(null)}
        onVerified={() => {
          void executeCatalogDeleteAfterGuard();
        }}
      />

      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Catálogo"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
        extraFileUpload={{
          label: 'ZIP de imágenes (opcional)',
          helpText: 'Sube un ZIP con fotos nombradas por SKU o nombre del producto (si falta match se bloquea la importación).',
          accept: '.zip,application/zip',
          loading: loadingImageZip,
          countLabel: Object.keys(imageZipMap).length > 0
            ? `${Object.keys(imageZipMap).length} imagen(es) preparadas para mapear`
            : '',
          sampleZipLabel: 'Descargar ZIP ejemplo',
          onDownloadSampleZip: handleDownloadSampleZip,
          onFileSelected: async (file) => {
            await handleZipFileSelected(file);
          },
        }}
      />
    </Layout>
  );
}
