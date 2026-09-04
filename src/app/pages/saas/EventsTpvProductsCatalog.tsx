/**
 * Productos de cobro en evento — catálogo simple (nombre + precio + IVA).
 * No es el TPV de delivery/bar: solo alta de productos para cobrar después.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Edit3, Loader2, Search, ToggleLeft, ToggleRight, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { useModalClose } from '../../hooks/useModalClose';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { GenericImportModal } from '../../components/saas/GenericImportModal';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { resolveEventsUserId } from '../../lib/eventsFlow';
import { bulkCreateVerticalEntries, entryStr } from '../../lib/bulkVerticalImport';
import {
  downloadEventsTpvCatalogImportTemplate,
  EVENTS_TPV_CATALOG_HEADER_ALIASES,
  EVENTS_TPV_CATALOG_IMPORT_FIELDS,
  EVENTS_TPV_CATALOG_SHEET_NAME,
  EVENTS_TPV_CATALOG_TEMPLATE_FILENAME,
  isEventsTpvCatalogExampleName,
  parseEventsTpvCatalogPrice,
} from '../../lib/eventsTpvCatalogExcelTemplate';
import {
  EVENTS_TPV_DEFAULT_TAX_RATE,
  EVENTS_TPV_TAX_OPTIONS,
  eventsTpvProductTaxRate,
  normalizeEventsTpvTaxRate,
} from '../../lib/eventsTpvProducts';
import {
  VERTIAL_BTN_PRIMARY,
  VERTIAL_BTN_SECONDARY,
  VERTIAL_SURFACE,
} from '../../lib/vertialUiTokens';

interface EventTpvProduct extends VerticalEntity {
  nombre: string;
  precio: number;
  taxRate?: number;
  iva?: number;
  descripcion: string;
  activo: boolean;
}

type ProductForm = {
  nombre: string;
  precio: number;
  taxRate: number;
  descripcion: string;
  activo: boolean;
};

const EMPTY: ProductForm = {
  nombre: '',
  precio: 0,
  taxRate: EVENTS_TPV_DEFAULT_TAX_RATE,
  descripcion: '',
  activo: true,
};

export function EventsTpvProductsCatalog() {
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const api = useMemo(() => createVerticalApi<EventTpvProduct>('events', 'tpv_products'), []);
  const userId = useMemo(
    () => resolveEventsUserId(user, currentBusiness),
    [user, currentBusiness],
  );

  const [items, setItems] = useState<EventTpvProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editing, setEditing] = useState<EventTpvProduct | null>(null);
  const [form, setForm] = useState<ProductForm>(EMPTY);
  const [precioText, setPrecioText] = useState('');
  const [taxText, setTaxText] = useState(String(EVENTS_TPV_DEFAULT_TAX_RATE));

  const loadData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setItems(await api.list(userId));
    } catch {
      toast.error('No se pudieron cargar los productos');
    } finally {
      setLoading(false);
    }
  }, [userId, api]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useModalClose(showModal, () => setShowModal(false));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (p) =>
        String(p.nombre || '').toLowerCase().includes(q)
        || String(p.descripcion || '').toLowerCase().includes(q),
    );
  }, [items, search]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setPrecioText('');
    setTaxText(String(EVENTS_TPV_DEFAULT_TAX_RATE));
    setShowModal(true);
  };

  const openEdit = (p: EventTpvProduct) => {
    setEditing(p);
    const taxRate = eventsTpvProductTaxRate(p);
    setForm({
      nombre: p.nombre || '',
      precio: Number(p.precio) || 0,
      taxRate,
      descripcion: p.descripcion || '',
      activo: p.activo !== false,
    });
    setPrecioText(p.precio ? String(p.precio).replace('.', ',') : '');
    setTaxText(String(taxRate));
    setShowModal(true);
  };

  const applyTaxPreset = (value: number) => {
    const taxRate = normalizeEventsTpvTaxRate(value);
    setForm((f) => ({ ...f, taxRate }));
    setTaxText(String(taxRate));
  };

  const handleSave = async () => {
    if (!userId) return;
    if (!form.nombre.trim()) {
      toast.error('Indica el nombre del producto');
      return;
    }
    const precio = Number(String(precioText).replace(',', '.').trim());
    const taxRate = normalizeEventsTpvTaxRate(
      taxText.trim() === '' ? form.taxRate : taxText,
    );
    const payload = {
      nombre: form.nombre.trim(),
      precio: Number.isFinite(precio) ? precio : 0,
      taxRate,
      iva: taxRate,
      descripcion: form.descripcion.trim(),
      activo: form.activo,
    };
    try {
      if (editing) {
        await api.update(userId, editing._id, payload);
        toast.success('Producto actualizado');
      } else {
        await api.create(userId, payload);
        toast.success('Producto creado');
      }
      setShowModal(false);
      await loadData();
    } catch {
      toast.error('No se pudo guardar');
    }
  };

  const handleDelete = async (id: string) => {
    if (!userId) return;
    try {
      await api.remove(userId, id);
      toast.success('Producto eliminado');
      await loadData();
    } catch {
      toast.error('No se pudo eliminar');
    }
  };

  const toggleActive = async (p: EventTpvProduct) => {
    if (!userId) return;
    try {
      await api.update(userId, p._id, { activo: p.activo === false });
      await loadData();
    } catch {
      toast.error('No se pudo cambiar el estado');
    }
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    if (!userId) {
      toast.error('Sesión no válida');
      return 0;
    }
    const created = await bulkCreateVerticalEntries(userId, api, entries, (e) => {
      const nombre = entryStr(e, 'name', 'nombre');
      if (!nombre || isEventsTpvCatalogExampleName(nombre)) return null;
      const descParts = [
        entryStr(e, 'description', 'descripcion'),
        entryStr(e, 'category', 'categoria')
          ? `Cat: ${entryStr(e, 'category', 'categoria')}`
          : '',
      ].filter(Boolean);
      const taxRaw = entryStr(e, 'taxRate', 'iva', 'tax');
      const taxRate = normalizeEventsTpvTaxRate(
        taxRaw === '' ? EVENTS_TPV_DEFAULT_TAX_RATE : taxRaw,
      );
      return {
        nombre,
        precio: parseEventsTpvCatalogPrice(entryStr(e, 'price', 'precio')),
        taxRate,
        iva: taxRate,
        descripcion: descParts.join(' · '),
        activo: true,
      };
    });
    if (created > 0) {
      await loadData();
    } else {
      toast.error('No se pudo importar ningún producto (¿filas de ejemplo?)');
    }
    return created;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-stone-500">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        Cargando productos…
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <p className="text-sm text-stone-500 dark:text-stone-400">
          Productos simples para cobrar en el evento (bebida, merch, extras…). IVA comida por defecto 10%.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar producto…"
              className="w-full min-h-11 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 pl-10 pr-3 text-sm"
            />
          </div>
          <AddButtonDropdown
            label="Nuevo producto"
            onQuickAdd={openCreate}
            onImport={() => setShowImportModal(true)}
            quickAddLabel="Alta rápida"
            quickAddDesc="Formulario de producto"
            importAddLabel="Importar Excel"
            importAddDesc="Plantilla Excel: nombre, precio, IVA…"
          />
        </div>

        <div className={`${VERTIAL_SURFACE} overflow-hidden`}>
          <table className="w-full text-sm">
            <thead className="bg-stone-50 dark:bg-stone-900/80 text-left text-stone-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Nombre</th>
                <th className="px-4 py-3 font-semibold">Precio</th>
                <th className="px-4 py-3 font-semibold">IVA</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-stone-400">
                    Sin productos de cobro. Añade los que venderás en el evento.
                  </td>
                </tr>
              ) : (
                filtered.map((p) => (
                  <tr key={p._id} className="hover:bg-stone-50/80 dark:hover:bg-stone-900/40">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-stone-900 dark:text-stone-100">{p.nombre}</div>
                      {p.descripcion ? (
                        <div className="text-xs text-stone-500 mt-0.5 line-clamp-1">{p.descripcion}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {(Number(p.precio) || 0).toLocaleString('es-ES', {
                        style: 'currency',
                        currency: 'EUR',
                      })}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-stone-600 dark:text-stone-300">
                      {eventsTpvProductTaxRate(p)}%
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => void toggleActive(p)}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold"
                        title={p.activo !== false ? 'Activo' : 'Inactivo'}
                      >
                        {p.activo !== false ? (
                          <>
                            <ToggleRight className="w-5 h-5 text-[var(--v-blue,#2563eb)]" />
                            <span className="text-emerald-700 dark:text-emerald-300">Activo</span>
                          </>
                        ) : (
                          <>
                            <ToggleLeft className="w-5 h-5 text-stone-400" />
                            <span className="text-stone-400">Inactivo</span>
                          </>
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(p)}
                          className="p-2 rounded-lg text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
                          title="Editar"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(p._id)}
                          className="p-2 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/45">
          <div className={`${VERTIAL_SURFACE} w-full max-w-md p-5 space-y-4`}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">
                {editing ? 'Editar producto' : 'Nuevo producto'}
              </h2>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-2 rounded-lg text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-stone-500">Nombre *</span>
              <input
                value={form.nombre}
                onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                placeholder="Ej. Agua 50cl"
                className="w-full min-h-11 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 text-sm"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-stone-500">Precio (€) *</span>
              <input
                value={precioText}
                onChange={(e) => setPrecioText(e.target.value)}
                placeholder="0,00"
                inputMode="decimal"
                className="w-full min-h-11 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 text-sm"
              />
            </label>

            <div className="block space-y-1.5">
              <span className="text-xs font-semibold text-stone-500">IVA (%)</span>
              <div className="flex flex-wrap gap-2">
                {EVENTS_TPV_TAX_OPTIONS.map((opt) => {
                  const active = Number(form.taxRate) === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => applyTaxPreset(opt.value)}
                      className={`min-h-9 rounded-xl border px-3 text-xs font-semibold transition-colors ${
                        active
                          ? 'border-[var(--v-blue,#2563eb)] bg-blue-50 text-[var(--v-blue,#2563eb)] dark:bg-blue-950/40 dark:text-blue-300'
                          : 'border-stone-200 bg-white text-stone-600 hover:border-blue-300 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <div className="relative">
                <input
                  value={taxText}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '' || /^[\d.,]*$/.test(v)) {
                      setTaxText(v);
                      const n = Number(String(v).replace(',', '.'));
                      if (Number.isFinite(n) && n >= 0 && n <= 100) {
                        setForm((f) => ({ ...f, taxRate: Math.round(n) }));
                      }
                    }
                  }}
                  onBlur={() => {
                    const taxRate = normalizeEventsTpvTaxRate(taxText === '' ? form.taxRate : taxText);
                    setForm((f) => ({ ...f, taxRate }));
                    setTaxText(String(taxRate));
                  }}
                  placeholder="Ej. 4"
                  inputMode="decimal"
                  className="w-full min-h-11 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 pr-10 text-sm tabular-nums"
                  aria-label="IVA manual en porcentaje"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-stone-400">
                  %
                </span>
              </div>
              <span className="text-[11px] text-stone-400">
                Atajos 10% / 21%, o escribe otro (0–100). Por defecto comida 10%.
              </span>
            </div>

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-stone-500">Notas (opcional)</span>
              <textarea
                value={form.descripcion}
                onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                rows={2}
                className="w-full rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 py-2 text-sm"
              />
            </label>

            <label className="flex items-center gap-2 text-sm font-medium text-stone-700 dark:text-stone-200">
              <input
                type="checkbox"
                checked={form.activo}
                onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))}
                className="rounded border-stone-300"
              />
              Activo para cobro
            </label>

            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <button type="button" onClick={() => setShowModal(false)} className={VERTIAL_BTN_SECONDARY}>
                Cancelar
              </button>
              <button type="button" onClick={() => void handleSave()} className={VERTIAL_BTN_PRIMARY}>
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Productos TPV evento"
        templateFileName={EVENTS_TPV_CATALOG_TEMPLATE_FILENAME}
        fields={EVENTS_TPV_CATALOG_IMPORT_FIELDS}
        onImport={handleImportEntries}
        onDownloadTemplate={downloadEventsTpvCatalogImportTemplate}
        headerAliases={EVENTS_TPV_CATALOG_HEADER_ALIASES}
        skipMappingWhenComplete
        importSheetName={EVENTS_TPV_CATALOG_SHEET_NAME}
      />
    </>
  );
}
