import { useState, useMemo, useCallback, useEffect } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { useModalClose } from '../../hooks/useModalClose';
import {
  Building2, Plus, Search, Edit3, Trash2, X, CheckCircle,
  AlertCircle, Wrench, Stethoscope, Siren, FlaskConical,
  Monitor, Wifi, Thermometer, LayoutGrid, List,
  Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { bulkCreateVerticalEntries, entryStr, entryNum } from '../../lib/bulkVerticalImport';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

type RoomType = 'consulta_general' | 'especialidad' | 'urgencias' | 'laboratorio';
type RoomStatus = 'disponible' | 'ocupada' | 'mantenimiento';

interface Room extends VerticalEntity {
  nombre: string;
  tipo: RoomType;
  equipamiento: string[];
  doctorAsignado: string;
  estado: RoomStatus;
}

type RoomForm = Omit<Room, keyof VerticalEntity>;

const TYPE_CONFIG: Record<RoomType, { label: string; icon: React.ReactNode }> = {
  consulta_general: { label: 'Consulta General', icon: <Stethoscope className="w-4 h-4" /> },
  especialidad: { label: 'Especialidad', icon: <Monitor className="w-4 h-4" /> },
  urgencias: { label: 'Urgencias', icon: <Siren className="w-4 h-4" /> },
  laboratorio: { label: 'Laboratorio', icon: <FlaskConical className="w-4 h-4" /> },
};

const STATUS_CONFIG: Record<RoomStatus, { label: string; bg: string; text: string; dot: string }> = {
  disponible: { label: 'Disponible', bg: 'bg-emerald-50 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
  ocupada: { label: 'Ocupada', bg: 'bg-red-50 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', dot: 'bg-red-500' },
  mantenimiento: { label: 'Mantenimiento', bg: 'bg-amber-50 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-500' },
};

const emptyForm = (): RoomForm => ({
  nombre: '', tipo: 'consulta_general', equipamiento: [], doctorAsignado: '', estado: 'disponible',
});

export function ClinicRooms() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<Room>('clinic', 'rooms'), []);
  const userId = user?.user_id || user?.id || '';

  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<RoomStatus | ''>('');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Room | null>(null);
  const [form, setForm] = useState<RoomForm>(emptyForm());
  const [equipInput, setEquipInput] = useState('');
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const loadData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await api.list(userId);
      setRooms(list.map(r => {
        let eq = r.equipamiento;
        if (typeof eq === 'string') {
          try {
            const parsed = JSON.parse(eq);
            eq = Array.isArray(parsed) ? parsed : eq.split(',').map(s => s.trim()).filter(Boolean);
          } catch {
            eq = eq.split(',').map(s => s.trim()).filter(Boolean);
          }
        }
        if (!Array.isArray(eq)) eq = [];
        return { ...r, equipamiento: eq as string[] };
      }));
    } finally {
      setLoading(false);
    }
  }, [userId, api]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'type', label: 'Tipo' },
    { key: 'capacity', label: 'Capacidad' },
    { key: 'equipment', label: 'Equipamiento' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: '' },
    { key: 'type', label: 'Tipo', example: '' },
    { key: 'capacity', label: 'Capacidad', example: '' },
    { key: 'equipment', label: 'Equipamiento', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const persistEntries = async (entries: Record<string, unknown>[]) => {
    if (!userId) {
      toast.error('Sesión no válida');
      return;
    }
    const created = await bulkCreateVerticalEntries(userId, api, entries, (e) => {
    const nombre = entryStr(e, 'nombre', 'name');
    if (!nombre) return null;
    return {
      nombre,
      tipo: entryStr(e, 'tipo', 'type') || 'consulta_general',
      equipamiento: [],
      doctorAsignado: entryStr(e, 'doctorAsignado') || '',
      estado: entryStr(e, 'estado', 'status') || 'disponible',
    };
    });
    if (created > 0) {
      await loadData();
      toast.success(`${created} sala creado(s)`);
    } else {
      toast.error('No se pudo crear ningún registro');
    }
  };

  const handleAIEntries = persistEntries;
  const handleImportEntries = async (entries: Record<string, string>[]) => persistEntries(entries);

  useModalClose(showModal, () => setShowModal(false));

  const filtered = rooms.filter(r => {
    const matchSearch = r.nombre.toLowerCase().includes(search.toLowerCase()) || r.doctorAsignado.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !filterStatus || r.estado === filterStatus;
    return matchSearch && matchStatus;
  });

  const disponibles = rooms.filter(r => r.estado === 'disponible').length;
  const ocupadas = rooms.filter(r => r.estado === 'ocupada').length;

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setEquipInput(''); setShowModal(true); };
  const openEdit = (r: Room) => {
    setEditing(r);
    setForm({
      nombre: r.nombre, tipo: r.tipo, equipamiento: [...r.equipamiento], doctorAsignado: r.doctorAsignado, estado: r.estado,
    });
    setEquipInput(r.equipamiento.join(', '));
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.nombre || !userId) return;
    const equip = equipInput.split(',').map(s => s.trim()).filter(Boolean);
    const toSave = { ...form, equipamiento: equip };
    try {
      if (editing) {
        await api.update(userId, editing._id, toSave);
      } else {
        await api.create(userId, toSave);
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
    { label: 'Total salas', value: rooms.length, icon: <Building2 className="w-5 h-5 text-blue-500" />, bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Disponibles', value: disponibles, icon: <CheckCircle className="w-5 h-5 text-emerald-500" />, bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'Ocupadas', value: ocupadas, icon: <AlertCircle className="w-5 h-5 text-red-500" />, bg: 'bg-red-50 dark:bg-red-900/30' },
  ];

  return (
    <Layout title="Consultorios">
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {stats.map(s => (
            <div key={s.label} className={`${s.bg} rounded-xl p-4 flex items-center gap-4`}>
              <div className="p-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm">{s.icon}</div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{s.value}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative flex-1 max-w-md w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar sala o doctor..." className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div className="flex gap-2 items-center">
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)} className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300">
              <option value="">Todos los estados</option>
              {(Object.entries(STATUS_CONFIG) as [RoomStatus, typeof STATUS_CONFIG[RoomStatus]][]).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <div className="flex border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <button onClick={() => setViewMode('cards')} className={`p-2 ${viewMode === 'cards' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600' : 'bg-white dark:bg-gray-800 text-gray-500'}`}><LayoutGrid className="w-4 h-4" /></button>
              <button onClick={() => setViewMode('table')} className={`p-2 ${viewMode === 'table' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600' : 'bg-white dark:bg-gray-800 text-gray-500'}`}><List className="w-4 h-4" /></button>
            </div>
            <AddButtonDropdown
                label="Nueva Sala"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de sala"
              />
          </div>
        </div>

        {viewMode === 'cards' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {loading ? (
              <div className="col-span-full py-12 text-center text-gray-500 dark:text-gray-400">
                <span className="inline-flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Cargando…
                </span>
              </div>
            ) : filtered.map(r => {
              const tc = TYPE_CONFIG[r.tipo];
              const sc = STATUS_CONFIG[r.estado];
              return (
                <div key={r._id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 flex flex-col gap-3 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-600 dark:text-gray-300">{tc.icon}</div>
                      <div>
                        <h4 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{r.nombre}</h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{tc.label}</p>
                      </div>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${sc.bg} ${sc.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />{sc.label}
                    </span>
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">Doctor: <span className="font-normal">{r.doctorAsignado}</span></p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {r.equipamiento.map((eq, i) => (
                        <span key={i} className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">{eq}</span>
                      ))}
                    </div>
                  </div>
                  <div className="flex justify-end gap-1 mt-auto pt-2 border-t border-gray-100 dark:border-gray-700/50">
                    <button onClick={() => openEdit(r)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"><Edit3 className="w-4 h-4" /></button>
                    <button onClick={() => void handleDelete(r._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              );
            })}
            {!loading && filtered.length === 0 && (
              <div className="col-span-full py-12 text-center text-gray-400 dark:text-gray-500">No se encontraron salas</div>
            )}
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Nombre</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Tipo</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 hidden md:table-cell">Equipamiento</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Doctor</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Estado</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                      <span className="inline-flex items-center justify-center gap-2">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Cargando…
                      </span>
                    </td>
                  </tr>
                ) : filtered.map(r => {
                  const tc = TYPE_CONFIG[r.tipo];
                  const sc = STATUS_CONFIG[r.estado];
                  return (
                    <tr key={r._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{r.nombre}</td>
                      <td className="px-4 py-3"><span className="inline-flex items-center gap-1 text-gray-600 dark:text-gray-300">{tc.icon}{tc.label}</span></td>
                      <td className="px-4 py-3 hidden md:table-cell"><div className="flex flex-wrap gap-1">{r.equipamiento.slice(0, 3).map((eq, i) => <span key={i} className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-xs text-gray-600 dark:text-gray-400">{eq}</span>)}{r.equipamiento.length > 3 && <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-xs text-gray-500">+{r.equipamiento.length - 3}</span>}</div></td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{r.doctorAsignado}</td>
                      <td className="px-4 py-3"><span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${sc.bg} ${sc.text}`}><span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />{sc.label}</span></td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => openEdit(r)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"><Edit3 className="w-4 h-4" /></button>
                          <button onClick={() => void handleDelete(r._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!loading && filtered.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">No se encontraron salas</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{editing ? 'Editar Sala' : 'Nueva Sala'}</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre de la sala</label>
                <input value={form.nombre} onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo</label>
                  <select value={form.tipo} onChange={e => setForm(p => ({ ...p, tipo: e.target.value as RoomType }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                    {(Object.entries(TYPE_CONFIG) as [RoomType, typeof TYPE_CONFIG[RoomType]][]).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Estado</label>
                  <select value={form.estado} onChange={e => setForm(p => ({ ...p, estado: e.target.value as RoomStatus }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                    {(Object.entries(STATUS_CONFIG) as [RoomStatus, typeof STATUS_CONFIG[RoomStatus]][]).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Doctor asignado</label>
                <input value={form.doctorAsignado} onChange={e => setForm(p => ({ ...p, doctorAsignado: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Equipamiento (separado por comas)</label>
                <textarea rows={3} value={equipInput} onChange={e => setEquipInput(e.target.value)} placeholder="Camilla, Tensiómetro, ECG..." className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none" />
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">Cancelar</button>
              <button onClick={() => void handleSave()} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">Guardar</button>
            </div>
          </div>
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="clinic_rooms"
        moduleLabel="Salas"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Salas"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
