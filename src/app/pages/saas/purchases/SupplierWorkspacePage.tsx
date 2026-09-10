import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../../../context/AuthContext';
import { useBusinessOptional } from '../../../context/BusinessContext';
import {
  PurchasesChromelessShell,
  PURCHASES_FIELD_INPUT,
  PURCHASES_FIELD_LABEL,
} from '../../../components/saas/purchases/PurchasesChromelessShell';
import { SupplierPaymentTermsField } from '../../../components/saas/SupplierPaymentTermsField';
import {
  initialSupplierCatalogItemIds,
  initialSupplierItemCosts,
  initialSupplierOrganizerIds,
  parseSupplierItemCosts,
  resolveSupplierOrganizerIdsForSave,
  SupplierOrganizersField,
  supplierFormInitFingerprint,
} from '../../../components/saas/SupplierOrganizersField';
import { listBrandsRequest, type Brand } from '../../../lib/brandsApi';
import { commercialLineBrands } from '../../../lib/deliveryCatalogImportLogic';
import {
  createSupplierRequest,
  getDeliveryConfigRequest,
  listCatalogItemsRequest,
  listSuppliersRequest,
  updateSupplierRequest,
  type CatalogItem,
  type Supplier,
} from '../../../lib/deliveryApi';
import {
  unifyStoreIngredientsFromConfig,
  type StoreIngredient,
} from '../../../lib/catalogCustomization';
import {
  normalizeSupplierCode,
  sanitizeSupplierCodeInput,
  suggestNextSupplierCode,
  suggestSupplierCodeFromName,
  supplierCodeAlreadyUsed,
  SUPPLIER_CODE_MAX_LEN,
} from '../../../lib/supplierCode';
import {
  resolveSupplierSelectedStockIds,
  syncSupplierCatalogItemLinks,
} from '../../../lib/supplierCatalogLinks';
import {
  PURCHASES_RETURN_DEFAULT,
  resolvePurchasesReturnTo,
} from '../../../lib/purchasesWorkspacePaths';
import { resolveBusinessScopeId } from '../../../lib/businessStoreScope';
import { resolveBusinessDataUserId } from '../../../lib/tenantUserId';
import { VertialLoadingState } from '../../../components/VertialLoadingState';

const FORM_ID = 'purchases-supplier-form';

type SupplierFormState = {
  name: string;
  code: string;
  cif: string;
  email: string;
  phone: string;
  address: string;
  contactPerson: string;
  category: string;
  paymentTerms: string;
  notes: string;
  organizerIds: string[];
  catalogItemIds: string[];
  itemCosts: Record<string, string>;
};

function emptyForm(code = ''): SupplierFormState {
  return {
    name: '',
    code,
    cif: '',
    email: '',
    phone: '',
    address: '',
    contactPerson: '',
    category: '',
    paymentTerms: '',
    notes: '',
    organizerIds: [],
    catalogItemIds: [],
    itemCosts: {},
  };
}

