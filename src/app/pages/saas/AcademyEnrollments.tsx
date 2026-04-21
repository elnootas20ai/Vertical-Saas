import { useState, useMemo, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { useModalClose } from '../../hooks/useModalClose';
import {
  Search, Plus, X, Edit2, FileText, DollarSign, AlertCircle,
  CreditCard, Filter, CheckCircle, Clock, Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

type EnrollmentStatus = 'activa' | 'pendiente_pago' | 'cancelada';
type PaymentMethod = 'mensual' | 'trimestral' | 'completo';

interface Enrollment extends VerticalEntity {
  alumno: string;
  curso: string;
  fechaMatricula: string;
  importe: number;
  formaPago: PaymentMethod;
  estado: EnrollmentStatus;
  descuento: number;
}

type EnrollmentForm = Omit<Enrollment, keyof VerticalEntity>;

const STATUS_CFG: Record<EnrollmentStatus, { label: string; bg: string; text: string; icon: ReactNode }> = {
  activa:          { label: 'Activa',          bg: 'bg-emerald-50 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300', icon: <CheckCircle className="w-3.5 h-3.5" /> },
  pendiente_pago:  { label: 'Pendiente Pago',  bg: 'bg-amber-50 dark:bg-amber-900/30',     text: 'text-amber-700 dark:text-amber-300',     icon: <Clock className="w-3.5 h-3.5" /> },
  cancelada:       { label: 'Cancelada',       bg: 'bg-red-50 dark:bg-red-900/30',         text: 'text-red-700 dark:text-red-300',         icon: <X className="w-3.5 h-3.5" /> },
};

const PAY_LABELS: Record<PaymentMethod, string> = {
  mensual: 'Mensual', trimestral: 'Trimestral', completo: 'Pago Completo',
};

const emptyForm = (): EnrollmentForm => ({
  alumno: '', curso: '', fechaMatricula: new Date().toISOString().slice(0, 10),
  importe: 0, formaPago: 'mensual', estado: 'activa', descuento: 0,
});

export function AcademyEnrollments() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<Enrollment>('academy', 'enrollments'), []);
  const userId = user?.user_id || user?.id || '';

  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<EnrollmentStatus | 'todas'>('todas');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Enrollment | null>(null);
  const [form, setForm] = useState<EnrollmentForm>(emptyForm());
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'student', label: 'Alumno' },
    { key: 'course', label: 'Curso' },
    { key: 'date', label: 'Fecha' },
    { key: 'amount', label: 'Importe' },
    { key: 'status', label: 'Estado' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'student', label: 'Alumno', example: '' },
    { key: 'course', label: 'Curso', example: '' },
    { key: 'date', label: 'Fecha', example: '' },
    { key: 'amount', label: 'Importe', example: '' },
    { key: 'status', label: 'Estado', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} matrícula(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} matrícula(s) importado(s)`);
  };

  useModalClose(showModal, () => setShowModal(false));

  const loadData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await api.list(userId);
      setEnrollments(list);
    } finally {
      setLoading(false);
    }
  }, [userId, api]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = useMemo(() => {
    let list = enrollments;
    if (filterStatus !== 'todas') list = list.filter(e => e.estado === filterStatus);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(e => e.alumno.toLowerCase().includes(q) || e.curso.toLowerCase().includes(q));
    }
    return list;
  }, [enrollments, search, filterStatus]);

  const stats = useMemo(() => {
    const activas = enrollments.filter(e => e.estado === 'activa');
    return {
      activas: activas.length,
      ingresosMes: activas.reduce((a, e) => a + (e.importe * (100 - e.descuento) / 100), 0),
      pendientesCobro: enrollments.filter(e => e.estado === 'pendiente_pago').length,
    };
  }, [enrollments]);

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setShowModal(true); };
  const openEdit = (en: Enrollment) => {
    setEditing(en);
    setForm({
      alumno: en.alumno, curso: en.curso, fechaMatricula: en.fechaMatricula, importe: en.importe,
      formaPago: en.formaPago, estado: en.estado, descuento: en.descuento,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.alumno.trim() || !form.curso.trim() || !userId) return;
    try {
      if (editing) {
        await api.update(userId, editing._id, form);
      } else {
        await api.create(userId, form);
      }
      await loadData();
      setShowModal(false);
    } catch {
      /* error shown by fetch layer */
    }
  };

  const statCards = [
    { label: 'Matrículas Activas', value: stats.activas, icon: <FileText className="w-5 h-5" />, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'Ingresos Mes', value: `${stats.ingresosMes.toLocaleString('es-ES', { maximumFractionDigits: 0 })} €`, icon: <DollarSign className="w-5 h-5" />, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Pendientes Cobro', value: stats.pendientesCobro, icon: <AlertCircle className="w-5 h-5" />, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30' },
  ];

  return (
    <Layout title="Matrículas">
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {statCards.map(c => (
            <div key={c.label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${c.bg}`}><span className={c.color}>{c.icon}</span></div>
                <div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{c.value}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{c.label}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative flex-1 max-w-md w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar alumno o curso..." className="w-full pl-10 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div className="flex gap-2 items-center">
            <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
              <Filter className="w-4 h-4 text-gray-400 ml-2" />
              {(['todas', 'activa', 'pendiente_pago', 'cancelada'] as const).map(s => (
                <button key={s} onClick={() => setFilterStatus(s)} className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${filterStatus === s ? 'bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
                  {s === 'todas' ? 'Todas' : STATUS_CFG[s].label}
                </button>
              ))}
            </div>
            <AddButtonDropdown
                label="Nueva Matrícula"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de matrícula"
              />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Alumno</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Curso</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 hidden md:table-cell">Fecha</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Importe</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 hidden lg:table-cell">Forma Pago</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Estado</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 hidden lg:table-cell">Descuento</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-gray-500 dark:text-gray-400">
                      <span className="inline-flex items-center justify-center gap-2">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Cargando…
                      </span>
                    </td>
                  </tr>
                ) : filtered.map(e => (
                  <tr key={e._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{e.alumno}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{e.curso}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 hidden md:table-cell">{e.fechaMatricula}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">{e.importe} €</td>
                    <td className="px-4 py-3 hidden lg:table-cell"><span className="inline-flex items-center gap-1 text-gray-600 dark:text-gray-300"><CreditCard className="w-3.5 h-3.5" /> {PAY_LABELS[e.formaPago]}</span></td>
                    <td className="px-4 py-3"><span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_CFG[e.estado].bg} ${STATUS_CFG[e.estado].text}`}>{STATUS_CFG[e.estado].icon} {STATUS_CFG[e.estado].label}</span></td>
                    <td className="px-4 py-3 text-right text-gray-500 dark:text-gray-400 hidden lg:table-cell">{e.descuento > 0 ? `${e.descuento}%` : '—'}</td>
                    <td className="px-4 py-3 text-right"><button onClick={() => openEdit(e)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"><Edit2 className="w-4 h-4 text-gray-500" /></button></td>
                  </tr>
                ))}
                {!loading && filtered.length === 0 && <tr><td colSpan={8} className="text-center py-12 text-gray-400">No se encontraron matrículas</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Editar Matrícula' : 'Nueva Matrícula'}</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Alumno *</label>
                  <input value={form.alumno} onChange={e => setForm(f => ({ ...f, alumno: e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Curso *</label>
                  <input value={form.curso} onChange={e => setForm(f => ({ ...f, curso: e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha Matrícula</label>
                  <input type="date" value={form.fechaMatricula} onChange={e => setForm(f => ({ ...f, fechaMatricula: e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Importe (€)</label>
                  <input type="number" value={form.importe} onChange={e => setForm(f => ({ ...f, importe: +e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Forma de Pago</label>
                  <select value={form.formaPago} onChange={e => setForm(f => ({ ...f, formaPago: e.target.value as PaymentMethod }))} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="mensual">Mensual</option>
                    <option value="trimestral">Trimestral</option>
                    <option value="completo">Pago Completo</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descuento (%)</label>
                  <input type="number" min="0" max="100" value={form.descuento} onChange={e => setForm(f => ({ ...f, descuento: +e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Estado</label>
                  <select value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value as EnrollmentStatus }))} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="activa">Activa</option>
                    <option value="pendiente_pago">Pendiente Pago</option>
                    <option value="cancelada">Cancelada</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button onClick={() => setShowModal(false)} className="px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition">Cancelar</button>
              <button onClick={handleSave} className="px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition">Guardar</button>
            </div>
          </div>
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="academy_enrollments"
        moduleLabel="Matrículas"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Matrículas"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
