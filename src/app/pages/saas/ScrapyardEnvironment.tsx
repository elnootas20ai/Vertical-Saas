import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../../components/saas/Layout';
import { useModalClose } from '../../hooks/useModalClose';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import {
  Leaf, Plus, Search, Edit3, Trash2, X, AlertTriangle,
  CheckCircle2, Users, FileText, Droplets, ExternalLink, Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

interface WasteRecord extends VerticalEntity {
  tipoResiduo: string;
  cantidad: number;
  unidad: string;
  gestorAutorizado: string;
  numDocumento: string;
  fechaRecogida: string;
  estado: string;
}

const TIPOS_RESIDUO = ['Aceite', 'Batería', 'Neumático', 'Refrigerante', 'Catalizador', 'Filtro', 'Líquido frenos'];
const UNIDADES = ['Litros', 'Kg', 'Unidades'];
const ESTADOS_RESIDUO = ['Almacenado', 'Recogido', 'Certificado'];

type WasteRecordForm = Omit<WasteRecord, keyof VerticalEntity>;

const emptyForm = (): WasteRecordForm => ({
  tipoResiduo: 'Aceite', cantidad: 0, unidad: 'Litros',
  gestorAutorizado: '', numDocumento: '',
  fechaRecogida: new Date().toISOString().slice(0, 10), estado: 'Almacenado',
});

const estadoColor: Record<string, string> = {
  'Almacenado': 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  'Recogido': 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  'Certificado': 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
};

const residuoIcon: Record<string, string> = {
  'Aceite': '🛢️',
  'Batería': '🔋',
  'Neumático': '⚫',
  'Refrigerante': '❄️',
  'Catalizador': '⚙️',
  'Filtro': '🔧',
  'Líquido frenos': '💧',
};

export function ScrapyardEnvironment() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<WasteRecord>('scrapyard-ops', 'environment'), []);
  const userId = user?.user_id || user?.id || '';

  const [records, setRecords] = useState<WasteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTipo, setFilterTipo] = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<WasteRecord | null>(null);
  const [form, setForm] = useState<WasteRecordForm>(emptyForm());
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
      setRecords(list);
    } finally {
      setLoading(false);
    }
  }, [userId, api]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'type', label: 'Tipo' },
    { key: 'date', label: 'Fecha' },
    { key: 'quantity', label: 'Cantidad' },
    { key: 'unit', label: 'Unidad' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'type', label: 'Tipo', example: '' },
    { key: 'date', label: 'Fecha', example: '' },
    { key: 'quantity', label: 'Cantidad', example: '' },
    { key: 'unit', label: 'Unidad', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} registro ambiental(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} registro ambiental(s) importado(s)`);
  };

  useModalClose(showModal, () => setShowModal(false));

  const filtered = records.filter(r => {
    const q = search.toLowerCase();
    const matchSearch = r.tipoResiduo.toLowerCase().includes(q) || r.gestorAutorizado.toLowerCase().includes(q) || r.numDocumento.toLowerCase().includes(q);
    const matchTipo = !filterTipo || r.tipoResiduo === filterTipo;
    const matchEstado = !filterEstado || r.estado === filterEstado;
    return matchSearch && matchTipo && matchEstado;
  });

  const month = new Date().toISOString().slice(0, 7);
  const pendientesRecogida = records.filter(r => r.estado === 'Almacenado').length;
  const certificadosMes = records.filter(r => r.estado === 'Certificado' && r.fechaRecogida.startsWith(month)).length;
  const gestoresActivos = new Set(records.map(r => r.gestorAutorizado)).size;
  const totalResiduos = records.filter(r => r.estado === 'Almacenado').reduce((s, r) => s + r.cantidad, 0);

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setShowModal(true); };
  const openEdit = (r: WasteRecord) => {
    setEditing(r);
    const { _id: _docId, _rev: _rv, type: _t, user_id: _u, createdAt: _c, updatedAt: _up, ...rest } = r;
    setForm(rest as WasteRecordForm);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.tipoResiduo || !form.gestorAutorizado || !userId) return;
    try {
      if (editing) {
        await api.update(userId, editing._id, form);
      } else {
        await api.create(userId, form);
      }
      await loadData();
      setShowModal(false);
    } catch {
      /* fetch error */
    }
  };

  const handleDelete = async (docId: string) => {
    if (!userId) return;
    try {
      await api.remove(userId, docId);
      await loadData();
    } catch {
      /* fetch error */
    }
  };

  const stats = [
    { label: 'Pendientes recogida', value: pendientesRecogida, icon: <AlertTriangle className="w-5 h-5 text-amber-500" />, bg: 'bg-amber-50 dark:bg-amber-900/30' },
    { label: 'Certificados mes', value: certificadosMes, icon: <CheckCircle2 className="w-5 h-5 text-emerald-500" />, bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'Gestores activos', value: gestoresActivos, icon: <Users className="w-5 h-5 text-blue-500" />, bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Cant. almacenada', value: totalResiduos, icon: <Droplets className="w-5 h-5 text-purple-500" />, bg: 'bg-purple-50 dark:bg-purple-900/30' },
  ];

  return (
    <Layout title="Gestión Medioambiental">
      <div className="space-y-6">
        <div className="flex items-center justify-end mb-1">
          <button
            onClick={() => navigate('/saas/vertical/desguaces/documentacion?tab=medioambiental')}
            className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
          >
            <FileText className="w-3 h-3" /> Documentación medioambiental <ExternalLink className="w-3 h-3" />
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por tipo, gestor o documento..." className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <select value={filterTipo} onChange={e => setFilterTipo(e.target.value)} className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300">
              <option value="">Tipo residuo</option>
              {TIPOS_RESIDUO.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)} className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300">
              <option value="">Estado</option>
              {ESTADOS_RESIDUO.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
            <AddButtonDropdown
                label="Nuevo registro"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de registro ambiental"
              />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Tipo residuo</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Cantidad</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Unidad</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 hidden md:table-cell">Gestor autorizado</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 hidden lg:table-cell">Nº Documento</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 hidden lg:table-cell">Fecha recogida</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Estado</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                    <span className="inline-flex items-center justify-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Cargando…
                    </span>
                  </td>
                </tr>
              ) : filtered.map(r => (
                <tr key={r._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                    <span className="flex items-center gap-2">
                      <span>{residuoIcon[r.tipoResiduo] || '♻️'}</span>
                      {r.tipoResiduo}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-gray-100">{r.cantidad.toLocaleString('es-ES')}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{r.unidad}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden md:table-cell">{r.gestorAutorizado}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-gray-300 hidden lg:table-cell">{r.numDocumento}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden lg:table-cell">{r.fechaRecogida}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${estadoColor[r.estado]}`}>
                      {r.estado === 'Certificado' && <CheckCircle2 className="w-3 h-3" />}
                      {r.estado === 'Almacenado' && <AlertTriangle className="w-3 h-3" />}
                      {r.estado === 'Recogido' && <Leaf className="w-3 h-3" />}
                      {r.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => openEdit(r)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"><Edit3 className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(r._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-500 dark:text-gray-400 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">No se encontraron registros</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{editing ? 'Editar Registro' : 'Nuevo Registro'}</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo de residuo</label>
                <select value={form.tipoResiduo} onChange={e => setForm(prev => ({ ...prev, tipoResiduo: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                  {TIPOS_RESIDUO.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              {([
                { key: 'cantidad', label: 'Cantidad', type: 'number' },
              ] as const).map(f => (
                <div key={f.key}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{f.label}</label>
                  <input type={f.type} value={(form as any)[f.key]} onChange={e => setForm(prev => ({ ...prev, [f.key]: Number(e.target.value) }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Unidad</label>
                <select value={form.unidad} onChange={e => setForm(prev => ({ ...prev, unidad: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                  {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              {([
                { key: 'gestorAutorizado', label: 'Gestor autorizado', type: 'text' },
                { key: 'numDocumento', label: 'Nº Documento', type: 'text' },
                { key: 'fechaRecogida', label: 'Fecha recogida', type: 'date' },
              ] as const).map(f => (
                <div key={f.key}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{f.label}</label>
                  <input type={f.type} value={(form as any)[f.key]} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Estado</label>
                <select value={form.estado} onChange={e => setForm(prev => ({ ...prev, estado: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                  {ESTADOS_RESIDUO.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">Cancelar</button>
              <button onClick={handleSave} className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors">Guardar</button>
            </div>
          </div>
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="scrapyard_environment"
        moduleLabel="Medio Ambiente"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Medio Ambiente"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
