import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useModalClose } from '../../hooks/useModalClose';
import { useAuth } from '../../context/AuthContext';
import {
  listSuppliersRequest,
  createSupplierRequest,
  updateSupplierRequest,
  deleteSupplierRequest,
  listCatalogItemsRequest,
  listPurchaseInvoicesRequest,
  getDeliveryConfigRequest,
  type Supplier,
  type CatalogItem,
  type PurchaseInvoice,
} from '../../lib/deliveryApi';
import {
  listPurchaseOrdersRequest,
  type PurchaseOrder,
} from '../../lib/purchaseOrderApi';
import {
  Plus,
  Search,
  X,
  Trash2,
  Edit3,
  Factory,
  CheckCircle2,
  Users,
  BookOpen,
  Boxes,
  ExternalLink,
  Phone,
  Mail,
  MapPin,
  Package,
  FileText,
  DollarSign,
  AlertTriangle,
  Shield,
  ShieldAlert,
  TrendingUp,
  ClipboardList,
  Receipt,
  Filter,
  CreditCard,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';
import { SUPPLIERS_HUB } from '../../lib/suppliersHubPaths';
import { SupplierPaymentTermsField } from '../../components/saas/SupplierPaymentTermsField';
import {
  initialSupplierCatalogItemIds,
  initialSupplierItemCosts,
  initialSupplierOrganizerIds,
  parseSupplierItemCosts,
  resolveSupplierOrganizerIdsForSave,
  labelsForSupplierOrganizerIds,
  supplierFormInitFingerprint,
  SupplierOrganizersField,
} from '../../components/saas/SupplierOrganizersField';
import { syncSupplierCatalogItemLinks, resolveSupplierSelectedStockIds } from '../../lib/supplierCatalogLinks';
import { explicitMarkedStockItemsForSupplier } from '../../lib/purchaseSuggestions';
import { commercialLineBrands } from '../../lib/deliveryCatalogImportLogic';
import { unifyStoreIngredientsFromConfig } from '../../lib/catalogCustomization';
import {
  normalizeSupplierCode,
  sanitizeSupplierCodeInput,
  suggestNextSupplierCode,
  suggestSupplierCodeFromName,
  supplierCodeAlreadyUsed,
  SUPPLIER_CODE_MAX_LEN,
} from '../../lib/supplierCode';
import type { StoreIngredient } from '../../lib/catalogCustomization';
import { useBusinessOptional } from '../../context/BusinessContext';
import { listBrandsRequest, type Brand } from '../../lib/brandsApi';
import { resolveBusinessScopeId } from '../../lib/deliverySetup';
import { resolveBusinessDataUserId } from '../../lib/tenantUserId';
import { filterPurchaseDocsByBusinessScope } from '../../lib/purchaseBusinessScope';

interface CreateSupplierModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: Partial<Supplier> & { catalogItemCosts?: Record<string, number> }) => Promise<void>;
  editItem?: Supplier | null;
  editHydrating?: boolean;
  brands?: Brand[];
  catalogItems?: CatalogItem[];
  storeIngredients?: StoreIngredient[];
  existingSuppliers?: Supplier[];
}

