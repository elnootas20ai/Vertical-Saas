import { useState, useEffect, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { Layout } from '../../components/saas/Layout';
import { useModalClose } from '../../hooks/useModalClose';
import { useBusiness } from '../../context/BusinessContext';
import {
  listBrandsRequest,
  createBrandRequest,
  updateBrandRequest,
  deleteBrandRequest,
  type Brand,
} from '../../lib/brandApi';
import {
  Plus,
  Search,
  X,
  Trash2,
  Edit3,
  Tag,
  CheckCircle2,
  Globe,
  Image,
} from 'lucide-react';

interface BrandModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<Brand>) => Promise<void>;
  editItem?: Brand | null;
}

function BrandModal({ isOpen, onClose, onSave, editItem }: BrandModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    logo: '',
    website: '',
  });

  useEffect(() => {
    if (editItem) {
      setForm({
        name: editItem.name,
        description: editItem.description || '',
        logo: editItem.logo || '',
        website: editItem.website || '',
      });
    } else {
      setForm({ name: '', description: '', logo: '', website: '' });
    }
  }, [editItem, isOpen]);

  useModalClose(isOpen, onClose);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('El nombre de la marca es obligatorio');
      return;
    }
    setSubmitting(true);
    try {
      await onSave({ ...editItem, ...form, active: editItem?.active ?? true });
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    'w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100';
  const labelClass =
    'block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              {editItem ? 'Editar marca' : 'Nueva marca'}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {editItem
                ? 'Modifica los datos de la marca comercial'
                : 'Registra una nueva marca comercial'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className={labelClass}>Nombre *</label>
            <input
              className={inputClass}
              placeholder="Nombre de la marca"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              autoFocus
            />
          </div>

          <div>
            <label className={labelClass}>Descripción</label>
            <textarea
              rows={3}
              className={`${inputClass} resize-none`}
              placeholder="Descripción breve de la marca..."
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
            />
          </div>

          <div>
            <label className={labelClass}>Sitio web</label>
            <input
              className={inputClass}
              placeholder="https://www.ejemplo.com"
              value={form.website}
              onChange={(e) =>
                setForm((f) => ({ ...f, website: e.target.value }))
              }
            />
          </div>

          <div>
            <label className={labelClass}>Logo (URL)</label>
            <input
              className={inputClass}
              placeholder="https://... o dejar vacío"
              value={form.logo}
              onChange={(e) => setForm((f) => ({ ...f, logo: e.target.value }))}
            />
            {form.logo && (
              <div className="mt-2 flex justify-center">
                <img
                  src={form.logo}
                  alt="Logo preview"
                  className="h-16 w-16 object-contain rounded-lg border border-gray-200 dark:border-gray-700"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
            )}
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
              className="flex-1 px-4 py-3 bg-gray-900 hover:bg-black dark:bg-gray-100 dark:hover:bg-white dark:text-gray-900 text-white rounded-xl font-semibold transition-colors disabled:opacity-60 disabled:cursor-wait"
            >
              {submitting
                ? 'Guardando…'
                : editItem
                  ? 'Guardar cambios'
                  : 'Crear marca'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function BrandsPage() {
  const { currentBusiness } = useBusiness();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');

  const businessId = currentBusiness?.business_id || '';

  const loadBrands = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const list = await listBrandsRequest(businessId);
      setBrands(list);
    } catch {
      toast.error('Error al cargar marcas');
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    loadBrands();
  }, [loadBrands]);

  const handleSave = async (data: Partial<Brand>) => {
    if (!businessId) {
      toast.error('Selecciona una empresa primero');
      return;
    }
    try {
      if (editingBrand) {
        const updated = await updateBrandRequest(businessId, {
          ...editingBrand,
          ...data,
        } as Brand);
        setBrands((prev) =>
          prev.map((b) => (b._id === updated._id ? updated : b)),
        );
        toast.success('Marca actualizada');
      } else {
        const created = await createBrandRequest(businessId, data);
        setBrands((prev) => [created, ...prev]);
        toast.success('Marca creada');
      }
      setShowModal(false);
      setEditingBrand(null);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Error al guardar la marca',
      );
    }
  };

  const handleDelete = async (brand: Brand) => {
    if (!businessId) return;
    if (!confirm(`¿Eliminar la marca "${brand.name}"?`)) return;
    try {
      await deleteBrandRequest(businessId, brand._id);
      setBrands((prev) => prev.filter((b) => b._id !== brand._id));
      toast.success('Marca eliminada');
    } catch {
      toast.error('Error al eliminar la marca');
    }
  };

  const handleToggleActive = async (brand: Brand) => {
    if (!businessId) return;
    try {
      const updated = await updateBrandRequest(businessId, {
        ...brand,
        active: !brand.active,
      });
      setBrands((prev) =>
        prev.map((b) => (b._id === updated._id ? updated : b)),
      );
      toast.success(
        `"${brand.name}" marcada como ${!brand.active ? 'activa' : 'inactiva'}`,
      );
    } catch {
      toast.error('Error al actualizar la marca');
    }
  };

  const kpis = useMemo(
    () => ({
      total: brands.length,
      active: brands.filter((b) => b.active).length,
      inactive: brands.filter((b) => !b.active).length,
    }),
    [brands],
  );

  const filteredBrands = useMemo(() => {
    let result = brands;

    if (filterActive === 'active') result = result.filter((b) => b.active);
    else if (filterActive === 'inactive') result = result.filter((b) => !b.active);

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (b) =>
          b.name.toLowerCase().includes(q) ||
          b.description?.toLowerCase().includes(q) ||
          b.website?.toLowerCase().includes(q),
      );
    }

    return result;
  }, [brands, search, filterActive]);

  return (
    <Layout
      title="Marcas"
      subtitle={
        currentBusiness
          ? `Marcas comerciales de ${currentBusiness.name}`
          : 'Selecciona una empresa para ver sus marcas'
      }
    >
      <div className="space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-3 gap-4">
          <button
            onClick={() => setFilterActive('all')}
            className={`p-4 rounded-xl border-2 text-left transition-all ${filterActive === 'all' ? 'border-blue-400 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300'}`}
          >
            <div className="text-blue-600 dark:text-blue-400 mb-2">
              <Tag className="w-5 h-5" />
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {kpis.total}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Total marcas
            </div>
          </button>
          <button
            onClick={() => setFilterActive('active')}
            className={`p-4 rounded-xl border-2 text-left transition-all ${filterActive === 'active' ? 'border-green-400 dark:border-green-600 bg-green-50 dark:bg-green-900/20' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300'}`}
          >
            <div className="text-green-600 dark:text-green-400 mb-2">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {kpis.active}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Activas
            </div>
          </button>
          <button
            onClick={() => setFilterActive('inactive')}
            className={`p-4 rounded-xl border-2 text-left transition-all ${filterActive === 'inactive' ? 'border-gray-400 dark:border-gray-500 bg-gray-100 dark:bg-gray-700' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300'}`}
          >
            <div className="text-gray-500 dark:text-gray-400 mb-2">
              <Tag className="w-5 h-5" />
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {kpis.inactive}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Inactivas
            </div>
          </button>
        </div>

        {/* Search & Actions */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
            <input
              className="pl-9 pr-4 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-64"
              placeholder="Buscar marca..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            onClick={() => {
              setEditingBrand(null);
              setShowModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 hover:bg-black dark:bg-gray-100 dark:hover:bg-white dark:text-gray-900 text-white rounded-xl text-sm font-semibold transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nueva marca
          </button>
        </div>

        {/* Brand list */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-500 dark:text-gray-400">
            <div className="animate-spin w-6 h-6 border-2 border-gray-300 border-t-gray-900 rounded-full mr-3" />
            Cargando marcas...
          </div>
        ) : !businessId ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
            <Tag className="w-12 h-12 text-gray-300 mb-3" />
            <p className="font-semibold">Sin empresa seleccionada</p>
            <p className="text-sm mt-1">
              Selecciona una empresa desde el menú superior
            </p>
          </div>
        ) : filteredBrands.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
            <Tag className="w-12 h-12 text-gray-300 mb-3" />
            <p className="font-semibold">
              {search ? 'Sin resultados' : 'Sin marcas registradas'}
            </p>
            <p className="text-sm mt-1">
              {search
                ? 'Prueba con otros términos de búsqueda'
                : 'Añade la primera marca comercial'}
            </p>
            {!search && (
              <button
                onClick={() => {
                  setEditingBrand(null);
                  setShowModal(true);
                }}
                className="mt-4 px-4 py-2 bg-gray-900 dark:bg-gray-100 dark:text-gray-900 text-white rounded-xl text-sm font-medium"
              >
                + Nueva marca
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredBrands.map((brand) => (
              <div
                key={brand._id}
                className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-5 hover:border-gray-300 dark:hover:border-gray-600 transition-all group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {brand.logo ? (
                      <img
                        src={brand.logo}
                        alt={brand.name}
                        className="w-10 h-10 rounded-lg object-contain border border-gray-200 dark:border-gray-700 shrink-0"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                          (
                            e.target as HTMLImageElement
                          ).nextElementSibling?.classList.remove('hidden');
                        }}
                      />
                    ) : null}
                    <div
                      className={`w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0 ${brand.logo ? 'hidden' : ''}`}
                    >
                      <Tag className="w-5 h-5 text-gray-400" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-gray-900 dark:text-gray-100 truncate">
                        {brand.name}
                      </h3>
                      <span
                        className={`inline-block px-2 py-0.5 text-[10px] font-bold rounded-full border mt-0.5 ${
                          brand.active
                            ? 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700'
                        }`}
                      >
                        {brand.active ? 'Activa' : 'Inactiva'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={() => {
                        setEditingBrand(brand);
                        setShowModal(true);
                      }}
                      className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                      title="Editar"
                    >
                      <Edit3 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                    </button>
                    <button
                      onClick={() => handleToggleActive(brand)}
                      className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                      title={brand.active ? 'Desactivar' : 'Activar'}
                    >
                      <CheckCircle2
                        className={`w-4 h-4 ${brand.active ? 'text-green-600' : 'text-gray-400'}`}
                      />
                    </button>
                    <button
                      onClick={() => handleDelete(brand)}
                      className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </button>
                  </div>
                </div>

                {brand.description && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-3">
                    {brand.description}
                  </p>
                )}

                <div className="flex flex-wrap gap-2 text-xs text-gray-400 dark:text-gray-500">
                  {brand.website && (
                    <a
                      href={
                        brand.website.startsWith('http')
                          ? brand.website
                          : `https://${brand.website}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Globe className="w-3 h-3" />
                      {brand.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                    </a>
                  )}
                  {brand.logo && (
                    <span className="flex items-center gap-1">
                      <Image className="w-3 h-3" />
                      Logo
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <BrandModal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setEditingBrand(null);
        }}
        onSave={handleSave}
        editItem={editingBrand}
      />
    </Layout>
  );
}
