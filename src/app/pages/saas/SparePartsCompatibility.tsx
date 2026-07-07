import { useState, useMemo, useCallback, useEffect } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { useModalClose } from '../../hooks/useModalClose';
import {
  Search, Plus, Edit3, Trash2, X, Save, Car,
  Tag, Layers, Link2, Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { bulkCreateVerticalEntries, entryStr, entryNum } from '../../lib/bulkVerticalImport';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

interface Compatibility extends VerticalEntity {
  referenciaPieza: string;
  nombrePieza: string;
  marcaVehiculo: string;
  modelo: string;
  anioDesde: number;
  anioHasta: number;
  motorizacion: string;
  referenciaOE: string;
  notas: string;
}

type CompatibilityForm = Omit<Compatibility, keyof VerticalEntity>;

const MARCAS_VEHICULO = ['Volkswagen', 'Audi', 'BMW', 'Mercedes', 'Seat', 'Peugeot', 'Renault', 'Ford', 'Opel', 'Toyota', 'Hyundai', 'Kia', 'Citroën', 'Fiat', 'Skoda'];

const MODELOS_POR_MARCA: Record<string, string[]> = {
  Volkswagen: ['Golf', 'Polo', 'Passat', 'Tiguan', 'T-Roc', 'Touareg'],
  Audi: ['A3', 'A4', 'A6', 'Q3', 'Q5', 'Q7'],
  BMW: ['Serie 1', 'Serie 3', 'Serie 5', 'X1', 'X3', 'X5'],
  Mercedes: ['Clase A', 'Clase C', 'Clase E', 'GLA', 'GLC', 'GLE'],
  Seat: ['Ibiza', 'León', 'Arona', 'Ateca', 'Tarraco'],
  Peugeot: ['208', '308', '3008', '508', '2008', '5008'],
  Renault: ['Clio', 'Mégane', 'Captur', 'Kadjar', 'Arkana'],
  Ford: ['Fiesta', 'Focus', 'Kuga', 'Puma', 'Mondeo'],
  Opel: ['Corsa', 'Astra', 'Mokka', 'Grandland', 'Insignia'],
  Toyota: ['Yaris', 'Corolla', 'RAV4', 'C-HR', 'Camry'],
  Hyundai: ['i20', 'i30', 'Tucson', 'Kona', 'Santa Fe'],
  Kia: ['Rio', 'Ceed', 'Sportage', 'Niro', 'Sorento'],
  Citroën: ['C3', 'C4', 'C5 Aircross', 'Berlingo'],
  Fiat: ['500', 'Panda', 'Tipo', '500X'],
  Skoda: ['Fabia', 'Octavia', 'Karoq', 'Kodiaq', 'Superb'],
};

const emptyForm = (): CompatibilityForm => ({
  referenciaPieza: '', nombrePieza: '', marcaVehiculo: MARCAS_VEHICULO[0], modelo: '',
  anioDesde: 2020, anioHasta: 2026, motorizacion: '', referenciaOE: '', notas: '',
});

export function SparePartsCompatibility() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<Compatibility>('spareparts', 'compatibility'), []);
  const userId = user?.user_id || user?.id || '';

  const [items, setItems] = useState<Compatibility[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterMarca, setFilterMarca] = useState('');
  const [filterModelo, setFilterModelo] = useState('');
  const [filterAnio, setFilterAnio] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Compatibility | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'part', label: 'Recambio' },
    { key: 'vehicle', label: 'Vehículo' },
    { key: 'brand', label: 'Marca' },
    { key: 'model', label: 'Modelo' },
    { key: 'years', label: 'Años' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'part', label: 'Recambio', example: '' },
    { key: 'vehicle', label: 'Vehículo', example: '' },
    { key: 'brand', label: 'Marca', example: '' },
    { key: 'model', label: 'Modelo', example: '' },
    { key: 'years', label: 'Años', example: '' },
  ];

  const persistEntries = async (entries: Record<string, unknown>[]) => {
    if (!userId) {
      toast.error('Sesión no válida');
      return;
    }
    const created = await bulkCreateVerticalEntries(userId, api, entries, (e) => {
    const referenciaPieza = entryStr(e, 'referenciaPieza');
    if (!referenciaPieza) return null;
    return {
      referenciaPieza,
      nombrePieza: entryStr(e, 'nombrePieza') || '',
      marcaVehiculo: entryStr(e, 'marcaVehiculo'),
      modelo: entryStr(e, 'modelo', 'model') || '',
      anioDesde: entryNum(e, 'anioDesde'),
      anioHasta: entryNum(e, 'anioHasta'),
      motorizacion: entryStr(e, 'motorizacion') || '',
      referenciaOE: entryStr(e, 'referenciaOE') || '',
      notas: entryStr(e, 'notas', 'notes', 'description') || '',
    };
    });
    if (created > 0) {
      await loadData();
      toast.success(`${created} compatibilidad creado(s)`);
    } else {
      toast.error('No se pudo crear ningún registro');
    }
  };

  const handleAIEntries = persistEntries;
  const handleImportEntries = async (entries: Record<string, string>[]) => persistEntries(entries);

  useModalClose(showModal, () => setShowModal(false));

  const loadData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await api.list(userId);
      setItems(list);
    } finally {
      setLoading(false);
    }
  }, [userId, api]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = items.filter(i => {
    const s = search.toLowerCase();
    const matchSearch = !s || i.referenciaPieza.toLowerCase().includes(s) || i.nombrePieza.toLowerCase().includes(s) || i.referenciaOE.toLowerCase().includes(s);
    const matchMarca = !filterMarca || i.marcaVehiculo === filterMarca;
    const matchModelo = !filterModelo || i.modelo === filterModelo;
    const matchAnio = !filterAnio || (parseInt(filterAnio) >= i.anioDesde && parseInt(filterAnio) <= i.anioHasta);
    return matchSearch && matchMarca && matchModelo && matchAnio;
  });

  const refsConCompat = new Set(items.map(i => i.referenciaPieza)).size;
  const vehiculosCubiertos = new Set(items.map(i => `${i.marcaVehiculo}-${i.modelo}`)).size;
  const marcasCubiertas = new Set(items.map(i => i.marcaVehiculo)).size;

  const modelosDisponibles = filterMarca ? (MODELOS_POR_MARCA[filterMarca] || []) : [];

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setShowModal(true); };
  const openEdit = (item: Compatibility) => {
    setEditing(item);
    setForm({
      referenciaPieza: item.referenciaPieza,
      nombrePieza: item.nombrePieza,
      marcaVehiculo: item.marcaVehiculo,
      modelo: item.modelo,
      anioDesde: item.anioDesde,
      anioHasta: item.anioHasta,
      motorizacion: item.motorizacion,
      referenciaOE: item.referenciaOE,
      notas: item.notas,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!userId || !form.referenciaPieza || !form.nombrePieza) return;
    try {
      if (editing) {
        await api.update(userId, editing._id, form);
      } else {
        await api.create(userId, form);
      }
      await loadData();
      setShowModal(false);
    } catch {
      /* error from fetch */
    }
  };

  const handleDelete = async (docId: string) => {
    if (!userId) return;
    try {
      await api.remove(userId, docId);
      await loadData();
    } catch {
      /* error from fetch */
    }
  };

  const stats = [
    { label: 'Refs. con Compatibilidad', value: refsConCompat, icon: <Link2 className="w-5 h-5 text-blue-500" />, bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Vehículos Cubiertos', value: vehiculosCubiertos, icon: <Car className="w-5 h-5 text-emerald-500" />, bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'Marcas Vehículo', value: marcasCubiertas, icon: <Tag className="w-5 h-5 text-amber-500" />, bg: 'bg-amber-50 dark:bg-amber-900/30' },
    { label: 'Total Registros', value: items.length, icon: <Layers className="w-5 h-5 text-purple-500" />, bg: 'bg-purple-50 dark:bg-purple-900/30' },
  ];

  return (
    <Layout title="Compatibilidades de Vehículos">
      <div className="space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map(s => (
            <div key={s.label} className={`${s.bg} rounded-xl p-4 flex items-center gap-3`}>
              <div className="p-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm">{s.icon}</div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{s.label}</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">{s.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Vehicle search */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Car className="w-4 h-4 text-blue-500" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Buscar por Vehículo</h3>
          </div>
          <div className="flex flex-wrap gap-3">
            <select value={filterMarca} onChange={e => { setFilterMarca(e.target.value); setFilterModelo(''); }} disabled={loading} className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100">
              <option value="">Marca vehículo</option>
              {MARCAS_VEHICULO.map(m => <option key={m}>{m}</option>)}
            </select>
            <select value={filterModelo} onChange={e => setFilterModelo(e.target.value)} disabled={!filterMarca || loading} className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100 disabled:opacity-50">
              <option value="">Modelo</option>
              {modelosDisponibles.map(m => <option key={m}>{m}</option>)}
            </select>
            <input type="number" placeholder="Año" value={filterAnio} onChange={e => setFilterAnio(e.target.value)} disabled={loading} className="w-24 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100" />
            {(filterMarca || filterModelo || filterAnio) && (
              <button onClick={() => { setFilterMarca(''); setFilterModelo(''); setFilterAnio(''); }} className="px-3 py-2 text-xs text-red-600 hover:text-red-700 font-medium flex items-center gap-1"><X className="w-3.5 h-3.5" /> Limpiar</button>
            )}
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar referencia, nombre, OE..." disabled={loading} className="pl-9 pr-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm w-64 focus:ring-2 focus:ring-blue-500 dark:text-gray-100" />
          </div>
          <AddButtonDropdown
                label="Nueva compatibilidad"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de compatibilidad"
              />
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Ref. Pieza</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Nombre</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Marca</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Modelo</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Años</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Motorización</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Ref. OE</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Notas</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                    <span className="inline-flex items-center justify-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Cargando…
                    </span>
                  </td>
                </tr>
              ) : filtered.map(item => (
                <tr key={item._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-blue-600 dark:text-blue-400">{item.referenciaPieza}</td>
                  <td className="px-4 py-3 text-gray-900 dark:text-gray-100">{item.nombrePieza}</td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{item.marcaVehiculo}</td>
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{item.modelo}</td>
                  <td className="px-4 py-3 text-center text-xs text-gray-600 dark:text-gray-400">{item.anioDesde}–{item.anioHasta}</td>
                  <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">{item.motorizacion}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">{item.referenciaOE}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 max-w-[120px] truncate">{item.notas}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => openEdit(item)} className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 transition-colors"><Edit3 className="w-4 h-4" /></button>
                      <button onClick={() => void handleDelete(item._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400">No se encontraron compatibilidades</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Modal */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowModal(false)}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Editar Compatibilidad' : 'Nueva Compatibilidad'}</h3>
                <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X className="w-5 h-5 text-gray-500" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Ref. Pieza *</label>
                    <input value={form.referenciaPieza} onChange={e => setForm({ ...form, referenciaPieza: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Ref. OE</label>
                    <input value={form.referenciaOE} onChange={e => setForm({ ...form, referenciaOE: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nombre Pieza *</label>
                  <input value={form.nombrePieza} onChange={e => setForm({ ...form, nombrePieza: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Marca Vehículo</label>
                    <select value={form.marcaVehiculo} onChange={e => setForm({ ...form, marcaVehiculo: e.target.value, modelo: '' })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100">
                      {MARCAS_VEHICULO.map(m => <option key={m}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Modelo</label>
                    <select value={form.modelo} onChange={e => setForm({ ...form, modelo: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100">
                      <option value="">Seleccionar...</option>
                      {(MODELOS_POR_MARCA[form.marcaVehiculo] || []).map(m => <option key={m}>{m}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Año Desde</label>
                    <input type="number" value={form.anioDesde} onChange={e => setForm({ ...form, anioDesde: parseInt(e.target.value) || 2000 })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Año Hasta</label>
                    <input type="number" value={form.anioHasta} onChange={e => setForm({ ...form, anioHasta: parseInt(e.target.value) || 2026 })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Motorización</label>
                  <input value={form.motorizacion} onChange={e => setForm({ ...form, motorizacion: e.target.value })} placeholder="Ej: 1.6 TDI 105CV" className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Notas</label>
                  <textarea value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })} rows={2} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100 resize-none" />
                </div>
              </div>
              <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex justify-end gap-2 p-5 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
                <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Cancelar</button>
                <button type="button" onClick={() => void handleSave()} className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium"><Save className="w-4 h-4" /> Guardar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="spareparts_compat"
        moduleLabel="Compatibilidades"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Compatibilidades"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