function CreateSupplierModal({
  isOpen,
  onClose,
  onCreate,
  editItem,
  editHydrating = false,
  brands = [],
  catalogItems = [],
  storeIngredients = [],
  existingSuppliers = [],
}: CreateSupplierModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [formInitReady, setFormInitReady] = useState(false);
  const [organizersFieldKey, setOrganizersFieldKey] = useState(0);
  const [codeManual, setCodeManual] = useState(false);
  const [form, setForm] = useState({
    name: '', code: '', cif: '', email: '', phone: '', address: '',
    contactPerson: '', category: '', paymentTerms: '', notes: '',
    organizerIds: [] as string[],
    catalogItemIds: [] as string[],
    itemCosts: {} as Record<string, string>,
  });
  const supplierFormSessionRef = useRef<{ fingerprint: string } | null>(null);
  const organizersTouchedRef = useRef(false);
  const formRef = useRef(form);
  const editItemRef = useRef(editItem);
  const catalogItemsRef = useRef(catalogItems);
  const brandsRef = useRef(brands);
  const storeIngredientsRef = useRef(storeIngredients);
  editItemRef.current = editItem;
  catalogItemsRef.current = catalogItems;
  brandsRef.current = brands;
  storeIngredientsRef.current = storeIngredients;

  const applyForm = (next: typeof form | ((prev: typeof form) => typeof form)) => {
    setForm((prev) => {
      const merged = typeof next === 'function' ? next(prev) : next;
      formRef.current = merged;
      return merged;
    });
  };
  formRef.current = form;

  const editSnapshot = supplierFormInitFingerprint(editItem, catalogItems.length);

  useEffect(() => {
    if (!isOpen) {
      supplierFormSessionRef.current = null;
      organizersTouchedRef.current = false;
      setFormInitReady(false);
      return;
    }
    if (editItem && (editHydrating || catalogItems.length === 0)) {
      setFormInitReady(false);
      return;
    }

    const edit = editItemRef.current;
    const items = catalogItemsRef.current;
    const fingerprint = supplierFormInitFingerprint(edit, items.length);
    if (organizersTouchedRef.current && supplierFormSessionRef.current?.fingerprint === fingerprint) {
      setFormInitReady(true);
      return;
    }
    if (supplierFormSessionRef.current?.fingerprint === fingerprint) {
      setFormInitReady(true);
      return;
    }

    supplierFormSessionRef.current = { fingerprint };

    setCodeManual(Boolean(edit?.code));
    if (edit) {
      const catalogItemIds = initialSupplierCatalogItemIds(edit, items);
      const nextForm = {
        name: edit.name, code: edit.code || '', cif: edit.cif || '', email: edit.email || '',
        phone: edit.phone || '', address: edit.address || '',
        contactPerson: edit.contactPerson || '', category: edit.category || '',
        paymentTerms: edit.paymentTerms || '', notes: edit.notes || '',
        organizerIds: initialSupplierOrganizerIds(
          edit,
          items,
          storeIngredientsRef.current,
          brandsRef.current,
        ),
        catalogItemIds,
        itemCosts: initialSupplierItemCosts(catalogItemIds, items),
      };
      formRef.current = nextForm;
      setForm(nextForm);
    } else {
      const nextForm = {
        name: '', code: suggestNextSupplierCode(existingSuppliers), cif: '', email: '', phone: '', address: '', contactPerson: '',
        category: '', paymentTerms: '', notes: '', organizerIds: [] as string[], catalogItemIds: [] as string[],
        itemCosts: {} as Record<string, string>,
      };
      formRef.current = nextForm;
      setForm(nextForm);
    }
    setOrganizersFieldKey((k) => k + 1);
    setFormInitReady(true);
  }, [isOpen, editSnapshot, editHydrating, catalogItems.length, existingSuppliers]);
  useModalClose(isOpen, onClose);

  const handleNameChange = (name: string) => {
    setForm((f) => ({
      ...f,
      name,
      code: codeManual
        ? f.code
        : suggestSupplierCodeFromName(name, existingSuppliers, editItem?._id),
    }));
  };

  const handleCodeChange = (raw: string) => {
    setCodeManual(true);
    setForm((f) => ({ ...f, code: sanitizeSupplierCodeInput(raw) }));
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const current = formRef.current;
    if (!current.name.trim()) { toast.error('El nombre es obligatorio'); return; }
    const code = normalizeSupplierCode(current.code);
    if (!code) { toast.error('El código del proveedor es obligatorio'); return; }
    if (supplierCodeAlreadyUsed(code, existingSuppliers, editItem?._id)) {
      toast.error(`Ya existe un proveedor con el código ${code}`);
      return;
    }
    const priorOrganizers = (editItem?.organizerIds || []).filter(Boolean).length;
    if (
      editItem &&
      priorOrganizers > 0 &&
      current.organizerIds.length === 0 &&
      !organizersTouchedRef.current
    ) {
      toast.error('Las categorías no se cargaron bien. Cierra y vuelve a abrir el proveedor.');
      return;
    }
    setSubmitting(true);
    try {
      const organizerIds = resolveSupplierOrganizerIdsForSave(
        current.organizerIds,
        current.catalogItemIds,
        catalogItemsRef.current,
        storeIngredientsRef.current,
        brandsRef.current,
      );
      await onCreate({
        name: current.name,
        code,
        cif: current.cif,
        email: current.email,
        phone: current.phone,
        address: current.address,
        contactPerson: current.contactPerson,
        category: current.category,
        paymentTerms: current.paymentTerms,
        notes: current.notes,
        organizerIds,
        catalogItemIds: current.catalogItemIds,
        catalogItemCosts: parseSupplierItemCosts(current.itemCosts),
        active: editItem?.active ?? true,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = 'w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100';
  const labelClass = 'block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{editItem ? 'Editar proveedor' : 'Nuevo proveedor'}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{editItem ? 'Modifica los datos del proveedor' : 'Registra un nuevo proveedor'}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"><X className="w-5 h-5 text-gray-500 dark:text-gray-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Nombre *</label>
              <input className={inputClass} placeholder="Nombre del proveedor" value={form.name} onChange={(e) => handleNameChange(e.target.value)} autoFocus={!editItem} />
            </div>
            <div>
              <label className={labelClass}>Código *</label>
              <input className={`${inputClass} font-mono uppercase`} placeholder="MAK-001" maxLength={SUPPLIER_CODE_MAX_LEN} value={form.code} onChange={(e) => handleCodeChange(e.target.value)} />
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                Se rellena solo con el nombre (ej. Makro → MAK-001). Puedes editarlo. Máx. {SUPPLIER_CODE_MAX_LEN} caracteres: A–Z, 0–9 y guión.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={labelClass}>CIF/NIF</label><input className={`${inputClass} font-mono uppercase`} placeholder="B12345678" value={form.cif} onChange={e => setForm(f => ({ ...f, cif: e.target.value.toUpperCase() }))} /></div>
            <div><label className={labelClass}>Email</label><input type="email" className={inputClass} placeholder="proveedor@email.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={labelClass}>Teléfono</label><input className={inputClass} placeholder="600 000 000" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
            <div>
              <label className={labelClass}>Persona de contacto</label>
              <input className={inputClass} placeholder="Nombre del contacto" value={form.contactPerson} onChange={e => setForm(f => ({ ...f, contactPerson: e.target.value }))} />
            </div>
          </div>
          <div><label className={labelClass}>Dirección</label><input className={inputClass} placeholder="Dirección del proveedor" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
          {formInitReady ? (
            <SupplierOrganizersField
              key={`supplier-organizers-${organizersFieldKey}`}
              organizerIds={form.organizerIds}
              catalogItemIds={form.catalogItemIds}
              itemCosts={form.itemCosts}
              onChange={({ organizerIds, catalogItemIds, itemCosts }) => {
                organizersTouchedRef.current = true;
                applyForm((f) => ({ ...f, organizerIds, catalogItemIds, itemCosts }));
              }}
              brands={brands}
              catalogItems={catalogItems}
              storeIngredients={storeIngredients}
              labelClassName={labelClass}
              businessType={businessCtx?.currentBusiness?.businessType}
            />
          ) : (
            <div className="rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              {editItem && (editHydrating || catalogItems.length === 0)
                ? 'Cargando categorías y productos del proveedor…'
                : 'Preparando el formulario…'}
            </div>
          )}
          <SupplierPaymentTermsField
            value={form.paymentTerms}
            onChange={(paymentTerms) => setForm((f) => ({ ...f, paymentTerms }))}
            labelClassName={labelClass}
            inputClassName={inputClass}
          />
          <div><label className={labelClass}>Notas</label><textarea rows={2} className={`${inputClass} resize-none`} placeholder="Notas adicionales..." value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
          <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 -mx-6 px-6 -mb-6 pb-6 pt-4 flex gap-3 rounded-b-2xl">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancelar</button>
            <button type="submit" disabled={submitting} className="flex-1 px-4 py-3 bg-gray-900 hover:bg-black dark:bg-gray-100 dark:hover:bg-white dark:text-gray-900 text-white rounded-xl font-semibold transition-colors disabled:opacity-60 disabled:cursor-wait">{submitting ? 'Guardando…' : editItem ? 'Guardar cambios' : 'Crear proveedor'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function isOverdueInvoice(inv: PurchaseInvoice): boolean {
  return inv.status === 'pending' && !!inv.dueDate && new Date(inv.dueDate) < new Date();
}

function isHabitual(supplierId: string, orders: PurchaseOrder[], invoices: PurchaseInvoice[]): boolean {
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const count = orders.filter(o => o.supplierId === supplierId && new Date(o.createdAt) >= threeMonthsAgo).length
    + invoices.filter(i => i.supplierId === supplierId && new Date(i.createdAt) >= threeMonthsAgo).length;
  return count >= 3;
}

type QuickFilter = 'all' | 'unvalidated' | 'overdue' | 'habitual' | 'inactive';

export function SuppliersPage() {
  const { user } = useAuth();
  const businessCtx = useBusinessOptional();
  const businessId = resolveBusinessScopeId(businessCtx?.currentBusiness);
  const accountBusinessCount = businessCtx?.businesses?.length ?? 1;
  const dataUserId = resolveBusinessDataUserId(user, businessCtx?.currentBusiness);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [storeIngredients, setStoreIngredients] = useState<StoreIngredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateSupplier, setShowCreateSupplier] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [supplierModalHydrating, setSupplierModalHydrating] = useState(false);
  const [searchSupplier, setSearchSupplier] = useState('');
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const inventoryCommercialBrands = useMemo(() => commercialLineBrands(brands), [brands]);

  const openSupplierEditor = useCallback(
    async (supplier: Supplier | null) => {
      setEditingSupplier(supplier);
      setShowCreateSupplier(true);
      if (!supplier?._id || !dataUserId) {
        setSupplierModalHydrating(false);
        return;
      }
      setSupplierModalHydrating(true);
      try {
        const freshSuppliers = await listSuppliersRequest(dataUserId);
        setSuppliers(freshSuppliers);
        const fresh = freshSuppliers.find((s) => s._id === supplier._id);
        if (fresh) setEditingSupplier(fresh);
      } catch {
        /* se usa el proveedor de la lista local */
      } finally {
        setSupplierModalHydrating(false);
      }
    },
    [dataUserId],
  );

  const SUPPLIER_AI_FIELDS: AIFieldDef[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'cif', label: 'CIF/NIF' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Teléfono' },
    { key: 'address', label: 'Dirección' },
    { key: 'contactPerson', label: 'Persona de contacto' },
    { key: 'category', label: 'Categoría' },
    { key: 'paymentTerms', label: 'Condiciones de pago' },
    { key: 'notes', label: 'Notas' },
  ];

  const SUPPLIER_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: 'Proveedor SL' },
    { key: 'cif', label: 'CIF/NIF', example: 'B12345678' },
    { key: 'email', label: 'Email', example: 'info@proveedor.com' },
    { key: 'phone', label: 'Teléfono', example: '600123456' },
    { key: 'address', label: 'Dirección', example: 'Calle Mayor 5, Madrid' },
    { key: 'contactPerson', label: 'Persona contacto', example: 'Juan García' },
    { key: 'category', label: 'Categoría', example: 'Alimentación' },
    { key: 'paymentTerms', label: 'Condiciones pago', example: '30 días' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    if (!dataUserId) return;
    let created = 0;
    for (const entry of entries) {
      try {
        const sup = await createSupplierRequest(dataUserId, { ...entry, active: true } as any);
        setSuppliers(prev => [sup, ...prev.filter((s) => s._id !== sup._id)]);
        created++;
      } catch { /* skip */ }
    }
    toast.success(`${created} proveedor(es) creado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    if (!dataUserId) return;
    let created = 0;
    for (const entry of entries) {
      try {
        const sup = await createSupplierRequest(dataUserId, { ...entry, active: true } as any);
        setSuppliers(prev => [sup, ...prev.filter((s) => s._id !== sup._id)]);
        created++;
      } catch { /* skip */ }
    }
    toast.success(`${created} proveedor(es) importado(s)`);
  };

  const loadData = useCallback(async () => {
    if (!dataUserId) return;
    setLoading(true);
    try {
      const sups = await listSuppliersRequest(dataUserId);
      setSuppliers(sups);
    } catch {
      toast.error('Error al cargar proveedores');
      setLoading(false);
      return;
    }
    setLoading(false);

    void (async () => {
      try {
        const [items, invs, ords] = await Promise.all([
          listCatalogItemsRequest(dataUserId, 'stock'),
          listPurchaseInvoicesRequest(dataUserId, {
            businessId: businessId || undefined,
            accountBusinessCount,
          }),
          listPurchaseOrdersRequest(dataUserId, {
            businessId: businessId || undefined,
            accountBusinessCount,
          }),
        ]);
        setCatalogItems(items);
        setInvoices(filterPurchaseDocsByBusinessScope(invs, businessId, accountBusinessCount));
        setOrders(filterPurchaseDocsByBusinessScope(ords, businessId, accountBusinessCount));
        let loadedBrands: Brand[] = [];
        if (businessId) {
          try {
            loadedBrands = await listBrandsRequest(businessId);
            setBrands(loadedBrands);
          } catch {
            loadedBrands = [];
            setBrands([]);
          }
        } else {
          setBrands([]);
        }
        try {
          const config = await getDeliveryConfigRequest(dataUserId);
          const brandIds = commercialLineBrands(loadedBrands).map((b) => b._id);
          setStoreIngredients(unifyStoreIngredientsFromConfig(config, brandIds));
        } catch {
          setStoreIngredients([]);
        }
      } catch {
        /* KPIs secundarios: la lista de proveedores ya está visible */
      }
    })();
  }, [businessId, accountBusinessCount, dataUserId]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const editId = searchParams.get('edit');
    if (!editId || suppliers.length === 0) return;
    const found = suppliers.find(s => s._id === editId);
    if (!found) return;
    void openSupplierEditor(found);
    // Quitar ?edit= al abrir: si queda, cada alta reabre el mismo proveedor.
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('edit');
      return next;
    }, { replace: true });
  }, [searchParams, suppliers, setSearchParams, openSupplierEditor]);

  useEffect(() => {
    const action = searchParams.get('action');
    if (!action) return;
    if (action === 'new') {
      void openSupplierEditor(null);
    } else if (action === 'import') setShowImportModal(true);
    else if (action === 'ai') setShowAIModal(true);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams, openSupplierEditor]);

  const handleCreateSupplier = async (data: Partial<Supplier> & { catalogItemCosts?: Record<string, number> }) => {
    if (!dataUserId) { toast.error('Sesión no válida. Recarga la página e inicia sesión de nuevo.'); return; }
    const { catalogItemCosts, ...rest } = data;
    const resolvedCatalogItemIds = resolveSupplierSelectedStockIds(
      rest.catalogItemIds || [],
      catalogItems,
      storeIngredients,
    );
    const resolvedCosts: Record<string, number> = {};
    for (const [rawId, cost] of Object.entries(catalogItemCosts || {})) {
      const mapped = resolveSupplierSelectedStockIds([rawId], catalogItems, storeIngredients)[0];
      if (mapped) resolvedCosts[mapped] = cost;
    }
    const organizerIds = [
      ...new Set(
        (Array.isArray(rest.organizerIds) ? rest.organizerIds : [])
          .map((id) => String(id || '').trim())
          .filter(Boolean),
      ),
    ];
    const supplierData = {
      ...rest,
      organizerIds,
      catalogItemIds: resolvedCatalogItemIds,
    };
    try {
      if (editingSupplier) {
        const updated = await updateSupplierRequest(dataUserId, {
          ...editingSupplier,
          ...supplierData,
          organizerIds,
          catalogItemIds: resolvedCatalogItemIds,
        } as Supplier);
        const linked = await syncSupplierCatalogItemLinks(
          dataUserId,
          updated,
          supplierData.catalogItemIds || [],
          catalogItems,
          resolvedCosts,
          storeIngredients,
        );
        if (linked.length > 0) {
          const byId = new Map(linked.map((i) => [i._id, i]));
          setCatalogItems((prev) => prev.map((i) => byId.get(i._id) ?? i));
        }
        const freshSuppliers = await listSuppliersRequest(dataUserId);
        setSuppliers(freshSuppliers);
        toast.success('Proveedor actualizado');
      } else {
        const created = await createSupplierRequest(dataUserId, supplierData);
        const linked = await syncSupplierCatalogItemLinks(
          dataUserId,
          created,
          supplierData.catalogItemIds || [],
          catalogItems,
          resolvedCosts,
          storeIngredients,
        );
        if (linked.length > 0) {
          const byId = new Map(linked.map((i) => [i._id, i]));
          setCatalogItems((prev) => prev.map((i) => byId.get(i._id) ?? i));
        }
        const freshSuppliers = await listSuppliersRequest(dataUserId);
        setSuppliers(freshSuppliers);
        toast.success('Proveedor creado');
      }
      setShowCreateSupplier(false);
      setEditingSupplier(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar el proveedor');
    }
  };

  const handleDeleteSupplier = async (supplier: Supplier) => {
    if (!dataUserId) return;
    if (!confirm(`¿Eliminar "${supplier.name}"?`)) return;
    try {
      await deleteSupplierRequest(dataUserId, supplier._id);
      setSuppliers(prev => prev.filter(s => s._id !== supplier._id));
      toast.success('Proveedor eliminado');
    } catch {
      toast.error('Error al eliminar el proveedor');
    }
  };

  const handleValidate = async (supplier: Supplier, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!dataUserId) return;
    try {
      const updated = await updateSupplierRequest(dataUserId, {
        ...supplier,
        validated: true,
        validatedAt: new Date().toISOString(),
      } as Supplier);
      setSuppliers(prev => prev.map(s => s._id === updated._id ? updated : s));
      toast.success(`"${supplier.name}" validado`);
    } catch { toast.error('Error al validar'); }
  };

  const orphanInvoices = useMemo(() => invoices.filter(i => !i.supplierId), [invoices]);

  const suppliersWithOverdue = useMemo(() => {
    const map = new Map<string, number>();
    for (const inv of invoices) {
      if (isOverdueInvoice(inv) && inv.supplierId) {
        map.set(inv.supplierId, (map.get(inv.supplierId) || 0) + 1);
      }
    }
    return map;
  }, [invoices]);

  const kpis = useMemo(() => {
    const total = suppliers.length;
    const active = suppliers.filter(s => s.active).length;
    const unvalidated = suppliers.filter(s => !s.validated).length;
    const totalInvoiced = invoices.reduce((s, i) => s + (i.total || 0), 0);
    const habitualCount = suppliers.filter(s => isHabitual(s._id, orders, invoices)).length;
    const withOverdue = suppliersWithOverdue.size;
    return { total, active, unvalidated, totalInvoiced, habitualCount, withOverdue, orphanInvoices: orphanInvoices.length };
  }, [suppliers, invoices, orders, suppliersWithOverdue, orphanInvoices]);

  const filteredSuppliers = useMemo(() => {
    let list = suppliers;
    if (quickFilter === 'unvalidated') list = list.filter(s => !s.validated);
    else if (quickFilter === 'overdue') list = list.filter(s => suppliersWithOverdue.has(s._id));
    else if (quickFilter === 'habitual') list = list.filter(s => isHabitual(s._id, orders, invoices));
    else if (quickFilter === 'inactive') list = list.filter(s => !s.active);
    if (searchSupplier) {
      const q = searchSupplier.toLowerCase();
      list = list.filter(s =>
        s.name.toLowerCase().includes(q) || s.cif?.toLowerCase().includes(q) || s.category?.toLowerCase().includes(q) || s.contactPerson?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [suppliers, searchSupplier, quickFilter, suppliersWithOverdue, orders, invoices]);

  return (
    <div className="space-y-6">
        {/* Quick nav */}
        <div className="flex flex-wrap gap-2">
          <button onClick={() => navigate('/saas/catalog')} className="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5" /> Catálogo <ExternalLink className="w-3 h-3" />
          </button>
          <button onClick={() => navigate('/saas/catalog?tab=stock')} className="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex items-center gap-1.5">
            <Boxes className="w-3.5 h-3.5" /> Stock <ExternalLink className="w-3 h-3" />
          </button>
          <button onClick={() => navigate(SUPPLIERS_HUB.ordenes)} className="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex items-center gap-1.5">
            <ClipboardList className="w-3.5 h-3.5" /> Órdenes de compra
          </button>
          <button onClick={() => navigate(SUPPLIERS_HUB.facturas)} className="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex items-center gap-1.5">
            <Receipt className="w-3.5 h-3.5" /> Facturas
          </button>
          <button onClick={() => navigate('/saas/finance')} className="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex items-center gap-1.5">
            <DollarSign className="w-3.5 h-3.5" /> Finanzas <ExternalLink className="w-3 h-3" />
          </button>
        </div>

        {/* Alerts */}
        {kpis.unvalidated > 0 && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-800 rounded-xl p-4 flex items-center gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0" />
            <div className="flex-1">
              <p className="font-bold text-amber-900 dark:text-amber-300">{kpis.unvalidated} proveedor{kpis.unvalidated > 1 ? 'es' : ''} sin validar</p>
              <p className="text-sm text-amber-700 dark:text-amber-400">Revisa y valida los proveedores nuevos antes de operar con ellos.</p>
            </div>
            <button onClick={() => setQuickFilter('unvalidated')} className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded-lg transition-colors shrink-0">
              Ver sin validar
            </button>
          </div>
        )}

        {kpis.orphanInvoices > 0 && (
          <div className="bg-orange-50 dark:bg-orange-900/20 border-2 border-orange-200 dark:border-orange-800 rounded-xl p-4 flex items-center gap-3">
            <FileText className="w-5 h-5 text-orange-600 shrink-0" />
            <div className="flex-1">
              <p className="font-bold text-orange-900 dark:text-orange-300">{kpis.orphanInvoices} factura{kpis.orphanInvoices > 1 ? 's' : ''} sin proveedor asociado</p>
              <p className="text-sm text-orange-700 dark:text-orange-400">Hay facturas registradas sin vinculación a un proveedor de tu lista.</p>
            </div>
            <button onClick={() => navigate(SUPPLIERS_HUB.facturas)} className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-medium rounded-lg transition-colors shrink-0">
              Ver facturas
            </button>
          </div>
        )}

        {kpis.withOverdue > 0 && (
          <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-xl p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
            <div className="flex-1">
              <p className="font-bold text-red-900 dark:text-red-300">{kpis.withOverdue} proveedor{kpis.withOverdue > 1 ? 'es' : ''} con pagos vencidos</p>
              <p className="text-sm text-red-700 dark:text-red-400">Revisa las facturas que han superado su fecha de vencimiento.</p>
            </div>
            <button onClick={() => setQuickFilter('overdue')} className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-colors shrink-0">
              Ver proveedores
            </button>
          </div>
        )}

        {/* Filters & Actions */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
            <input className="pl-9 pr-4 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-64" placeholder="Buscar proveedor, CIF, categoría..." value={searchSupplier} onChange={e => setSearchSupplier(e.target.value)} />
          </div>
          <AddButtonDropdown
            label="Nuevo proveedor"
            onQuickAdd={() => { void openSupplierEditor(null); }}
            onAIAdd={() => setShowAIModal(true)}
            onImport={() => setShowImportModal(true)}
            quickAddLabel="Alta rápida"
            quickAddDesc="Formulario de nuevo proveedor"
          />
        </div>

        {/* Quick filters */}
        <div className="flex flex-wrap gap-2">
          {([
            { id: 'all' as QuickFilter, label: 'Todos', count: kpis.total },
            { id: 'unvalidated' as QuickFilter, label: 'Sin validar', count: kpis.unvalidated },
            { id: 'habitual' as QuickFilter, label: 'Habituales', count: kpis.habitualCount },
            { id: 'overdue' as QuickFilter, label: 'Con pagos vencidos', count: kpis.withOverdue },
            { id: 'inactive' as QuickFilter, label: 'Inactivos', count: suppliers.filter(s => !s.active).length },
          ]).map(f => (
            <button
              key={f.id}
              onClick={() => setQuickFilter(quickFilter === f.id ? 'all' : f.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors ${
                quickFilter === f.id
                  ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {f.label}
              {f.count > 0 && <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${quickFilter === f.id ? 'bg-white/20 dark:bg-gray-900/20' : 'bg-gray-200 dark:bg-gray-700'}`}>{f.count}</span>}
            </button>
          ))}
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-xl">
            <Users className="w-5 h-5 text-blue-600 mb-2" />
            <div className="text-2xl font-bold text-blue-900 dark:text-blue-200">{kpis.total}</div>
            <div className="text-xs text-blue-700 dark:text-blue-400 mt-0.5">Total proveedores</div>
          </div>
          <div className="p-4 bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800 rounded-xl">
            <CheckCircle2 className="w-5 h-5 text-green-600 mb-2" />
            <div className="text-2xl font-bold text-green-900 dark:text-green-200">{kpis.active}</div>
            <div className="text-xs text-green-700 dark:text-green-400 mt-0.5">Activos</div>
          </div>
          <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 border-2 border-indigo-200 dark:border-indigo-800 rounded-xl">
            <TrendingUp className="w-5 h-5 text-indigo-600 mb-2" />
            <div className="text-2xl font-bold text-indigo-900 dark:text-indigo-200">{kpis.habitualCount}</div>
            <div className="text-xs text-indigo-700 dark:text-indigo-400 mt-0.5">Habituales</div>
          </div>
          <button onClick={() => setQuickFilter('unvalidated')} className="p-4 bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-800 rounded-xl text-left hover:border-amber-400 transition-colors">
            <ShieldAlert className="w-5 h-5 text-amber-600 mb-2" />
            <div className="text-2xl font-bold text-amber-900 dark:text-amber-200">{kpis.unvalidated}</div>
            <div className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">Sin validar</div>
          </button>
          <button onClick={() => setQuickFilter('overdue')} className="p-4 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-xl text-left hover:border-red-400 transition-colors">
            <AlertTriangle className="w-5 h-5 text-red-600 mb-2" />
            <div className="text-2xl font-bold text-red-900 dark:text-red-200">{kpis.withOverdue}</div>
            <div className="text-xs text-red-700 dark:text-red-400 mt-0.5">Con pagos vencidos</div>
          </button>
          <button onClick={() => navigate(SUPPLIERS_HUB.facturas)} className="p-4 bg-purple-50 dark:bg-purple-900/20 border-2 border-purple-200 dark:border-purple-800 rounded-xl text-left hover:border-purple-400 transition-colors">
            <DollarSign className="w-5 h-5 text-purple-600 mb-2" />
            <div className="text-2xl font-bold text-purple-900 dark:text-purple-200">{kpis.totalInvoiced.toLocaleString('es-ES', { maximumFractionDigits: 0 })}€</div>
            <div className="text-xs text-purple-700 dark:text-purple-400 mt-0.5">Total facturado</div>
          </button>
        </div>

        {/* Supplier list */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-500 dark:text-gray-400">
            <div className="animate-spin w-6 h-6 border-2 border-gray-300 border-t-gray-900 rounded-full mr-3" />
            Cargando proveedores...
          </div>
        ) : filteredSuppliers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
            <Factory className="w-12 h-12 text-gray-300 mb-3" />
            <p className="font-semibold">{quickFilter !== 'all' ? 'Sin resultados para este filtro' : 'Sin proveedores registrados'}</p>
            <p className="text-sm mt-1">{quickFilter !== 'all' ? 'Cambia el filtro o la búsqueda' : 'Añade el primer proveedor'}</p>
            {quickFilter === 'all' && (
              <button onClick={() => { void openSupplierEditor(null); }} className="mt-4 px-4 py-2 bg-gray-900 dark:bg-gray-100 dark:text-gray-900 text-white rounded-xl text-sm font-medium">+ Nuevo proveedor</button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredSuppliers.map(supplier => {
              const productCount = explicitMarkedStockItemsForSupplier(
                catalogItems,
                supplier,
                storeIngredients,
                inventoryCommercialBrands,
              ).length;
              const invoiceCount = invoices.filter(i => i.supplierId === supplier._id).length;
              const orderCount = orders.filter(o => o.supplierId === supplier._id).length;
              const overdueCount = suppliersWithOverdue.get(supplier._id) || 0;
              const overdueAmount = invoices.filter(i => i.supplierId === supplier._id && isOverdueInvoice(i)).reduce((s, i) => s + (i.total || 0), 0);
              const hab = isHabitual(supplier._id, orders, invoices);
              const isValid = supplier.validated !== false;
              const organizerLabels = labelsForSupplierOrganizerIds(supplier.organizerIds, brands, catalogItems);
              const maxOrganizerChips = 6;
              const visibleOrganizers = organizerLabels.slice(0, maxOrganizerChips);
              const hiddenOrganizerCount = Math.max(0, organizerLabels.length - maxOrganizerChips);
              return (
                <div key={supplier._id}
                  onClick={() => navigate(`/saas/suppliers/${supplier._id}`)}
                  className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-4 cursor-pointer transition-all hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-sm">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-bold text-gray-900 dark:text-gray-100 truncate">{supplier.name}</h3>
                        {supplier.code ? (
                          <span className="px-2 py-0.5 text-[10px] font-bold font-mono rounded-full border bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600">
                            {supplier.code}
                          </span>
                        ) : null}
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${supplier.active ? 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700'}`}>
                          {supplier.active ? 'Activo' : 'Inactivo'}
                        </span>
                        {!isValid && (
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full border bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800 flex items-center gap-0.5">
                            <ShieldAlert className="w-2.5 h-2.5" /> Sin validar
                          </span>
                        )}
                        {hab && (
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full border bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-800 flex items-center gap-0.5">
                            <TrendingUp className="w-2.5 h-2.5" /> Habitual
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                        {supplier.cif && <span className="font-mono flex items-center gap-1"><CreditCard className="w-3 h-3" />{supplier.cif}</span>}
                        {supplier.category && <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-400 max-w-[10rem] truncate">{supplier.category}</span>}
                        {supplier.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{supplier.phone}</span>}
                        {supplier.email && <span className="flex items-center gap-1 min-w-0 max-w-full"><Mail className="w-3 h-3 shrink-0" /><span className="truncate">{supplier.email}</span></span>}
                      </div>
                      {visibleOrganizers.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5 max-h-14 overflow-hidden">
                          {visibleOrganizers.map((label) => (
                            <span
                              key={label}
                              title={label}
                              className="px-1.5 py-0.5 bg-sky-50 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300 rounded text-[11px] border border-sky-200 dark:border-sky-800 max-w-[9rem] truncate"
                            >
                              {label}
                            </span>
                          ))}
                          {hiddenOrganizerCount > 0 ? (
                            <span
                              className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded text-[11px] font-semibold"
                              title={`${hiddenOrganizerCount} organizador${hiddenOrganizerCount !== 1 ? 'es' : ''} más`}
                            >
                              +{hiddenOrganizerCount} más
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                      {supplier.address && <div className="text-xs text-gray-400 dark:text-gray-500 mt-1 flex items-center gap-1"><MapPin className="w-3 h-3" />{supplier.address}</div>}
                      <div className="flex gap-3 mt-2 text-xs flex-wrap">
                        <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400"><Package className="w-3 h-3" />{productCount} productos</span>
                        <span className="flex items-center gap-1 text-purple-600 dark:text-purple-400"><Receipt className="w-3 h-3" />{invoiceCount} facturas</span>
                        <span className="flex items-center gap-1 text-cyan-600 dark:text-cyan-400"><ClipboardList className="w-3 h-3" />{orderCount} pedidos</span>
                        {overdueCount > 0 && (
                          <span className="flex items-center gap-1 text-red-600 font-semibold"><AlertTriangle className="w-3 h-3" />{overdueCount} vencida{overdueCount > 1 ? 's' : ''} ({overdueAmount.toLocaleString('es-ES', { maximumFractionDigits: 0 })}€)</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 ml-3 shrink-0">
                      {!isValid && (
                        <button onClick={e => handleValidate(supplier, e)} className="p-1.5 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-lg transition-colors" title="Validar">
                          <Shield className="w-4 h-4 text-green-600" />
                        </button>
                      )}
                      <button onClick={e => { e.stopPropagation(); void openSupplierEditor(supplier); }} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors" title="Editar"><Edit3 className="w-4 h-4 text-gray-600 dark:text-gray-400" /></button>
                      <button onClick={e => { e.stopPropagation(); handleDeleteSupplier(supplier); }} className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors" title="Eliminar"><Trash2 className="w-4 h-4 text-red-500" /></button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      <CreateSupplierModal
        isOpen={showCreateSupplier}
        onClose={() => { setShowCreateSupplier(false); setEditingSupplier(null); setSupplierModalHydrating(false); }}
        onCreate={handleCreateSupplier}
        editItem={editingSupplier}
        editHydrating={supplierModalHydrating}
        brands={brands}
        catalogItems={catalogItems}
        storeIngredients={storeIngredients}
        existingSuppliers={suppliers}
      />

      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="suppliers"
        moduleLabel="Proveedores"
        fields={SUPPLIER_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />

      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Proveedores"
        fields={SUPPLIER_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </div>
  );
}
