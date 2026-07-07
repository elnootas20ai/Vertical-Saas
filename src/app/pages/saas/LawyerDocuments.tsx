import { useState, useMemo, useCallback, useEffect } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { useModalClose } from '../../hooks/useModalClose';
import {
  Search, Plus, X, Edit3, Filter, FileText, File,
  CheckCircle2, Clock, Send, Bell, PenTool, Calendar,
  Download, FolderOpen, Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { bulkCreateVerticalEntries, entryStr, entryNum } from '../../lib/bulkVerticalImport';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

type DocType = 'demanda' | 'contestacion' | 'recurso' | 'escritura' | 'poder' | 'contrato' | 'sentencia';
type DocStatus = 'borrador' | 'firmado' | 'presentado' | 'notificado';

interface LegalDocument extends VerticalEntity {
  nombre: string;
  caso: string;
  tipo: DocType;
  fecha: string;
  autor: string;
  estado: DocStatus;
}

type LegalDocumentForm = Omit<LegalDocument, keyof VerticalEntity>;

const TYPE_LABELS: Record<DocType, string> = {
  demanda: 'Demanda', contestacion: 'Contestación', recurso: 'Recurso',
  escritura: 'Escritura', poder: 'Poder', contrato: 'Contrato', sentencia: 'Sentencia',
};

const STATUS_CONFIG: Record<DocStatus, { label: string; cls: string; icon: typeof Clock }> = {
  borrador: { label: 'Borrador', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400', icon: Clock },
  firmado: { label: 'Firmado', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', icon: PenTool },
  presentado: { label: 'Presentado', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: Send },
  notificado: { label: 'Notificado', cls: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400', icon: Bell },
};

const AUTORES = ['Lcdo. Carlos Mendoza', 'Lcda. Ana Beltrán', 'Lcdo. Javier Ramos', 'Lcda. Patricia Solís'];

const emptyForm = (): LegalDocumentForm => ({
  nombre: '', caso: '', tipo: 'demanda', fecha: '', autor: AUTORES[0], estado: 'borrador',
});

export function LawyerDocuments() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<LegalDocument>('lawyer', 'documents'), []);
  const userId = user?.user_id || user?.id || '';

  const [docs, setDocs] = useState<LegalDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<DocStatus | ''>('');
  const [filterType, setFilterType] = useState<DocType | ''>('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<LegalDocument | null>(null);
  const [form, setForm] = useState<LegalDocumentForm>(emptyForm());
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
      setDocs(list);
    } finally {
      setLoading(false);
    }
  }, [userId, api]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'case', label: 'Caso' },
    { key: 'type', label: 'Tipo' },
    { key: 'date', label: 'Fecha' },
    { key: 'description', label: 'Descripción' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: '' },
    { key: 'case', label: 'Caso', example: '' },
    { key: 'type', label: 'Tipo', example: '' },
    { key: 'date', label: 'Fecha', example: '' },
    { key: 'description', label: 'Descripción', example: '' },
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
      caso: entryStr(e, 'caso') || '',
      tipo: entryStr(e, 'tipo', 'type') || 'demanda',
      fecha: entryStr(e, 'fecha', 'date') || '',
      autor: entryStr(e, 'autor'),
      estado: entryStr(e, 'estado', 'status') || 'borrador',
    };
    });
    if (created > 0) {
      await loadData();
      toast.success(`${created} documento creado(s)`);
    } else {
      toast.error('No se pudo crear ningún registro');
    }
  };

  const handleAIEntries = persistEntries;
  const handleImportEntries = async (entries: Record<string, string>[]) => persistEntries(entries);

  useModalClose(modalOpen, () => setModalOpen(false));

  const filtered = useMemo(() => docs.filter(d => {
    const q = search.toLowerCase();
    const matchSearch = d.nombre.toLowerCase().includes(q) || d.caso.toLowerCase().includes(q) || d.autor.toLowerCase().includes(q);
    const matchStatus = !filterStatus || d.estado === filterStatus;
    const matchType = !filterType || d.tipo === filterType;
    return matchSearch && matchStatus && matchType;
  }), [docs, search, filterStatus, filterType]);

  const stats = useMemo(() => ({
    total: docs.length,
    pendientesFirma: docs.filter(d => d.estado === 'borrador').length,
    presentadosMes: docs.filter(d => d.estado === 'presentado' && d.fecha >= '2026-03-01').length,
    firmados: docs.filter(d => d.estado === 'firmado').length,
  }), [docs]);

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setModalOpen(true); };
  const openEdit = (d: LegalDocument) => {
    setEditing(d);
    setForm({
      nombre: d.nombre, caso: d.caso, tipo: d.tipo, fecha: d.fecha, autor: d.autor, estado: d.estado,
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre.trim() || !userId) return;
    try {
      if (editing) {
        await api.update(userId, editing._id, form);
      } else {
        await api.create(userId, form);
      }
      await loadData();
      setModalOpen(false);
    } catch {
      /* error shown by fetch layer */
    }
  };

  const handleDelete = async (docId: string) => {
    if (!userId) return;
    try {
      await api.remove(userId, docId);
      await loadData();
    } catch {
      /* error shown by fetch layer */
    }
  };
  const inputClass = 'w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100';
  const labelClass = 'block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5';

  const typeIcon = (tipo: DocType) => {
    const cls = 'w-4 h-4 shrink-0';
    if (tipo === 'sentencia') return <FileText className={`${cls} text-purple-500`} />;
    if (tipo === 'contrato' || tipo === 'poder') return <File className={`${cls} text-blue-500`} />;
    return <FolderOpen className={`${cls} text-gray-400`} />;
  };

  return (
    <Layout title="Documentos Legales">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Documentos totales', value: stats.total, icon: FileText, color: 'text-blue-600' },
          { label: 'Pendientes de firma', value: stats.pendientesFirma, icon: PenTool, color: 'text-amber-600' },
          { label: 'Presentados este mes', value: stats.presentadosMes, icon: Send, color: 'text-green-600' },
          { label: 'Firmados', value: stats.firmados, icon: CheckCircle2, color: 'text-purple-600' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-2">
              <s.icon className={`w-5 h-5 ${s.color}`} />
              <span className="text-sm text-gray-500 dark:text-gray-400">{s.label}</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input type="text" placeholder="Buscar documento, caso, autor..." value={search} onChange={e => setSearch(e.target.value)} disabled={loading} className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none focus:border-gray-900 dark:focus:border-gray-400" />
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as DocStatus | '')} disabled={loading} className="pl-9 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none appearance-none cursor-pointer">
              <option value="">Todos los estados</option>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <select value={filterType} onChange={e => setFilterType(e.target.value as DocType | '')} disabled={loading} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none appearance-none cursor-pointer">
            <option value="">Todos los tipos</option>
            {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <AddButtonDropdown
                label="Nuevo documento"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de documento"
              />
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-left">
              {['Nombre', 'Caso', 'Tipo', 'Fecha', 'Autor', 'Estado', ''].map(h => (
                <th key={h} className="px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                  <span className="inline-flex items-center justify-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Cargando…
                  </span>
                </td>
              </tr>
            ) : filtered.map(d => {
              const cfg = STATUS_CONFIG[d.estado];
              const StatusIcon = cfg.icon;
              return (
                <tr key={d._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">{typeIcon(d.tipo)}{d.nombre}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 font-mono text-xs">{d.caso}</td>
                  <td className="px-4 py-3"><span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">{TYPE_LABELS[d.tipo]}</span></td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap"><span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{d.fecha}</span></td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">{d.autor}</td>
                  <td className="px-4 py-3"><span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${cfg.cls}`}><StatusIcon className="w-3.5 h-3.5" />{cfg.label}</span></td>
                  <td className="px-4 py-3 flex gap-1">
                    <button onClick={() => openEdit(d)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"><Edit3 className="w-4 h-4 text-gray-500" /></button>
                    <button className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"><Download className="w-4 h-4 text-gray-500" /></button>
                    <button onClick={() => void handleDelete(d._id)} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"><X className="w-4 h-4 text-red-400" /></button>
                  </td>
                </tr>
              );
            })}
            {!loading && filtered.length === 0 && <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">No se encontraron documentos</td></tr>}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setModalOpen(false)}>
          <form onSubmit={handleSave} onClick={e => e.stopPropagation()} className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2"><FileText className="w-5 h-5" />{editing ? 'Editar documento' : 'Nuevo documento'}</h2>
              <button type="button" onClick={() => setModalOpen(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2"><label className={labelClass}>Nombre del documento</label><input className={inputClass} value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} required /></div>
              <div><label className={labelClass}>Nº Caso / Expediente</label><input className={inputClass} value={form.caso} onChange={e => setForm({ ...form, caso: e.target.value })} /></div>
              <div>
                <label className={labelClass}>Tipo</label>
                <select className={inputClass} value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value as DocType })}>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div><label className={labelClass}>Fecha</label><input type="date" className={inputClass} value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} /></div>
              <div>
                <label className={labelClass}>Autor</label>
                <select className={inputClass} value={form.autor} onChange={e => setForm({ ...form, autor: e.target.value })}>
                  {AUTORES.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Estado</label>
                <select className={inputClass} value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value as DocStatus })}>
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex gap-3 p-6 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button type="button" onClick={() => setModalOpen(false)} className="flex-1 px-4 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">Cancelar</button>
              <button type="submit" className="flex-1 px-4 py-3 bg-gray-900 hover:bg-black dark:bg-gray-100 dark:hover:bg-white text-white dark:text-gray-900 rounded-xl font-semibold transition-colors">Guardar</button>
            </div>
          </form>
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="lawyer_documents"
        moduleLabel="Documentos"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Documentos"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
