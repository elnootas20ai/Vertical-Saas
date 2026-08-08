import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import JSZip from 'jszip';
import { Layout } from '../../components/saas/Layout';
import { useModalClose } from '../../hooks/useModalClose';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { useApp } from '../../context/AppContext';
import {
  dedupeCatalogItemsForDisplay,
  filterCatalogItemsForBusinessScope,
} from '../../lib/catalogBusinessScope';
import { resolveBusinessScopeId } from '../../lib/deliverySetup';
import { isRestaurantBusinessType } from '../../lib/deliveryOpsTypes';
import { getRetailOpsUiCopy } from '../../lib/retailUiCopy';
import {
  listCatalogItemsRequest,
  createCatalogItemRequest,
  updateCatalogItemRequest,
  deleteCatalogItemRequest,
  bulkCreateCatalogItemsRequest,
  type CatalogItem,
  type CatalogItemType,
  type CatalogArticleRef,
  type CatalogComboRef,
  type CatalogSalesChannel,
} from '../../lib/deliveryApi';
import { listBrandsRequest, createBrandRequest, type Brand } from '../../lib/brandsApi';
import { useVerticalCatalog, type VerticalCatalogConfig } from '../../hooks/useVerticalCatalog';
import {
  Search, X, Trash2, Edit3, Package, Layers, CheckCircle2,
  DollarSign, Factory, Boxes, ShoppingBag, ExternalLink,
  Plus, Minus, Tag, ShoppingCart, Wrench, LayoutGrid,
  Barcode, ImagePlus, ChevronRight,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';
import { CatalogDeleteGuardModal } from '../../components/saas/CatalogDeleteGuardModal';

const DEFAULT_UNIT_OPTIONS = [
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

const TAX_OPTIONS = [
  { value: 21, label: 'IVA General (21%)' },
  { value: 10, label: 'IVA Reducido (10%)' },
  { value: 4, label: 'IVA Superreducido (4%)' },
  { value: 0, label: 'Exento (0%)' },
];

const DEFAULT_SALES_CHANNELS = [
  { id: 'pos', name: 'Punto de venta (TPV)' },
  { id: 'web', name: 'Web / eCommerce' },
  { id: 'delivery', name: 'Delivery propio' },
  { id: 'glovo', name: 'Glovo' },
  { id: 'ubereats', name: 'Uber Eats' },
  { id: 'justeat', name: 'Just Eat' },
  { id: 'deliveroo', name: 'Deliveroo' },
];

function salesChannelsForBusinessType(businessType: string) {
  const copy = getRetailOpsUiCopy(businessType);
  if (isRestaurantBusinessType(businessType)) {
    return DEFAULT_SALES_CHANNELS
      .filter((ch) => ch.id !== 'web' && !['glovo', 'ubereats', 'justeat', 'deliveroo'].includes(ch.id))
      .map((ch) => (ch.id === 'delivery' ? { ...ch, name: copy.salesChannelDelivery } : ch));
  }
  return DEFAULT_SALES_CHANNELS;
}

const normalizeDuplicateValue = (value?: string | null): string =>
  String(value || '').trim().toLowerCase();

const normalizeMediaKey = (value?: string | null): string =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

const SAMPLE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9pO7s/0AAAAASUVORK5CYII=';

function getStepsForType(itemType: CatalogItemType): string[] {
  switch (itemType) {
    case 'product':
      return ['Tipo', 'Artículos', 'Precio y fiscalidad', 'Marcas y canales', 'Detalles del producto', 'Resumen'];
    case 'service':
      return ['Tipo', 'Detalles del servicio', 'Precio y fiscalidad', 'Marcas y canales', 'Resumen'];
    case 'combo':
      return ['Tipo', 'Productos del combo', 'Precio y fiscalidad', 'Marcas y canales', 'Detalles del combo', 'Resumen'];
    default:
      return ['Tipo'];
  }
}

// ─── CreateItemModal ─────────────────────────────────────────────────────────

interface CreateItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: Partial<CatalogItem>) => Promise<void>;
  editItem?: CatalogItem | null;
  verticalConfig: VerticalCatalogConfig;
  businessType: string;
  allCatalogItems: CatalogItem[];
  brands: Brand[];
  onCreateBrand: (name: string) => Promise<Brand>;
  existingCategories: string[];
}

