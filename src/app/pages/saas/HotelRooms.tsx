import { useState, useMemo, useCallback, useEffect } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { useModalClose } from '../../hooks/useModalClose';
import {
  Search, Plus, X, BedDouble, CheckCircle, Paintbrush, Wrench, Loader2,
  Edit3, Trash2, Filter, ChevronDown, Wifi, Tv, Wind, Coffee,
  Bath, Car, UtensilsCrossed, Dumbbell,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { bulkCreateVerticalEntries, entryStr, entryNum } from '../../lib/bulkVerticalImport';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

type RoomType = 'individual' | 'doble' | 'suite' | 'familiar' | 'penthouse';
type RoomStatus = 'disponible' | 'ocupada' | 'limpieza' | 'mantenimiento';

interface Room extends VerticalEntity {
  number: string;
  tipo: RoomType;
  floor: number;
  pricePerNight: number;
  status: RoomStatus;
  amenities: string[];
}

type RoomForm = Omit<Room, keyof VerticalEntity>;

const TYPE_LABELS: Record<RoomType, string> = {
  individual: 'Individual', doble: 'Doble', suite: 'Suite', familiar: 'Familiar', penthouse: 'Penthouse',
};

const STATUS_CFG: Record<RoomStatus, { label: string; bg: string; text: string; icon: React.ReactNode }> = {
  disponible:    { label: 'Disponible',    bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-700 dark:text-emerald-300', icon: <CheckCircle className="w-4 h-4" /> },
  ocupada:       { label: 'Ocupada',       bg: 'bg-red-100 dark:bg-red-900/40',         text: 'text-red-700 dark:text-red-300',         icon: <BedDouble className="w-4 h-4" /> },
  limpieza:      { label: 'Limpieza',      bg: 'bg-amber-100 dark:bg-amber-900/40',     text: 'text-amber-700 dark:text-amber-300',     icon: <Paintbrush className="w-4 h-4" /> },
  mantenimiento: { label: 'Mantenimiento', bg: 'bg-gray-200 dark:bg-gray-700',          text: 'text-gray-700 dark:text-gray-300',       icon: <Wrench className="w-4 h-4" /> },
};

const AMENITY_ICONS: Record<string, React.ReactNode> = {
  WiFi: <Wifi className="w-3.5 h-3.5" />, TV: <Tv className="w-3.5 h-3.5" />,
  'A/C': <Wind className="w-3.5 h-3.5" />, Minibar: <Coffee className="w-3.5 h-3.5" />,
  Jacuzzi: <Bath className="w-3.5 h-3.5" />, Parking: <Car className="w-3.5 h-3.5" />,
  Cocina: <UtensilsCrossed className="w-3.5 h-3.5" />, Gym: <Dumbbell className="w-3.5 h-3.5" />,
};
const ALL_AMENITIES = Object.keys(AMENITY_ICONS);

const EMPTY: RoomForm = { number: '', tipo: 'individual', floor: 1, pricePerNight: 0, status: 'disponible', amenities: [] };

export function HotelRooms() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<Room>('hotel', 'rooms'), []);
  const userId = user?.user_id || user?.id || '';

  const [data, setData] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<RoomStatus | ''>('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Room | null>(null);
  const [form, setForm] = useState<RoomForm>(EMPTY);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'number', label: 'Número' },
    { key: 'type', label: 'Tipo' },
    { key: 'floor', label: 'Planta' },
    { key: 'capacity', label: 'Capacidad' },
    { key: 'price', label: 'Precio' },
    { key: 'status', label: 'Estado' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'number', label: 'Número', required: true, example: '' },
    { key: 'type', label: 'Tipo', example: '' },
    { key: 'floor', label: 'Planta', example: '' },
    { key: 'capacity', label: 'Capacidad', example: '' },
    { key: 'price', label: 'Precio', example: '' },
    { key: 'status', label: 'Estado', example: '' },
  ];

  const persistEntries = async (entries: Record<string, unknown>[]) => {
    if (!userId) {
      toast.error('Sesión no válida');
      return;
    }
    const created = await bulkCreateVerticalEntries(userId, api, entries, (e) => {
    const number = entryStr(e, 'number', 'numero', 'name', 'nombre');
    if (!number) return null;
    return {
      number,
      tipo: entryStr(e, 'tipo', 'type') || 'individual',
      floor: entryNum(e, 'floor'),
      pricePerNight: entryNum(e, 'pricePerNight'),
      status: entryStr(e, 'status') || 'disponible',
      amenities: [],
    };
    });
    if (created > 0) {
      await loadData();
      toast.success(`${created} habitación creado(s)`);
    } else {
      toast.error('No se pudo crear ningún registro');
    }
  };

  const handleAIEntries = persistEntries;
  const handleImportEntries = async (entries: Record<string, string>[]) => persistEntries(entries);

  useModalClose(modalOpen, () => setModalOpen(false));

  const loadData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await api.list(userId);
      setData(list);
    } finally {
      setLoading(false);
    }
  }, [userId, api]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = data.filter(r => {
    const matchSearch = r.number.includes(search) || TYPE_LABELS[r.tipo].toLowerCase().includes(search.toLowerCase());
    const matchStatus = !filterStatus || r.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const stats = {
    total: data.length,
    available: data.filter(r => r.status === 'disponible').length,
    occupied: data.filter(r => r.status === 'ocupada').length,
    cleaning: data.filter(r => r.status === 'limpieza').length,
  };

  const openCreate = () => { setEditing(null); setForm(EMPTY); setModalOpen(true); };
  const openEdit = (r: Room) => { setEditing(r); setForm({ number: r.number, tipo: r.tipo, floor: r.floor, pricePerNight: r.pricePerNight, status: r.status, amenities: [...r.amenities] }); setModalOpen(true); };

  const save = async () => {
    if (!userId) return;
    try {
      if (editing) {
        await api.update(userId, editing._id, form);
      } else {
        await api.create(userId, form);
      }
      await loadData();
      setModalOpen(false);
    } catch {
      /* error from fetch */
    }
  };

  const remove = async (docId: string) => {
    if (!userId) return;
    try {
      await api.remove(userId, docId);
      await loadData();
    } catch {
      /* error from fetch */
    }
  };

  const toggleAmenity = (a: string) => {
    setForm(f => ({ ...f, amenities: f.amenities.includes(a) ? f.amenities.filter(x => x !== a) : [...f.amenities, a] }));
  };

  return (
    <Layout title="Habitaciones">
      <div className="space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Object.entries(STATUS_CFG).map(([key, cfg]) => {
            const val = key === 'disponible' ? stats.available : key === 'ocupada' ? stats.occupied : key === 'limpieza' ? stats.cleaning : data.filter(r => r.status === key).length;
            return (
              <div key={key} className={`${cfg.bg} rounded-xl p-4 flex items-center gap-3`}>
                <div className={cfg.text}>{cfg.icon}</div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{cfg.label}</p>
                  <p className={`text-2xl font-bold ${cfg.text}`}>{val}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative flex-1 max-w-md w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar habitación o tipo..." disabled={loading} className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-blue-500 outline-none dark:text-gray-100" />
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as RoomStatus | '')} disabled={loading} className="pl-9 pr-8 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm appearance-none dark:text-gray-100">
                <option value="">Todos los estados</option>
                {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
            <AddButtonDropdown
                label="Nueva habitación"
                onQuickAdd={openCreate}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de habitación"
              />
          </div>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {loading ? (
            <div className="col-span-full flex items-center justify-center gap-2 py-12 text-gray-500 dark:text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin" />
              Cargando…
            </div>
          ) : filtered.map(r => {
            const st = STATUS_CFG[r.status];
            return (
              <div key={r._id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-md transition-shadow">
                <div className={`${st.bg} px-4 py-2 flex items-center justify-between`}>
                  <span className={`text-xs font-semibold ${st.text} flex items-center gap-1.5`}>{st.icon} {st.label}</span>
                  <span className="text-xs font-mono text-gray-500 dark:text-gray-400">Planta {r.floor}</span>
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">#{r.number}</span>
                    <span className="text-sm font-medium px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">{TYPE_LABELS[r.tipo]}</span>
                  </div>
                  <p className="text-lg font-semibold text-blue-600 dark:text-blue-400">{r.pricePerNight} €<span className="text-xs font-normal text-gray-500 dark:text-gray-400"> /noche</span></p>
                  <div className="flex flex-wrap gap-1.5">
                    {r.amenities.map(a => (
                      <span key={a} className="inline-flex items-center gap-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full">
                        {AMENITY_ICONS[a]} {a}
                      </span>
                    ))}
                  </div>
                  <div className="flex justify-end gap-1 pt-2 border-t border-gray-100 dark:border-gray-700">
                    <button onClick={() => openEdit(r)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"><Edit3 className="w-4 h-4" /></button>
                    <button onClick={() => void remove(r._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-red-500"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>
            );
          })}
          {!loading && filtered.length === 0 && (
            <div className="col-span-full text-center py-12 text-gray-400 dark:text-gray-500">No se encontraron habitaciones</div>
          )}
        </div>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setModalOpen(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{editing ? 'Editar habitación' : 'Nueva habitación'}</h3>
              <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Número</label>
                <input value={form.number} onChange={e => setForm({ ...form, number: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo</label>
                  <select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value as RoomType })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100">
                    {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Planta</label>
                  <input type="number" value={form.floor} onChange={e => setForm({ ...form, floor: Number(e.target.value) })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Precio/noche (€)</label>
                  <input type="number" value={form.pricePerNight} onChange={e => setForm({ ...form, pricePerNight: Number(e.target.value) })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Estado</label>
                  <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as RoomStatus })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100">
                    {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Amenities</label>
                <div className="flex flex-wrap gap-2">
                  {ALL_AMENITIES.map(a => (
                    <button key={a} type="button" onClick={() => toggleAmenity(a)}
                      className={`inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-full border transition-colors ${form.amenities.includes(a) ? 'bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300' : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400'}`}>
                      {AMENITY_ICONS[a]} {a}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Cancelar</button>
              <button type="button" onClick={() => void save()} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors">Guardar</button>
            </div>
          </div>
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="hotel_rooms"
        moduleLabel="Habitaciones"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Habitaciones"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