export function SupplierWorkspacePage() {
  const { supplierId } = useParams<{ supplierId?: string }>();
  const isEdit = Boolean(supplierId);
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const businessCtx = useBusinessOptional();
  const businessId = resolveBusinessScopeId(businessCtx?.currentBusiness);
  const accountBusinessCount = businessCtx?.businesses?.length ?? 1;
  const dataUserId = resolveBusinessDataUserId(user, businessCtx?.currentBusiness);
  const businessType = businessCtx?.currentBusiness?.businessType ?? null;

  const returnTo = resolvePurchasesReturnTo(
    location.state,
    PURCHASES_RETURN_DEFAULT.suppliers,
  );

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formInitReady, setFormInitReady] = useState(false);
  const [organizersFieldKey, setOrganizersFieldKey] = useState(0);
  const [codeManual, setCodeManual] = useState(false);
  const [editItem, setEditItem] = useState<Supplier | null>(null);
  const [existingSuppliers, setExistingSuppliers] = useState<Supplier[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [storeIngredients, setStoreIngredients] = useState<StoreIngredient[]>([]);
  const [form, setForm] = useState<SupplierFormState>(() => emptyForm());

  const formRef = useRef(form);
  const organizersTouchedRef = useRef(false);
  const sessionRef = useRef<{ fingerprint: string } | null>(null);
  formRef.current = form;

  const goBack = useCallback(() => {
    navigate(returnTo);
  }, [navigate, returnTo]);

  const applyForm = (next: SupplierFormState | ((prev: SupplierFormState) => SupplierFormState)) => {
    setForm((prev) => {
      const merged = typeof next === 'function' ? next(prev) : next;
      formRef.current = merged;
      return merged;
    });
  };

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!dataUserId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const [sups, stockItems, cartaItems] = await Promise.all([
          listSuppliersRequest(dataUserId, {
            businessId: businessId || undefined,
            accountBusinessCount,
          }),
          listCatalogItemsRequest(dataUserId, 'stock').catch(() => [] as CatalogItem[]),
          listCatalogItemsRequest(dataUserId, 'catalog').catch(() => [] as CatalogItem[]),
        ]);
        if (cancelled) return;
        setExistingSuppliers(sups);
        const byId = new Map<string, CatalogItem>();
        for (const item of [...cartaItems, ...stockItems]) {
          if (item?._id) byId.set(item._id, item);
        }
        const items = [...byId.values()];
        setCatalogItems(items);

        let loadedBrands: Brand[] = [];
        if (businessId) {
          loadedBrands = await listBrandsRequest(businessId).catch(() => []);
        }
        if (cancelled) return;
        setBrands(loadedBrands);

        const config = await getDeliveryConfigRequest(dataUserId).catch(() => null);
        if (cancelled) return;
        const brandIds = commercialLineBrands(loadedBrands).map((b) => b._id);
        setStoreIngredients(
          unifyStoreIngredientsFromConfig(config || {}, brandIds),
        );

        if (supplierId) {
          const found = sups.find((s) => s._id === supplierId) || null;
          if (!found) {
            toast.error('Proveedor no encontrado');
            navigate(returnTo, { replace: true });
            return;
          }
          setEditItem(found);
        } else {
          setEditItem(null);
        }
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : 'No se pudo cargar el proveedor');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [
    dataUserId,
    businessId,
    accountBusinessCount,
    supplierId,
    navigate,
    returnTo,
  ]);

  const editSnapshot = supplierFormInitFingerprint(editItem, catalogItems.length);

  useEffect(() => {
    if (loading) {
      setFormInitReady(false);
      return;
    }
    if (isEdit && !editItem) return;
    if (isEdit && catalogItems.length === 0) {
      setFormInitReady(false);
      return;
    }

    const fingerprint = supplierFormInitFingerprint(editItem, catalogItems.length);
    if (organizersTouchedRef.current && sessionRef.current?.fingerprint === fingerprint) {
      setFormInitReady(true);
      return;
    }
    if (sessionRef.current?.fingerprint === fingerprint) {
      setFormInitReady(true);
      return;
    }
    sessionRef.current = { fingerprint };

    setCodeManual(Boolean(editItem?.code));
    if (editItem) {
      const catalogItemIds = initialSupplierCatalogItemIds(editItem, catalogItems);
      const nextForm: SupplierFormState = {
        name: editItem.name,
        code: editItem.code || '',
        cif: editItem.cif || '',
        email: editItem.email || '',
        phone: editItem.phone || '',
        address: editItem.address || '',
        contactPerson: editItem.contactPerson || '',
        category: editItem.category || '',
        paymentTerms: editItem.paymentTerms || '',
        notes: editItem.notes || '',
        organizerIds: initialSupplierOrganizerIds(
          editItem,
          catalogItems,
          storeIngredients,
          brands,
        ),
        catalogItemIds,
        itemCosts: initialSupplierItemCosts(catalogItemIds, catalogItems),
      };
      formRef.current = nextForm;
      setForm(nextForm);
    } else {
      const nextForm = emptyForm(suggestNextSupplierCode(existingSuppliers));
      formRef.current = nextForm;
      setForm(nextForm);
    }
    setOrganizersFieldKey((k) => k + 1);
    setFormInitReady(true);
  }, [
    loading,
    isEdit,
    editItem,
    editSnapshot,
    catalogItems,
    storeIngredients,
    brands,
    existingSuppliers,
  ]);

  const handleNameChange = (name: string) => {
    applyForm((f) => ({
      ...f,
      name,
      code: codeManual
        ? f.code
        : suggestSupplierCodeFromName(name, existingSuppliers, editItem?._id),
    }));
  };

  const handleCodeChange = (raw: string) => {
    setCodeManual(true);
    applyForm((f) => ({ ...f, code: sanitizeSupplierCodeInput(raw) }));
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!dataUserId || submitting) return;
    const current = formRef.current;
    if (!current.name.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }
    const code = normalizeSupplierCode(current.code);
    if (!code) {
      toast.error('El código del proveedor es obligatorio');
      return;
    }
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
      toast.error('Las categorías no se cargaron bien. Vuelve a abrir el proveedor.');
      return;
    }

    setSubmitting(true);
    try {
      const organizerIds = resolveSupplierOrganizerIdsForSave(
        current.organizerIds,
        current.catalogItemIds,
        catalogItems,
        storeIngredients,
        brands,
      );
      const catalogItemCosts = parseSupplierItemCosts(current.itemCosts);
      const resolvedCatalogItemIds = resolveSupplierSelectedStockIds(
        current.catalogItemIds || [],
        catalogItems,
        storeIngredients,
      );
      const resolvedCosts: Record<string, number> = {};
      for (const [rawId, cost] of Object.entries(catalogItemCosts || {})) {
        const mapped = resolveSupplierSelectedStockIds(
          [rawId],
          catalogItems,
          storeIngredients,
        )[0];
        if (mapped) resolvedCosts[mapped] = cost;
      }
      const supplierData = {
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
        catalogItemIds: resolvedCatalogItemIds,
        active: editItem?.active ?? true,
        business_id: businessId || editItem?.business_id || undefined,
      };

      if (editItem) {
        const updated = await updateSupplierRequest(dataUserId, {
          ...editItem,
          ...supplierData,
        } as Supplier);
        await syncSupplierCatalogItemLinks(
          dataUserId,
          updated,
          supplierData.catalogItemIds || [],
          catalogItems,
          resolvedCosts,
          storeIngredients,
        );
        toast.success('Proveedor actualizado');
      } else {
        const created = await createSupplierRequest(dataUserId, supplierData);
        await syncSupplierCatalogItemLinks(
          dataUserId,
          created,
          supplierData.catalogItemIds || [],
          catalogItems,
          resolvedCosts,
          storeIngredients,
        );
        toast.success('Proveedor creado');
      }
      navigate(returnTo);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar el proveedor');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-stone-50 dark:bg-stone-950">
        <VertialLoadingState label="Cargando proveedor…" />
      </div>
    );
  }

  return (
    <form id={FORM_ID} onSubmit={(e) => void handleSubmit(e)} className="contents">
      <PurchasesChromelessShell
        title={isEdit ? 'Editar proveedor' : 'Nuevo proveedor'}
        subtitle="Datos a la izquierda · qué te vende a la derecha"
        onBack={goBack}
        backLabel="Volver al SaaS"
        primaryLabel={isEdit ? 'Guardar' : 'Crear proveedor'}
        onPrimary={() => void handleSubmit()}
        primaryDisabled={submitting || !formInitReady}
        primaryLoading={submitting}
        formId={FORM_ID}
        left={
          <>
            <div>
              <label className={PURCHASES_FIELD_LABEL} htmlFor="sup-name">
                Nombre *
              </label>
              <input
                id="sup-name"
                className={PURCHASES_FIELD_INPUT}
                value={form.name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Makro"
                autoFocus={!isEdit}
              />
            </div>
            <div>
              <label className={PURCHASES_FIELD_LABEL} htmlFor="sup-code">
                Código *
              </label>
              <input
                id="sup-code"
                className={`${PURCHASES_FIELD_INPUT} font-mono uppercase`}
                value={form.code}
                onChange={(e) => handleCodeChange(e.target.value)}
                placeholder="MAK-001"
                maxLength={SUPPLIER_CODE_MAX_LEN}
              />
              <p className="mt-1 text-[10px] text-stone-400">Se rellena solo; editable.</p>
            </div>
            <div>
              <label className={PURCHASES_FIELD_LABEL} htmlFor="sup-cif">
                CIF/NIF
              </label>
              <input
                id="sup-cif"
                className={`${PURCHASES_FIELD_INPUT} font-mono uppercase`}
                value={form.cif}
                onChange={(e) => applyForm((f) => ({ ...f, cif: e.target.value.toUpperCase() }))}
                placeholder="B12345678"
              />
            </div>
            <div>
              <label className={PURCHASES_FIELD_LABEL} htmlFor="sup-email">
                Email
              </label>
              <input
                id="sup-email"
                type="email"
                className={PURCHASES_FIELD_INPUT}
                value={form.email}
                onChange={(e) => applyForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div>
              <label className={PURCHASES_FIELD_LABEL} htmlFor="sup-phone">
                Teléfono
              </label>
              <input
                id="sup-phone"
                className={PURCHASES_FIELD_INPUT}
                value={form.phone}
                onChange={(e) => applyForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <div>
              <label className={PURCHASES_FIELD_LABEL} htmlFor="sup-contact">
                Contacto
              </label>
              <input
                id="sup-contact"
                className={PURCHASES_FIELD_INPUT}
                value={form.contactPerson}
                onChange={(e) => applyForm((f) => ({ ...f, contactPerson: e.target.value }))}
              />
            </div>
            <div>
              <label className={PURCHASES_FIELD_LABEL} htmlFor="sup-address">
                Dirección
              </label>
              <input
                id="sup-address"
                className={PURCHASES_FIELD_INPUT}
                value={form.address}
                onChange={(e) => applyForm((f) => ({ ...f, address: e.target.value }))}
              />
            </div>
            <SupplierPaymentTermsField
              value={form.paymentTerms}
              onChange={(paymentTerms) => applyForm((f) => ({ ...f, paymentTerms }))}
              labelClassName={PURCHASES_FIELD_LABEL}
              inputClassName={PURCHASES_FIELD_INPUT}
            />
            <div>
              <label className={PURCHASES_FIELD_LABEL} htmlFor="sup-notes">
                Notas
              </label>
              <textarea
                id="sup-notes"
                rows={2}
                className={`${PURCHASES_FIELD_INPUT} resize-none`}
                value={form.notes}
                onChange={(e) => applyForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </>
        }
        right={
          formInitReady ? (
            <div className="rounded-2xl border border-stone-200 bg-white p-3 sm:p-4 dark:border-stone-800 dark:bg-stone-900">
              <h2 className="mb-3 text-sm font-bold text-stone-900 dark:text-stone-100">
                Qué te vende
              </h2>
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
                businessType={businessType}
              />
            </div>
          ) : (
            <div className="rounded-2xl border-2 border-dashed border-stone-200 px-4 py-16 text-center text-sm text-stone-500 dark:border-stone-700">
              Cargando categorías y productos…
            </div>
          )
        }
      />
    </form>
  );
}