function CreateItemModal({
  isOpen, onClose, onCreate, editItem,
  verticalConfig: vc, businessType, allCatalogItems, brands, onCreateBrand, existingCategories,
}: CreateItemModalProps) {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [itemType, setItemType] = useState<CatalogItemType>('product');

  const [articles, setArticles] = useState<CatalogArticleRef[]>([]);
  const [comboItems, setComboItems] = useState<CatalogComboRef[]>([]);
  const [salesChannels, setSalesChannels] = useState<CatalogSalesChannel[]>([]);
  const [selectedBrandIds, setSelectedBrandIds] = useState<string[]>([]);

  const [form, setForm] = useState({
    name: '', description: '', category: '', unit: 'ud',
    unitPrice: '', costPrice: '', taxRate: '21',
    image: '', images: [] as string[], notes: '',
    webVisible: true, available: true,
    sku: '', barcode: '',
    newImageUrl: '',
    newCategoryName: '',
    showNewCategory: false,
    newBrandName: '',
    showNewBrand: false,
    articleSearch: '',
    comboSearch: '',
  });

  const unitOptions = vc.units.length > 0 ? vc.units : DEFAULT_UNIT_OPTIONS;
  const stepLabels = getStepsForType(itemType);
  const totalSteps = stepLabels.length;
  const isEditMode = Boolean(editItem);
  const modalScrollRef = useRef<HTMLDivElement>(null);
  const editSections = stepLabels
    .filter(label => label !== 'Tipo' && label !== 'Resumen')
    .sort((a, b) => {
      const rank = (label: string) => {
        if (label.startsWith('Detalles')) return 0;
        if (label === 'Precio y fiscalidad') return 1;
        if (label === 'Marcas y canales') return 2;
        if (label === 'Artículos' || label === 'Productos del combo') return 3;
        return 4;
      };
      return rank(a) - rank(b);
    });

  const availableArticles = useMemo(() =>
    allCatalogItems.filter(i => i.active && i.itemType !== 'combo'),
    [allCatalogItems],
  );

  const availableProducts = useMemo(() =>
    allCatalogItems.filter(i => i.active && i.itemType === 'product'),
    [allCatalogItems],
  );

  const totalArticleCost = useMemo(() =>
    articles.reduce((sum, a) => {
      const item = allCatalogItems.find(i => i._id === a.articleId);
      return sum + (item ? item.costPrice * a.quantity : 0);
    }, 0),
    [articles, allCatalogItems],
  );

  const totalComboCost = useMemo(() =>
    comboItems.reduce((sum, c) => {
      const item = allCatalogItems.find(i => i._id === c.productId);
      return sum + (item ? item.costPrice * c.quantity : 0);
    }, 0),
    [comboItems, allCatalogItems],
  );

  const escandallo = itemType === 'product' ? totalArticleCost * 3 : itemType === 'combo' ? totalComboCost * 3 : 0;
  const currentCost = itemType === 'product' ? totalArticleCost : itemType === 'combo' ? totalComboCost : 0;

  useEffect(() => {
    if (editItem) {
      setItemType(editItem.itemType || 'product');
      setArticles(editItem.articles || []);
      setComboItems(editItem.comboItems || []);
      setSalesChannels(editItem.salesChannels || []);
      setSelectedBrandIds(editItem.brandIds || []);
      setForm({
        name: editItem.name, description: editItem.description, category: editItem.category,
        unit: editItem.unit || 'ud', unitPrice: String(editItem.unitPrice || ''),
        costPrice: String(editItem.costPrice || ''), taxRate: String(editItem.taxRate ?? 21),
        image: editItem.image || '', images: editItem.images || [],
        notes: editItem.notes || '',
        webVisible: editItem.webVisible ?? true, available: editItem.available ?? true,
        sku: editItem.sku || '', barcode: editItem.barcode || '',
        newImageUrl: '', newCategoryName: '', showNewCategory: false,
        newBrandName: '', showNewBrand: false, articleSearch: '', comboSearch: '',
      });
      setStep(2);
    } else {
      setItemType('product');
      setArticles([]);
      setComboItems([]);
      setSalesChannels([]);
      setSelectedBrandIds([]);
      setForm({
        name: '', description: '', category: '', unit: unitOptions[0]?.value || 'ud',
        unitPrice: '', costPrice: '', taxRate: '21',
        image: '', images: [], notes: '',
        webVisible: true, available: true, sku: '', barcode: '',
        newImageUrl: '', newCategoryName: '', showNewCategory: false,
        newBrandName: '', showNewBrand: false, articleSearch: '', comboSearch: '',
      });
      setStep(1);
    }
  }, [editItem, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const id = window.requestAnimationFrame(() => {
      if (modalScrollRef.current) modalScrollRef.current.scrollTop = 0;
    });
    return () => window.cancelAnimationFrame(id);
  }, [isOpen, editItem?._id]);
  useModalClose(isOpen, onClose);

  if (!isOpen) return null;

  const handleFinalSubmit = async () => {
    if (!form.name.trim()) { toast.error('El nombre es obligatorio'); return; }
    setSubmitting(true);
    try {
      await onCreate({
        ...editItem,
        vertical: businessType,
        itemType,
        name: form.name, description: form.description, category: form.category,
        unitPrice: Number(form.unitPrice) || 0,
        costPrice: itemType === 'service' ? 0 : currentCost,
        taxRate: Number(form.taxRate) || 21,
        unit: form.unit, image: form.image || form.images[0] || '', images: form.images,
        notes: form.notes,
        active: editItem?.active ?? true, webVisible: form.webVisible, available: form.available,
        sku: form.sku || undefined, barcode: form.barcode || undefined,
        brandIds: selectedBrandIds,
        articles: itemType === 'product' ? articles : [],
        comboItems: itemType === 'combo' ? comboItems : [],
        salesChannels,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const addArticle = (item: CatalogItem) => {
    if (articles.some(a => a.articleId === item._id)) return;
    setArticles(prev => [...prev, { articleId: item._id, articleName: item.name, quantity: 1, unit: item.unit || 'ud' }]);
    setForm(f => ({ ...f, articleSearch: '' }));
  };

  const removeArticle = (articleId: string) => setArticles(prev => prev.filter(a => a.articleId !== articleId));
  const updateArticleQty = (articleId: string, qty: number) => setArticles(prev => prev.map(a => a.articleId === articleId ? { ...a, quantity: Math.max(0.01, qty) } : a));
  const updateArticleUnit = (articleId: string, unit: string) => setArticles(prev => prev.map(a => a.articleId === articleId ? { ...a, unit } : a));

  const addComboItem = (item: CatalogItem) => {
    if (comboItems.some(c => c.productId === item._id)) return;
    setComboItems(prev => [...prev, { productId: item._id, productName: item.name, quantity: 1 }]);
    setForm(f => ({ ...f, comboSearch: '' }));
  };

  const removeComboItem = (pid: string) => setComboItems(prev => prev.filter(c => c.productId !== pid));
  const updateComboQty = (pid: string, qty: number) => setComboItems(prev => prev.map(c => c.productId === pid ? { ...c, quantity: Math.max(1, qty) } : c));

  const toggleSalesChannel = (ch: { id: string; name: string }) => {
    setSalesChannels(prev => {
      if (prev.some(c => c.channelId === ch.id)) return prev.filter(c => c.channelId !== ch.id);
      return [...prev, { channelId: ch.id, channelName: ch.name, customPrice: null }];
    });
  };

  const updateChannelPrice = (chId: string, price: string) => {
    setSalesChannels(prev => prev.map(c => c.channelId === chId ? { ...c, customPrice: price ? Number(price) : null } : c));
  };

  const toggleBrand = (bid: string) => setSelectedBrandIds(prev => prev.includes(bid) ? prev.filter(b => b !== bid) : [...prev, bid]);

  const handleCreateBrand = async () => {
    if (!form.newBrandName.trim()) return;
    try {
      const brand = await onCreateBrand(form.newBrandName.trim());
      setSelectedBrandIds(prev => [...prev, brand._id]);
      setForm(f => ({ ...f, newBrandName: '', showNewBrand: false }));
    } catch {
      toast.error('Error al crear la marca');
    }
  };

  const addImage = () => {
    if (!form.newImageUrl.trim()) return;
    setForm(f => ({ ...f, images: [...f.images, f.newImageUrl.trim()], newImageUrl: '' }));
  };

  const removeImage = (idx: number) => setForm(f => ({ ...f, images: f.images.filter((_, i) => i !== idx) }));

  const generateBarcode = () => setForm(f => ({ ...f, barcode: `${Date.now()}`.slice(-13) }));

  const addNewCategory = () => {
    if (!form.newCategoryName.trim()) return;
    setForm(f => ({ ...f, category: f.newCategoryName.trim(), showNewCategory: false, newCategoryName: '' }));
  };

  const canNext = () => {
    const label = stepLabels[step - 1];
    if (label === 'Artículos') return articles.length > 0;
    if (label === 'Productos del combo') return comboItems.length > 0;
    if (label.startsWith('Detalles')) return form.name.trim().length > 0;
    return true;
  };

  const inputClass = 'w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100';
  const labelClass = 'block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5';

  const filteredArticles = form.articleSearch
    ? availableArticles.filter(i => i.name.toLowerCase().includes(form.articleSearch.toLowerCase()))
    : availableArticles;

  const filteredProducts = form.comboSearch
    ? availableProducts.filter(i => i.name.toLowerCase().includes(form.comboSearch.toLowerCase()))
    : availableProducts;

  const renderStep = (forcedLabel?: string) => {
    const label = forcedLabel || stepLabels[step - 1];

    // ── Tipo ──
    if (label === 'Tipo') {
      const opts: { type: CatalogItemType; icon: typeof ShoppingCart; title: string; desc: string; color: string }[] = [
        { type: 'product', icon: ShoppingCart, title: 'Producto', desc: 'Artículo único o compuesto (ej: Coca-Cola, Hamburguesa). Se conecta a artículos del inventario para control de stock.', color: 'blue' },
        { type: 'service', icon: Wrench, title: 'Servicio', desc: 'Servicio que no se vincula a artículos de inventario (ej: Corte de pelo, Consulta). No resta del stock.', color: 'purple' },
        { type: 'combo', icon: LayoutGrid, title: 'Combo', desc: 'Agrupa varios productos ya existentes en una oferta combinada (ej: Menú del día).', color: 'amber' },
      ];
      return (
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Selecciona el tipo de elemento que quieres añadir al catálogo.</p>
          {opts.map(opt => (
            <button
              key={opt.type}
              type="button"
              onClick={() => { setItemType(opt.type); setStep(2); }}
              className="w-full p-5 rounded-2xl border-2 border-gray-200 dark:border-gray-700 text-left transition-all hover:shadow-md hover:border-gray-400 bg-white dark:bg-gray-800"
            >
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-xl ${opt.color === 'blue' ? 'bg-blue-100 dark:bg-blue-900/30' : opt.color === 'purple' ? 'bg-purple-100 dark:bg-purple-900/30' : 'bg-amber-100 dark:bg-amber-900/30'}`}>
                  <opt.icon className={`w-6 h-6 ${opt.color === 'blue' ? 'text-blue-600' : opt.color === 'purple' ? 'text-purple-600' : 'text-amber-600'}`} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-gray-900 dark:text-gray-100 text-lg">{opt.title}</h3>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{opt.desc}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      );
    }

    // ── Artículos (Producto) ──
    if (label === 'Artículos') {
      return (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-xl">
            <Package className="w-5 h-5 text-blue-600 shrink-0" />
            <p className="text-sm text-blue-800 dark:text-blue-300">Selecciona los artículos que componen este producto y su cantidad.</p>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input className={`${inputClass} pl-9`} placeholder="Buscar artículo..." value={form.articleSearch} onChange={e => setForm(f => ({ ...f, articleSearch: e.target.value }))} />
          </div>
          {form.articleSearch && filteredArticles.length > 0 && (
            <div className="max-h-40 overflow-y-auto border-2 border-gray-200 dark:border-gray-700 rounded-xl divide-y divide-gray-100 dark:divide-gray-800">
              {filteredArticles.slice(0, 10).map(item => (
                <button key={item._id} type="button" onClick={() => addArticle(item)} disabled={articles.some(a => a.articleId === item._id)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 text-left disabled:opacity-40">
                  <Package className="w-4 h-4 text-gray-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{item.name}</div>
                    <div className="text-xs text-gray-500">{item.costPrice.toFixed(2)}€/{item.unit} · Stock: {item.stockQuantity}</div>
                  </div>
                  <Plus className="w-4 h-4 text-green-600 shrink-0" />
                </button>
              ))}
            </div>
          )}
          {articles.length > 0 && (
            <div className="space-y-2">
              <label className={labelClass}>Artículos seleccionados</label>
              {articles.map(a => {
                const item = allCatalogItems.find(i => i._id === a.articleId);
                return (
                  <div key={a.articleId} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{a.articleName}</div>
                      {item && <div className="text-xs text-gray-500">Coste: {item.costPrice.toFixed(2)}€/{item.unit}</div>}
                    </div>
                    <input type="number" step="0.01" min="0.01" className="w-20 px-2 py-1.5 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-sm text-center bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      value={a.quantity} onChange={e => updateArticleQty(a.articleId, Number(e.target.value))} />
                    <select className="px-2 py-1.5 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      value={a.unit} onChange={e => updateArticleUnit(a.articleId, e.target.value)}>
                      {unitOptions.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                    </select>
                    <button type="button" onClick={() => removeArticle(a.articleId)} className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg">
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </button>
                  </div>
                );
              })}
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-sm font-semibold text-blue-800 dark:text-blue-300">
                Coste total de artículos: {totalArticleCost.toFixed(2)}€
              </div>
            </div>
          )}
          {articles.length === 0 && !form.articleSearch && (
            <div className="text-center py-8 text-gray-400">
              <Package className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Busca y añade artículos del inventario</p>
            </div>
          )}
        </div>
      );
    }

    // ── Productos del combo ──
    if (label === 'Productos del combo') {
      return (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-800 rounded-xl">
            <LayoutGrid className="w-5 h-5 text-amber-600 shrink-0" />
            <p className="text-sm text-amber-800 dark:text-amber-300">Selecciona los productos existentes que forman este combo.</p>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input className={`${inputClass} pl-9`} placeholder="Buscar producto..." value={form.comboSearch} onChange={e => setForm(f => ({ ...f, comboSearch: e.target.value }))} />
          </div>
          {form.comboSearch && filteredProducts.length > 0 && (
            <div className="max-h-40 overflow-y-auto border-2 border-gray-200 dark:border-gray-700 rounded-xl divide-y divide-gray-100 dark:divide-gray-800">
              {filteredProducts.slice(0, 10).map(item => (
                <button key={item._id} type="button" onClick={() => addComboItem(item)} disabled={comboItems.some(c => c.productId === item._id)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 text-left disabled:opacity-40">
                  <ShoppingCart className="w-4 h-4 text-gray-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{item.name}</div>
                    <div className="text-xs text-gray-500">{item.unitPrice.toFixed(2)}€ · Coste: {item.costPrice.toFixed(2)}€</div>
                  </div>
                  <Plus className="w-4 h-4 text-green-600 shrink-0" />
                </button>
              ))}
            </div>
          )}
          {comboItems.length > 0 && (
            <div className="space-y-2">
              <label className={labelClass}>Productos en el combo</label>
              {comboItems.map(c => {
                const item = allCatalogItems.find(i => i._id === c.productId);
                return (
                  <div key={c.productId} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{c.productName}</div>
                      {item && <div className="text-xs text-gray-500">PVP: {item.unitPrice.toFixed(2)}€ · Coste: {item.costPrice.toFixed(2)}€</div>}
                    </div>
                    <button type="button" onClick={() => updateComboQty(c.productId, c.quantity - 1)} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg"><Minus className="w-4 h-4 text-gray-600" /></button>
                    <span className="w-8 text-center text-sm font-bold text-gray-900 dark:text-gray-100">{c.quantity}</span>
                    <button type="button" onClick={() => updateComboQty(c.productId, c.quantity + 1)} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg"><Plus className="w-4 h-4 text-gray-600" /></button>
                    <button type="button" onClick={() => removeComboItem(c.productId)} className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg"><Trash2 className="w-4 h-4 text-red-500" /></button>
                  </div>
                );
              })}
              <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl text-sm font-semibold text-amber-800 dark:text-amber-300">
                Coste total del combo: {totalComboCost.toFixed(2)}€
              </div>
            </div>
          )}
        </div>
      );
    }

    // ── Precio y fiscalidad ──
    if (label === 'Precio y fiscalidad') {
      return (
        <div className="space-y-5">
          <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800 rounded-xl">
            <DollarSign className="w-5 h-5 text-green-600 shrink-0" />
            <p className="text-sm text-green-800 dark:text-green-300">Define el precio de venta e impuestos.</p>
          </div>
          {currentCost > 0 && (
            <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-xl space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Coste de artículos</span>
                <span className="font-bold text-gray-900 dark:text-gray-100">{currentCost.toFixed(2)}€</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Escandallo recomendado (x3)</span>
                <span className="font-bold text-green-700 dark:text-green-400">{escandallo.toFixed(2)}€</span>
              </div>
              <button type="button" onClick={() => setForm(f => ({ ...f, unitPrice: escandallo.toFixed(2) }))}
                className="w-full mt-1 px-3 py-2 text-xs font-semibold text-green-700 bg-green-100 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 rounded-lg transition-colors">
                Aplicar precio escandallo ({escandallo.toFixed(2)}€)
              </button>
            </div>
          )}
          <div>
            <label className={labelClass}>Precio de venta (€)</label>
            <input type="number" step="0.01" className={inputClass} placeholder="0.00" value={form.unitPrice} onChange={e => setForm(f => ({ ...f, unitPrice: e.target.value }))} autoFocus />
          </div>
          <div>
            <label className={labelClass}>Impuesto (IVA)</label>
            <select className={inputClass} value={form.taxRate} onChange={e => setForm(f => ({ ...f, taxRate: e.target.value }))}>
              {TAX_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          {Number(form.unitPrice) > 0 && (
            <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-xl space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Base imponible</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">{(Number(form.unitPrice) / (1 + Number(form.taxRate) / 100)).toFixed(2)}€</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">IVA ({form.taxRate}%)</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">{(Number(form.unitPrice) - Number(form.unitPrice) / (1 + Number(form.taxRate) / 100)).toFixed(2)}€</span>
              </div>
              <div className="flex justify-between text-sm pt-1 border-t border-gray-200 dark:border-gray-700">
                <span className="font-semibold text-gray-600 dark:text-gray-400">PVP</span>
                <span className="font-bold text-gray-900 dark:text-gray-100">{Number(form.unitPrice).toFixed(2)}€</span>
              </div>
              {currentCost > 0 && (
                <div className="flex justify-between text-sm pt-1 border-t border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">Margen</span>
                  <span className={`font-bold ${Number(form.unitPrice) - currentCost >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                    {(Number(form.unitPrice) - currentCost).toFixed(2)}€ ({currentCost > 0 ? (((Number(form.unitPrice) - currentCost) / currentCost) * 100).toFixed(0) : '—'}%)
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      );
    }

    // ── Marcas y canales ──
    if (label === 'Marcas y canales') {
      return (
        <div className="space-y-5">
          <div className="flex items-center gap-3 p-4 bg-purple-50 dark:bg-purple-900/20 border-2 border-purple-200 dark:border-purple-800 rounded-xl">
            <Tag className="w-5 h-5 text-purple-600 shrink-0" />
            <p className="text-sm text-purple-800 dark:text-purple-300">Asigna marcas y canales de venta. Puedes modificar el PVP por canal.</p>
          </div>
          <div>
            <label className={labelClass}>Marcas</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {brands.filter(b => b.active).map(b => (
                <button key={b._id} type="button" onClick={() => toggleBrand(b._id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border-2 transition-colors ${selectedBrandIds.includes(b._id) ? 'bg-purple-100 border-purple-400 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' : 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-400'}`}>
                  {b.name}
                </button>
              ))}
            </div>
            {form.showNewBrand ? (
              <div className="flex gap-2">
                <input autoFocus className={`${inputClass} flex-1`} placeholder="Nombre de la nueva marca" value={form.newBrandName}
                  onChange={e => setForm(f => ({ ...f, newBrandName: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') handleCreateBrand(); if (e.key === 'Escape') setForm(f => ({ ...f, showNewBrand: false })); }} />
                <button type="button" onClick={handleCreateBrand} className="px-3 py-2 bg-purple-600 text-white text-sm rounded-xl hover:bg-purple-700 transition-colors">Crear</button>
                <button type="button" onClick={() => setForm(f => ({ ...f, showNewBrand: false }))} className="px-3 py-2 border-2 border-gray-200 text-gray-600 text-sm rounded-xl hover:bg-gray-50"><X className="w-4 h-4" /></button>
              </div>
            ) : (
              <button type="button" onClick={() => setForm(f => ({ ...f, showNewBrand: true }))}
                className="px-3 py-1.5 border-2 border-dashed border-purple-300 text-purple-600 text-xs font-semibold rounded-full hover:bg-purple-50 transition-colors flex items-center gap-1">
                <Plus className="w-3 h-3" /> Nueva marca
              </button>
            )}
          </div>
          <div>
            <label className={labelClass}>Canales de venta</label>
            <div className="space-y-2">
              {salesChannelsForBusinessType(businessType).map(ch => {
                const active = salesChannels.some(c => c.channelId === ch.id);
                const channel = salesChannels.find(c => c.channelId === ch.id);
                return (
                  <div key={ch.id} className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-colors ${active ? 'border-green-300 bg-green-50 dark:bg-green-900/10 dark:border-green-800' : 'border-gray-200 dark:border-gray-700'}`}>
                    <button type="button" onClick={() => toggleSalesChannel(ch)}
                      className={`w-10 h-6 rounded-full transition-colors relative shrink-0 ${active ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
                      <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </button>
                    <span className="flex-1 text-sm font-medium text-gray-900 dark:text-gray-100">{ch.name}</span>
                    {active && (
                      <div className="flex items-center gap-1">
                        <input type="number" step="0.01" className="w-24 px-2 py-1 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-right"
                          placeholder={form.unitPrice || '0.00'} value={channel?.customPrice ?? ''} onChange={e => updateChannelPrice(ch.id, e.target.value)} />
                        <span className="text-xs text-gray-500">€</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      );
    }

    // ── Detalles ──
    if (label.startsWith('Detalles')) {
      const allCategories = [...new Set([...existingCategories, ...(vc.categories || [])])].sort();
      return (
        <div className="space-y-5">
          <div className="flex items-center gap-3 p-4 bg-indigo-50 dark:bg-indigo-900/20 border-2 border-indigo-200 dark:border-indigo-800 rounded-xl">
            <Edit3 className="w-5 h-5 text-indigo-600 shrink-0" />
            <p className="text-sm text-indigo-800 dark:text-indigo-300">Nombre, categoría, descripción e imágenes.</p>
          </div>
          <div>
            <label className={labelClass}>Nombre *</label>
            <input className={inputClass} placeholder="Nombre..." value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus />
          </div>
          <div>
            <label className={labelClass}>Categoría</label>
            {form.showNewCategory ? (
              <div className="flex gap-2">
                <input autoFocus className={`${inputClass} flex-1`} placeholder="Nueva categoría" value={form.newCategoryName}
                  onChange={e => setForm(f => ({ ...f, newCategoryName: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') addNewCategory(); if (e.key === 'Escape') setForm(f => ({ ...f, showNewCategory: false })); }} />
                <button type="button" onClick={addNewCategory} className="px-3 py-2 bg-indigo-600 text-white text-sm rounded-xl hover:bg-indigo-700 transition-colors">Crear</button>
                <button type="button" onClick={() => setForm(f => ({ ...f, showNewCategory: false }))} className="px-3 py-2 border-2 border-gray-200 text-gray-600 text-sm rounded-xl hover:bg-gray-50"><X className="w-4 h-4" /></button>
              </div>
            ) : (
              <div className="flex gap-2">
                <select className={`${inputClass} flex-1`} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  <option value="">Seleccionar categoría...</option>
                  {allCategories.map(cat => <option key={cat} value={cat}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</option>)}
                </select>
                <button type="button" onClick={() => setForm(f => ({ ...f, showNewCategory: true }))}
                  className="px-3 py-2 border-2 border-dashed border-indigo-300 text-indigo-600 text-sm rounded-xl hover:bg-indigo-50 transition-colors flex items-center gap-1 whitespace-nowrap">
                  <Plus className="w-3.5 h-3.5" /> Nueva
                </button>
              </div>
            )}
          </div>
          <div>
            <label className={labelClass}>Descripción</label>
            <textarea rows={3} className={`${inputClass} resize-none`} placeholder="Descripción detallada..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass}>Imágenes</label>
            <div className="flex gap-2 mb-2">
              <input className={`${inputClass} flex-1`} placeholder="URL de la imagen..." value={form.newImageUrl}
                onChange={e => setForm(f => ({ ...f, newImageUrl: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') addImage(); }} />
              <button type="button" onClick={addImage} className="px-3 py-2 bg-indigo-600 text-white text-sm rounded-xl hover:bg-indigo-700 transition-colors"><ImagePlus className="w-4 h-4" /></button>
            </div>
            {form.images.length > 0 ? (
              <div className="flex gap-2 flex-wrap">
                {form.images.map((img, idx) => (
                  <div key={idx} className="relative w-20 h-20 rounded-xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden group">
                    <img src={img} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    <button type="button" onClick={() => removeImage(idx)} className="absolute top-0.5 right-0.5 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><X className="w-3 h-3" /></button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex justify-center py-4">
                <div className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center bg-gray-50 dark:bg-gray-900"><ImagePlus className="w-6 h-6 text-gray-400" /></div>
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>SKU</label>
              <input className={inputClass} placeholder="Se genera automáticamente" value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} />
            </div>
            <div>
              <label className={labelClass}>Código de barras</label>
              <div className="flex gap-2">
                <input className={`${inputClass} flex-1`} placeholder="Opcional" value={form.barcode} onChange={e => setForm(f => ({ ...f, barcode: e.target.value }))} />
                <button type="button" onClick={generateBarcode} className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-sm rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors" title="Generar código">
                  <Barcode className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // ── Resumen ──
    if (label === 'Resumen') {
      const typeLabel = itemType === 'product' ? 'Producto' : itemType === 'service' ? 'Servicio' : 'Combo';
      const selectedBrands = brands.filter(b => selectedBrandIds.includes(b._id));
      return (
        <div className="space-y-5">
          <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800 rounded-xl">
            <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
            <p className="text-sm text-green-800 dark:text-green-300">Revisa la información antes de guardar.</p>
          </div>
          <div className="p-5 bg-gray-50 dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 space-y-4">
            <div className="flex items-start gap-4">
              {form.images[0] ? (
                <img src={form.images[0]} alt="" className="w-16 h-16 rounded-xl object-cover shrink-0" />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-gray-200 dark:bg-gray-700 flex items-center justify-center shrink-0">
                  {itemType === 'product' ? <ShoppingCart className="w-6 h-6 text-gray-400" /> : itemType === 'service' ? <Wrench className="w-6 h-6 text-gray-400" /> : <LayoutGrid className="w-6 h-6 text-gray-400" />}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <span className={`inline-block px-2 py-0.5 text-xs font-semibold rounded-full mb-1 ${itemType === 'product' ? 'bg-blue-100 text-blue-800' : itemType === 'service' ? 'bg-purple-100 text-purple-800' : 'bg-amber-100 text-amber-800'}`}>{typeLabel}</span>
                <div className="font-bold text-gray-900 dark:text-gray-100 text-lg">{form.name || 'Sin nombre'}</div>
                {form.category && <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{form.category}</div>}
                {form.description && <div className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">{form.description}</div>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-200 dark:border-gray-700">
              <div><div className="text-xs text-gray-500 dark:text-gray-400">PVP</div><div className="text-lg font-bold text-gray-900 dark:text-gray-100">{Number(form.unitPrice || 0).toFixed(2)}€</div></div>
              <div><div className="text-xs text-gray-500 dark:text-gray-400">IVA</div><div className="text-lg font-bold text-gray-900 dark:text-gray-100">{form.taxRate}%</div></div>
              {currentCost > 0 && (<>
                <div><div className="text-xs text-gray-500 dark:text-gray-400">Coste</div><div className="text-sm font-semibold text-gray-700 dark:text-gray-300">{currentCost.toFixed(2)}€</div></div>
                <div><div className="text-xs text-gray-500 dark:text-gray-400">Margen</div><div className={`text-sm font-semibold ${Number(form.unitPrice) - currentCost >= 0 ? 'text-green-700' : 'text-red-600'}`}>{(Number(form.unitPrice) - currentCost).toFixed(2)}€</div></div>
              </>)}
            </div>
            {itemType === 'product' && articles.length > 0 && (
              <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Artículos ({articles.length})</div>
                {articles.map(a => <div key={a.articleId} className="text-sm text-gray-700 dark:text-gray-300 flex justify-between"><span>{a.articleName}</span><span className="font-medium">{a.quantity} {a.unit}</span></div>)}
              </div>
            )}
            {itemType === 'combo' && comboItems.length > 0 && (
              <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Productos ({comboItems.length})</div>
                {comboItems.map(c => <div key={c.productId} className="text-sm text-gray-700 dark:text-gray-300 flex justify-between"><span>{c.productName}</span><span className="font-medium">x{c.quantity}</span></div>)}
              </div>
            )}
            {selectedBrands.length > 0 && (
              <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Marcas</div>
                <div className="flex flex-wrap gap-1">{selectedBrands.map(b => <span key={b._id} className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300 text-xs font-semibold rounded-full">{b.name}</span>)}</div>
              </div>
            )}
            {salesChannels.length > 0 && (
              <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Canales de venta</div>
                {salesChannels.map(ch => <div key={ch.channelId} className="text-sm text-gray-700 dark:text-gray-300 flex justify-between"><span>{ch.channelName}</span><span className="font-medium">{ch.customPrice !== null ? `${ch.customPrice.toFixed(2)}€` : `${Number(form.unitPrice || 0).toFixed(2)}€`}</span></div>)}
              </div>
            )}
            {(form.sku || form.barcode) && (
              <div className="pt-3 border-t border-gray-200 dark:border-gray-700 flex gap-4">
                {form.sku && <div><div className="text-xs text-gray-500">SKU</div><div className="text-sm font-medium text-gray-900 dark:text-gray-100">{form.sku}</div></div>}
                {form.barcode && <div><div className="text-xs text-gray-500">Código de barras</div><div className="text-sm font-medium text-gray-900 dark:text-gray-100">{form.barcode}</div></div>}
              </div>
            )}
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div ref={modalScrollRef} className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white dark:bg-gray-800 z-10 p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                {editItem ? 'Editar elemento' : 'Nuevo elemento del catálogo'}
              </h2>
              {!isEditMode && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  Paso {step} de {totalSteps} — {stepLabels[step - 1]}
                </p>
              )}
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors">
              <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </button>
          </div>
          {!isEditMode && totalSteps > 1 && (
            <div className="flex gap-1.5">
              {Array.from({ length: totalSteps }).map((_, i) => (
                <div key={i}
                  className={`h-1.5 flex-1 rounded-full transition-colors cursor-pointer ${i + 1 <= step ? 'bg-gray-900 dark:bg-gray-100' : 'bg-gray-200 dark:bg-gray-700'}`}
                  onClick={() => { if (i + 1 <= step) setStep(i + 1); }} />
              ))}
            </div>
          )}
        </div>
        <div className="p-6 min-h-[280px]">
          {isEditMode ? (
            <div className="space-y-6">
              {editSections.map(label => (
                <section key={label} className="space-y-2">
                  {label !== 'Detalles del producto' && label !== 'Detalles del servicio' && label !== 'Detalles del combo' && (
                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</h3>
                  )}
                  {renderStep(label)}
                </section>
              ))}
              <section className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Resumen</h3>
                {renderStep('Resumen')}
              </section>
            </div>
          ) : (
            renderStep()
          )}
        </div>
        {(isEditMode || step > 1) && (
          <div className="sticky bottom-0 bg-gray-50 dark:bg-gray-900 p-6 border-t border-gray-200 dark:border-gray-700 flex gap-3">
            {isEditMode ? (
              <>
                <button type="button" onClick={onClose} className="px-5 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-white dark:hover:bg-gray-800 transition-colors">Cancelar</button>
                <div className="flex-1" />
                <button type="button" onClick={handleFinalSubmit} disabled={submitting} className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold transition-colors disabled:opacity-60 disabled:cursor-wait">{submitting ? 'Guardando…' : 'Guardar cambios'}</button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => setStep(s => s - 1)} className="px-5 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-white dark:hover:bg-gray-800 transition-colors">Atrás</button>
                <div className="flex-1" />
                {step < totalSteps ? (
                  <button type="button" onClick={() => setStep(s => s + 1)} disabled={!canNext()} className="px-6 py-3 bg-gray-900 hover:bg-black text-white rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white">Siguiente</button>
                ) : (
                  <button type="button" onClick={handleFinalSubmit} disabled={submitting} className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold transition-colors disabled:opacity-60 disabled:cursor-wait">{submitting ? 'Guardando…' : 'Crear elemento'}</button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── CatalogPage ─────────────────────────────────────────────────────────────

export function CatalogPage() {
  const { user } = useAuth();
  const { currentBusiness, businesses } = useBusiness();
  const businessId = resolveBusinessScopeId(currentBusiness);
  const accountBusinessCount = businesses.length;
  const { createNotification } = useApp();
  const navigate = useNavigate();
  const { config: verticalConfig, businessType, isLoading: vcLoading } = useVerticalCatalog();
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateItem, setShowCreateItem] = useState(false);
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null);
  const [searchCatalog, setSearchCatalog] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [imageZipMap, setImageZipMap] = useState<Record<string, string>>({});
  const [loadingImageZip, setLoadingImageZip] = useState(false);
  const [filterType, setFilterType] = useState<'all' | CatalogItemType>('all');
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [catalogDeleteGuardItem, setCatalogDeleteGuardItem] = useState<CatalogItem | null>(null);
  const catalogDeleteItemRef = useRef<CatalogItem | null>(null);
  useEffect(() => {
    catalogDeleteItemRef.current = catalogDeleteGuardItem;
  }, [catalogDeleteGuardItem]);

  const vc = verticalConfig;

  const CATALOG_AI_FIELDS: AIFieldDef[] = useMemo(() => {
    const fields: AIFieldDef[] = [
      { key: 'name', label: 'Nombre' },
      { key: 'description', label: 'Descripción' },
      { key: 'category', label: 'Categoría' },
      { key: 'unit', label: `Unidad (${vc.units.map(u => u.value).slice(0, 4).join('/')})` },
      { key: 'unitPrice', label: 'Precio venta', type: 'number' },
      { key: 'costPrice', label: 'Precio coste', type: 'number' },
    ];
    if (vc.features.stock) {
      fields.push({ key: 'stockQuantity', label: 'Stock actual', type: 'number' });
      fields.push({ key: 'minStock', label: 'Stock mínimo', type: 'number' });
    }
    fields.push({ key: 'notes', label: 'Notas' });
    for (const cf of vc.customFields) {
      fields.push({ key: `customFields.${cf.key}`, label: cf.label, type: cf.type === 'number' ? 'number' : undefined });
    }
    return fields;
  }, [vc]);

  const CATALOG_IMPORT_FIELDS: ImportFieldDef[] = useMemo(() => {
    const fields: ImportFieldDef[] = [
      { key: 'name', label: 'Nombre', required: true, example: vc.categories[0] ? `${vc.itemLabel} ejemplo` : 'Artículo ejemplo' },
      { key: 'sku', label: 'SKU', example: 'SKU-001' },
      { key: 'description', label: 'Descripción', example: 'Descripción breve' },
      { key: 'category', label: 'Categoría', example: vc.categories[0] || 'general' },
      { key: 'unit', label: 'Unidad', example: vc.units[0]?.value || 'ud' },
      { key: 'unitPrice', label: 'Precio venta', required: true, example: '2.50' },
      { key: 'costPrice', label: 'Precio coste', example: '0.80' },
      { key: 'image', label: 'Imagen (URL opcional)', example: '' },
    ];
    if (vc.features.stock) {
      fields.push({ key: 'stockQuantity', label: 'Stock actual', example: '100' });
      fields.push({ key: 'minStock', label: 'Stock mínimo', example: '20' });
    }
    fields.push({ key: 'notes', label: 'Notas', example: '' });
    return fields;
  }, [vc]);

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    if (!user?.id) return;
    const items = entries.map(entry => {
      const customFields: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(entry)) {
        if (k.startsWith('customFields.')) customFields[k.replace('customFields.', '')] = v;
      }
      return {
        ...entry,
        vertical: businessType,
        module: 'catalog' as const,
        unitPrice: Number(entry.unitPrice) || 0,
        costPrice: Number(entry.costPrice) || 0,
        stockQuantity: Number(entry.stockQuantity) || 0,
        minStock: Number(entry.minStock) || 0,
        active: true, webVisible: true, available: true,
        customFields,
      };
    });
    try {
      const result = await bulkCreateCatalogItemsRequest(user.id, items as any);
      if (result.created > 0) {
        toast.success(`${result.created} ${vc.itemLabel.toLowerCase()}(s) creado(s) con IA`);
        loadData();
      }
      if (result.errors > 0) {
        toast.error(`${result.errors} elemento(s) no se pudieron crear`);
      }
    } catch {
      toast.error('Error en la importación con IA');
    }
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    if (!user?.id) return;
    const unmatchedImageRefs: string[] = [];

    let matchedImages = 0;
    const zipProvided = Object.keys(imageZipMap).length > 0;
    const items = entries.reduce<Record<string, unknown>[]>((acc, entry, index) => {
      const nameValue = String(entry.name || '').trim();
      if (!nameValue) return acc;
      const resolvedImage =
        entry.image ||
        imageZipMap[normalizeMediaKey(entry.sku)] ||
        imageZipMap[normalizeMediaKey(entry.name)] ||
        undefined;
      if (resolvedImage) matchedImages += 1;
      if (zipProvided && !resolvedImage) {
        unmatchedImageRefs.push(entry.sku || entry.name || `fila ${index + 2}`);
      }

      acc.push({
        name: nameValue,
        description: entry.description || '',
        category: entry.category || '',
        unit: entry.unit || vc.units[0]?.value || 'ud',
        vertical: businessType,
        module: 'catalog' as const,
        unitPrice: Number(entry.unitPrice) || 0,
        costPrice: Number(entry.costPrice) || 0,
        stockQuantity: Number(entry.stockQuantity) || 0,
        minStock: Number(entry.minStock) || 0,
        active: true,
        webVisible: true,
        available: true,
        notes: entry.notes || '',
        sku: entry.sku || undefined,
        image: resolvedImage,
        customFields: {},
      });
      return acc;
    }, []);

    if (items.length === 0) {
      toast.error('No se importaron elementos: todos estaban repetidos por nombre o SKU.');
      return 0;
    }

    if (zipProvided && unmatchedImageRefs.length > 0) {
      const sample = unmatchedImageRefs.slice(0, 6).join(', ');
      toast.warning(`ZIP: ${unmatchedImageRefs.length} producto(s) sin imagen coincidente. Se importarán igual. Ej: ${sample}`);
    }

    let result = await bulkCreateCatalogItemsRequest(user.id, items as any);
    const suspiciousSingleCreate = items.length > 1 && result.created <= 1 && result.errors >= items.length - 1;
    if (suspiciousSingleCreate) {
      let recovered = 0;
      let recoveredErrors = 0;
      for (const item of items) {
        try {
          await createCatalogItemRequest(user.id, item as CatalogItem);
          recovered += 1;
        } catch (error) {
          recoveredErrors += 1;
          const message = error instanceof Error ? error.message : '';
          if (!message.toLowerCase().includes('ya existe')) {
            // Preserve non-duplicate failures in logs for backend diagnostics
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
      loadData();
      if (matchedImages > 0) {
        toast.success(`${matchedImages} elemento(s) importado(s) con imagen`);
      }
      if (Object.keys(imageZipMap).length > 0 && matchedImages === 0) {
        toast.warning('Se subió ZIP, pero no hubo coincidencias por SKU o nombre');
      }
    }
    if (result.errors > 0) {
      const firstError = result.errorDetails?.[0];
      toast.error(
        firstError
          ? `${result.errors} elemento(s) no se pudieron importar. Ej: ${firstError.name || 'sin nombre'} -> ${firstError.error}`
          : `${result.errors} elemento(s) no se pudieron importar`,
      );
    }
    return result.created;
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
      toast.success(`ZIP cargado: ${Object.keys(map).length} imagen(es) lista(s)`);
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
          'Ejemplo de ZIP de imagenes para Catalogo',
          '',
          '1) Nombra cada foto por SKU (recomendado) o por nombre del producto.',
          '2) Formatos soportados: .jpg, .jpeg, .png, .webp',
          '3) Usa los mismos valores que en las columnas sku o name del Excel.',
          '',
          'Ejemplo:',
          '- Excel sku: SKU-001 => archivo: SKU-001.png',
        ].join('\n'),
      );
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'ejemplo_zip_catalogo.zip';
      link.click();
      URL.revokeObjectURL(url);
      toast.success('ZIP de ejemplo descargado');
    } catch {
      toast.error('No se pudo generar el ZIP de ejemplo');
    }
  }, []);

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    try {
      const promises: Promise<any>[] = [
        listCatalogItemsRequest(user.id, 'catalog'),
      ];
      if (businessId) {
        promises.push(listBrandsRequest(businessId));
      }
      const [items, brs] = await Promise.all(promises);
      const lineBrands = Array.isArray(brs) ? brs : [];
      const scoped = businessId
        ? dedupeCatalogItemsForDisplay(
            filterCatalogItemsForBusinessScope(items, businessId, lineBrands, {
              accountBusinessCount,
              activeBusinessType: currentBusiness?.businessType,
            }),
            businessId,
          )
        : [];
      setCatalogItems(scoped);
      if (lineBrands.length > 0) setBrands(lineBrands);
    } catch {
      toast.error('Error al cargar los datos del catálogo');
    } finally {
      setLoading(false);
    }
  }, [user?.id, businessId, accountBusinessCount, currentBusiness?.businessType]);

  const handleCreateBrand = useCallback(async (name: string): Promise<Brand> => {
    if (!currentBusiness?.business_id) throw new Error('Sin empresa');
    const brand = await createBrandRequest(currentBusiness.business_id, { name, active: true });
    setBrands(prev => [...prev, brand].sort((a, b) => a.name.localeCompare(b.name, 'es')));
    toast.success(`Marca "${brand.name}" creada`);
    return brand;
  }, [currentBusiness?.business_id]);

  useEffect(() => { loadData(); }, [loadData]);

  /**
   * Dispara una notificación "Stock bajo" cuando un artículo cruza el umbral
   * de stock mínimo. Sólo notifica en la transición (antes >, ahora <=) o en
   * creaciones que nacen ya bajo mínimo. Así evitamos spam si el usuario edita
   * un artículo que ya estaba en stock bajo.
   */
  const maybeNotifyLowStock = (previous: CatalogItem | null, next: CatalogItem) => {
    const min = Number((next as any).minStock ?? 0);
    const current = Number((next as any).stockQuantity ?? 0);
    if (!Number.isFinite(min) || min <= 0) return;
    if (!Number.isFinite(current)) return;
    const wasLow = previous
      ? Number((previous as any).stockQuantity ?? 0) <= Number((previous as any).minStock ?? 0)
      : false;
    const isLow = current <= min;
    if (!isLow) return;
    if (previous && wasLow) return;
    void createNotification({
      level: 'warning',
      category: 'inventory',
      title: 'Stock bajo',
      message: `${next.name} está a ${current} ${next.unit || 'ud'} (mínimo ${min}). Considera reponer.`,
      entityId: next._id,
      entityType: 'catalog_item',
      route: '/saas/catalog',
      metadata: { stockQuantity: current, minStock: min, sku: next.sku },
    }).catch((error) => { console.error('Error creating low-stock notification:', error); });
  };

  const handleCreateItem = async (data: Partial<CatalogItem>) => {
    if (!user?.id) {
      toast.error('Sesión no válida. Recarga la página e inicia sesión de nuevo.');
      return;
    }
    try {
      const incomingNameKey = normalizeDuplicateValue(data.name);
      const incomingSkuKey = normalizeDuplicateValue(data.sku);
      const duplicatedItem = catalogItems.find(item => {
        if (editingItem && item._id === editingItem._id) return false;
        const sameName = !!incomingNameKey && normalizeDuplicateValue(item.name) === incomingNameKey;
        const sameSku = !!incomingSkuKey && normalizeDuplicateValue(item.sku) === incomingSkuKey;
        return sameName || sameSku;
      });
      if (duplicatedItem) {
        const duplicatedField =
          incomingSkuKey && normalizeDuplicateValue(duplicatedItem.sku) === incomingSkuKey
            ? 'SKU'
            : 'nombre';
        toast.error(`Ya existe un artículo con ese ${duplicatedField}.`);
        return;
      }

      if (editingItem) {
        const updated = await updateCatalogItemRequest(user.id, { ...editingItem, ...data } as CatalogItem);
        setCatalogItems(prev => prev.map(i => i._id === updated._id ? updated : i));
        toast.success('Elemento actualizado');
        maybeNotifyLowStock(editingItem as CatalogItem, updated);
      } else {
        const created = await createCatalogItemRequest(user.id, { ...data, module: 'catalog' } as any);
        setCatalogItems(prev => [created, ...prev]);
        toast.success('Elemento creado');
        maybeNotifyLowStock(null, created);
      }
      setShowCreateItem(false);
      setEditingItem(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar');
    }
  };

  const handleDeleteItem = (item: CatalogItem) => {
    if (!user?.id) return;
    setCatalogDeleteGuardItem(item);
  };

  const executeCatalogDeleteAfterGuard = useCallback(async () => {
    const item = catalogDeleteItemRef.current;
    setCatalogDeleteGuardItem(null);
    if (!user?.id || !item) return;
    try {
      await deleteCatalogItemRequest(user.id, item._id);
      setCatalogItems((prev) => prev.filter((i) => i._id !== item._id));
      toast.success('Elemento eliminado');
    } catch {
      toast.error('Error al eliminar');
    }
  }, [user?.id]);

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
      toast.error('Error al actualizar');
    }
  };

  const categories = useMemo(() => [...new Set(catalogItems.map(i => i.category).filter(Boolean))].sort(), [catalogItems]);
  const duplicateMetaById = useMemo(() => {
    const repeatedNameIds = new Set<string>();
    const repeatedSkuIds = new Set<string>();
    const names = new Map<string, string[]>();
    const skus = new Map<string, string[]>();

    for (const item of catalogItems) {
      const nameKey = normalizeDuplicateValue(item.name);
      if (nameKey) names.set(nameKey, [...(names.get(nameKey) || []), item._id]);
      const skuKey = normalizeDuplicateValue(item.sku);
      if (skuKey) skus.set(skuKey, [...(skus.get(skuKey) || []), item._id]);
    }

    names.forEach(ids => { if (ids.length > 1) ids.forEach(id => repeatedNameIds.add(id)); });
    skus.forEach(ids => { if (ids.length > 1) ids.forEach(id => repeatedSkuIds.add(id)); });

    const meta: Record<string, { name: boolean; sku: boolean }> = {};
    for (const item of catalogItems) {
      meta[item._id] = { name: repeatedNameIds.has(item._id), sku: repeatedSkuIds.has(item._id) };
    }
    return meta;
  }, [catalogItems]);
  const filteredCatalog = useMemo(() => {
    return catalogItems.filter(item => {
      if (filterCategory !== 'all' && item.category !== filterCategory) return false;
      if (filterType !== 'all' && (item.itemType || 'product') !== filterType) return false;
      if (searchCatalog) {
        const q = searchCatalog.toLowerCase();
        return item.name.toLowerCase().includes(q) || item.sku?.toLowerCase().includes(q) || item.category?.toLowerCase().includes(q) || item.description?.toLowerCase().includes(q);
      }
      return true;
    });
  }, [catalogItems, searchCatalog, filterCategory, filterType]);

  const kpis = useMemo(() => ({
    totalItems: catalogItems.length,
    products: catalogItems.filter(i => (i.itemType || 'product') === 'product').length,
    services: catalogItems.filter(i => i.itemType === 'service').length,
    combos: catalogItems.filter(i => i.itemType === 'combo').length,
    categories: new Set(catalogItems.map(i => i.category).filter(Boolean)).size,
  }), [catalogItems]);

  const typeLabel = (t?: string) => {
    if (t === 'service') return 'Servicio';
    if (t === 'combo') return 'Combo';
    return 'Producto';
  };
  const typeBadgeClass = (t?: string) => {
    if (t === 'service') return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300';
    if (t === 'combo') return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
    return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
  };

  return (
    <Layout title="Catálogo" subtitle="Gestión de catálogo">
      <div className="space-y-6">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => navigate('/saas/articles')} className="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex items-center gap-1.5">
            <Boxes className="w-3.5 h-3.5" /> Artículos / Stock <ExternalLink className="w-3 h-3" />
          </button>
          <button onClick={() => navigate('/saas/suppliers')} className="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex items-center gap-1.5">
            <Factory className="w-3.5 h-3.5" /> Proveedores <ExternalLink className="w-3 h-3" />
          </button>
          <button onClick={() => navigate('/saas/suppliers/ordenes-compra')} className="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex items-center gap-1.5">
            <ShoppingBag className="w-3.5 h-3.5" /> Pedidos <ExternalLink className="w-3 h-3" />
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
              <input className="pl-8 pr-3 py-1.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-xs focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-44" placeholder="Buscar artículo..." value={searchCatalog} onChange={e => setSearchCatalog(e.target.value)} />
            </div>
            <select className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-gray-900 outline-none" value={filterType} onChange={e => setFilterType(e.target.value as any)}>
              <option value="all">Todos los tipos</option>
              <option value="product">Productos</option>
              <option value="service">Servicios</option>
              <option value="combo">Combos</option>
            </select>
            <select className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-gray-900 outline-none" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
              <option value="all">Todas las categorías</option>
              {categories.map(cat => (<option key={cat} value={cat}>{cat}</option>))}
            </select>
          </div>
          <AddButtonDropdown
            label="Nuevo elemento"
            onQuickAdd={() => { setEditingItem(null); setShowCreateItem(true); }}
            onAIAdd={() => setShowAIModal(true)}
            onImport={() => setShowImportModal(true)}
            quickAddLabel="Alta manual"
            quickAddDesc="Producto, Servicio o Combo"
          />
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-xl">
            <div className="text-blue-600 mb-2"><ShoppingCart className="w-5 h-5" /></div>
            <div className="text-2xl font-bold text-blue-900 dark:text-blue-200">{kpis.products}</div>
            <div className="text-xs text-blue-700 dark:text-blue-400 mt-0.5">Productos</div>
          </div>
          <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border-2 border-purple-200 dark:border-purple-800 rounded-xl">
            <div className="text-purple-600 mb-2"><Wrench className="w-5 h-5" /></div>
            <div className="text-2xl font-bold text-purple-900 dark:text-purple-200">{kpis.services}</div>
            <div className="text-xs text-purple-700 dark:text-purple-400 mt-0.5">Servicios</div>
          </div>
          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-800 rounded-xl">
            <div className="text-amber-600 mb-2"><LayoutGrid className="w-5 h-5" /></div>
            <div className="text-2xl font-bold text-amber-900 dark:text-amber-200">{kpis.combos}</div>
            <div className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">Combos</div>
          </div>
          <div className="p-4 bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800 rounded-xl">
            <div className="text-green-600 mb-2"><Layers className="w-5 h-5" /></div>
            <div className="text-2xl font-bold text-green-900 dark:text-green-200">{kpis.categories}</div>
            <div className="text-xs text-green-700 dark:text-green-400 mt-0.5">Categorías</div>
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
            <p className="font-semibold">No hay elementos en el catálogo</p>
            <p className="text-sm mt-1">Añade un producto, servicio o combo para empezar</p>
            <button onClick={() => { setEditingItem(null); setShowCreateItem(true); }} className="mt-4 px-4 py-2 bg-gray-900 dark:bg-gray-100 dark:text-gray-900 text-white rounded-xl text-sm font-medium">+ Nuevo elemento</button>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
            {/* Móvil: tarjetas de artículo */}
            <ul className="md:hidden divide-y divide-gray-100 dark:divide-gray-800">
              {filteredCatalog.map(item => (
                <li key={item._id} className="px-3 py-2.5">
                  <div className="flex items-start gap-2.5">
                    {(item.image || item.images?.[0]) ? (
                      <img src={item.image || item.images[0]} alt="" className="w-11 h-11 rounded-lg object-cover shrink-0" />
                    ) : (
                      <div className="w-11 h-11 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0">
                        {item.itemType === 'service' ? <Wrench className="w-4 h-4 text-gray-400" /> : item.itemType === 'combo' ? <LayoutGrid className="w-4 h-4 text-gray-400" /> : <Package className="w-4 h-4 text-gray-400" />}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">{item.name}</p>
                        <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full shrink-0 ${typeBadgeClass(item.itemType)}`}>
                          {typeLabel(item.itemType)}
                        </span>
                        {(duplicateMetaById[item._id]?.name || duplicateMetaById[item._id]?.sku) && (
                          <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 shrink-0">
                            Duplicado
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                        {[item.category, `IVA ${item.taxRate ?? 21}%`].filter(Boolean).join(' · ')}
                      </p>
                      <p className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-0.5 tabular-nums">
                        {item.unitPrice.toFixed(2)}€
                        {item.costPrice > 0 && (
                          <span className="ml-1.5 text-xs font-normal text-gray-400">Coste: {item.costPrice.toFixed(2)}€</span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center shrink-0">
                      <button onClick={() => { setEditingItem(item); setShowCreateItem(true); }} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors" title="Editar"><Edit3 className="w-4 h-4 text-gray-600 dark:text-gray-400" /></button>
                      <button onClick={() => handleDeleteItem(item)} className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors" title="Eliminar"><Trash2 className="w-4 h-4 text-red-500" /></button>
                    </div>
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5 pl-[54px]">
                    <button onClick={() => handleToggleField(item, 'available')}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded-full border transition-colors ${item.available ? 'bg-green-100 text-green-700 border-green-200' : 'bg-red-100 text-red-700 border-red-200'}`}>
                      {item.available ? 'Disponible' : 'No disponible'}
                    </button>
                    <button onClick={() => handleToggleField(item, 'active')}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded-full border transition-colors ${item.active ? 'bg-green-100 text-green-700 border-green-200' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700'}`}>
                      {item.active ? 'Activo' : 'Inactivo'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {/* Desktop: tabla completa */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Nombre</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Tipo</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Categoría</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">PVP</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">IVA</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Disp.</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Estado</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {filteredCatalog.map(item => (
                    <tr key={item._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {(item.image || item.images?.[0]) ? (
                            <img src={item.image || item.images[0]} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0">
                              {item.itemType === 'service' ? <Wrench className="w-4 h-4 text-gray-400" /> : item.itemType === 'combo' ? <LayoutGrid className="w-4 h-4 text-gray-400" /> : <Package className="w-4 h-4 text-gray-400" />}
                            </div>
                          )}
                          <div>
                            <div className="flex items-center gap-2">
                              <div className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{item.name}</div>
                              {(duplicateMetaById[item._id]?.name || duplicateMetaById[item._id]?.sku) && (
                                <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                                  Duplicado
                                </span>
                              )}
                            </div>
                            {item.description && <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate max-w-xs">{item.description}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${typeBadgeClass(item.itemType)}`}>
                          {typeLabel(item.itemType)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {item.category ? <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-medium rounded-lg">{item.category}</span> : <span className="text-gray-400 text-sm">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-bold text-gray-900 dark:text-gray-100">{item.unitPrice.toFixed(2)}€</div>
                        {item.costPrice > 0 && <div className="text-xs text-gray-500 dark:text-gray-400">Coste: {item.costPrice.toFixed(2)}€</div>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-700 dark:text-gray-300">{item.taxRate ?? 21}%</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => handleToggleField(item, 'available')}
                          className={`px-2.5 py-1 text-xs font-semibold rounded-full border transition-colors ${item.available ? 'bg-green-100 text-green-700 border-green-200 hover:bg-green-200' : 'bg-red-100 text-red-700 border-red-200 hover:bg-red-200'}`}>
                          {item.available ? 'Sí' : 'No'}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => handleToggleField(item, 'active')}
                          className={`px-2 py-1 text-xs font-semibold rounded-full border cursor-pointer transition-colors ${item.active ? 'bg-green-100 text-green-700 border-green-200 hover:bg-green-200' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-200'}`}>
                          {item.active ? 'Activo' : 'Inactivo'}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => { setEditingItem(item); setShowCreateItem(true); }} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors" title="Editar"><Edit3 className="w-4 h-4 text-gray-600 dark:text-gray-400" /></button>
                          <button onClick={() => handleDeleteItem(item)} className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors" title="Eliminar"><Trash2 className="w-4 h-4 text-red-500" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <CreateItemModal
        isOpen={showCreateItem}
        onClose={() => { setShowCreateItem(false); setEditingItem(null); }}
        onCreate={handleCreateItem}
        editItem={editingItem}
        verticalConfig={vc}
        businessType={businessType}
        allCatalogItems={catalogItems}
        brands={brands}
        onCreateBrand={handleCreateBrand}
        existingCategories={categories}
      />

      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="catalog"
        moduleLabel="Catálogo"
        fields={CATALOG_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />

      <CatalogDeleteGuardModal
        open={catalogDeleteGuardItem !== null}
        payload={
          catalogDeleteGuardItem
            ? { mode: 'single', itemName: catalogDeleteGuardItem.name }
            : null
        }
        onClose={() => setCatalogDeleteGuardItem(null)}
        onVerified={() => {
          void executeCatalogDeleteAfterGuard();
        }}
      />

      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Catálogo"
        importLabel="Catálogo"
        templateFileName="plantilla_catalogo.csv"
        fields={CATALOG_IMPORT_FIELDS}
        onImport={handleImportEntries}
        extraFileUpload={{
          accept: '.zip,application/zip',
          label: 'ZIP de imágenes (opcional)',
          helpText: loadingImageZip
            ? 'Procesando ZIP...'
            : Object.keys(imageZipMap).length > 0
              ? `${Object.keys(imageZipMap).length} imagen(es) detectada(s) en ZIP`
              : 'Sube un ZIP con imágenes nombradas por SKU o nombre del producto (si falta match se bloquea la importación)',
          loading: loadingImageZip,
          countLabel: Object.keys(imageZipMap).length > 0
            ? `${Object.keys(imageZipMap).length} imagen(es) preparadas para mapear`
            : '',
          sampleZipLabel: 'Descargar ZIP ejemplo',
          onDownloadSampleZip: handleDownloadSampleZip,
          onFileSelected: handleZipFileSelected,
        }}
      />
    </Layout>
  );
}
