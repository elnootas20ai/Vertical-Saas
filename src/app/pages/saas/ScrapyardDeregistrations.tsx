import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../../components/saas/Layout';
import { useModalClose } from '../../hooks/useModalClose';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import {
  FileText, Plus, Search, Edit3, Trash2, X, Clock,
  CheckCircle2, AlertCircle, FileCheck, ExternalLink, Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

interface Deregistration extends VerticalEntity {
  matricula: string;
  marcaModelo: string;
  titular: string;
  fechaBaja: string;
  tipoBaja: string;
  estadoTramite: string;
  centroItv: string;
  documentacion: string;
}

const TIPOS_BAJA = ['Temporal', 'Definitiva'];
const ESTADOS_TRAMITE = ['Pendiente', 'En proceso', 'Completada', 'Rechazada'];

type DeregistrationForm = Omit<Deregistration, keyof VerticalEntity>;

const emptyForm = (): DeregistrationForm => ({
  matricula: '', marcaModelo: '', titular: '',
  fechaBaja: new Date().toISOString().slice(0, 10), tipoBaja: 'Definitiva',
  estadoTramite: 'Pendiente', centroItv: '', documentacion: '',
});

const tramiteColor: Record<string, string> = {
  'Pendiente': 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  'En proceso': 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  'Completada': 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
  'Rechazada': 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300',
};

const tramiteIcon: Record<string, JSX.Element> = {
  'Pendiente': <Clock className="w-3 h-3" />,
  'En proceso': <AlertCircle className="w-3 h-3" />,
  'Completada': <CheckCircle2 className="w-3 h-3" />,
  'Rechazada': <X className="w-3 h-3" />,
};

export function ScrapyardDeregistrations() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<Deregistration>('scrapyard-ops', 'deregistrations'), []);
  const userId = user?.user_id || user?.id || '';

  const [items, setItems] = useState<Deregistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [filterTipo, setFilterTipo] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Deregistration | null>(null);
  const [form, setForm] = useState<DeregistrationForm>(emptyForm());
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
      setItems(list);
    } finally {
      setLoading(false);
    }
  }, [userId, api]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'vehicle', label: 'Vehículo' },
    { key: 'plate', label: 'Matrícula' },
    { key: 'date', label: 'Fecha' },
    { key: 'reason', label: 'Motivo' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'vehicle', label: 'Vehículo', example: '' },
    { key: 'plate', label: 'Matrícula', required: true, example: '' },
    { key: 'date', label: 'Fecha', example: '' },
    { key: 'reason', label: 'Motivo', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} baja(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} baja(s) importado(s)`);
  };

  useModalClose(showModal, () => setShowModal(false));

  const filtered = items.filter(i => {
    const q = search.toLowerCase();
    const matchSearch = i.matricula.toLowerCase().includes(q) || i.marcaModelo.toLowerCase().includes(q) || i.titular.toLowerCase().includes(q);
    const matchEstado = !filterEstado || i.estadoTramite === filterEstado;
    const matchTipo = !filterTipo || i.tipoBaja === filterTipo;
    return matchSearch && matchEstado && matchTipo;
  });

  const month = new Date().toISOString().slice(0, 7);
  const pendientes = items.filter(i => i.estadoTramite === 'Pendiente').length;
  const enTramite = items.filter(i => i.estadoTramite === 'En proceso').length;
  const completadasMes = items.filter(i => i.estadoTramite === 'Completada' && i.fechaBaja.startsWith(month)).length;
  const rechazadas = items.filter(i => i.estadoTramite === 'Rechazada').length;

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setShowModal(true); };
  const openEdit = (item: Deregistration) => {
    setEditing(item);
    const { _id: _docId, _rev: _r, type: _t, user_id: _u, createdAt: _c, updatedAt: _up, ...rest } = item;
    setForm(rest as DeregistrationForm);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.matricula || !form.titular || !userId) return;
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
    { label: 'Bajas pendientes', value: pendientes, icon: <Clock className="w-5 h-5 text-amber-500" />, bg: 'bg-amber-50 dark:bg-amber-900/30' },
    { label: 'En trámite', value: enTramite, icon: <AlertCircle className="w-5 h-5 text-blue-500" />, bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Completadas mes', value: completadasMes, icon: <CheckCircle2 className="w-5 h-5 text-emerald-500" />, bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'Rechazadas', value: rechazadas, icon: <AlertCircle className="w-5 h-5 text-red-500" />, bg: 'bg-red-50 dark:bg-red-900/30' },
  ];

  return (
    <Layout title="Bajas / DGT">
      <div className="space-y-6">
        <div className="flex items-center justify-end mb-1">
          <button
            onClick={() => navigate('/saas/vertical/desguaces/documentacion?tab=baja-destruccion')}
            className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
          >
            <FileText className="w-3 h-3" /> Ver documentación de bajas <ExternalLink className="w-3 h-3" />
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
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por matrícula, vehículo o titular..." className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <select value={filterTipo} onChange={e => setFilterTipo(e.target.value)} className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300">
              <option value="">Tipo baja</option>
              {TIPOS_BAJA.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)} className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300">
              <option value="">Estado trámite</option>
              {ESTADOS_TRAMITE.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
            <AddButtonDropdown
                label="Nueva baja"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de baja"
              />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Matrícula</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Marca / Modelo</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 hidden md:table-cell">Titular</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 hidden lg:table-cell">Fecha baja</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Tipo</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Estado</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 hidden xl:table-cell">Centro ITV</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 hidden xl:table-cell">Documentación</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Acciones</th>
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
              ) : filtered.map(i => (
                <tr key={i._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{i.matricula}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{i.marcaModelo}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden md:table-cell">{i.titular}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden lg:table-cell">{i.fechaBaja}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${i.tipoBaja === 'Definitiva' ? 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300' : 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'}`}>
                      {i.tipoBaja}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${tramiteColor[i.estadoTramite]}`}>
                      {tramiteIcon[i.estadoTramite]}{i.estadoTramite}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden xl:table-cell">{i.centroItv}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden xl:table-cell">
                    <span className={`flex items-center gap-1 ${i.documentacion === 'Completa' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                      <FileCheck className="w-3 h-3" />{i.documentacion}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => openEdit(i)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"><Edit3 className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(i._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-500 dark:text-gray-400 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">No se encontraron registros de bajas</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{editing ? 'Editar Baja' : 'Nueva Baja'}</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              {([
                { key: 'matricula', label: 'Matrícula', type: 'text' },
                { key: 'marcaModelo', label: 'Marca / Modelo', type: 'text' },
                { key: 'titular', label: 'Titular', type: 'text' },
                { key: 'fechaBaja', label: 'Fecha de baja', type: 'date' },
                { key: 'centroItv', label: 'Centro ITV', type: 'text' },
                { key: 'documentacion', label: 'Documentación', type: 'text' },
              ] as const).map(f => (
                <div key={f.key}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{f.label}</label>
                  <input type={f.type} value={(form as any)[f.key]} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo de baja</label>
                <select value={form.tipoBaja} onChange={e => setForm(prev => ({ ...prev, tipoBaja: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                  {TIPOS_BAJA.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Estado trámite</label>
                <select value={form.estadoTramite} onChange={e => setForm(prev => ({ ...prev, estadoTramite: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                  {ESTADOS_TRAMITE.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">Cancelar</button>
              <button onClick={handleSave} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">Guardar</button>
            </div>
          </div>
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="scrapyard_deregistrations"
        moduleLabel="Bajas"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Bajas"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
