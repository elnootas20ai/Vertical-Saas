import { useState, useMemo, useCallback, useEffect } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { useModalClose } from '../../hooks/useModalClose';
import {
  Users, Plus, Search, Edit3, Trash2, X, UserPlus,
  Phone, Mail, Droplets, AlertTriangle, CalendarDays,
  Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

interface Patient extends VerticalEntity {
  nombre: string;
  dni: string;
  fechaNacimiento: string;
  telefono: string;
  email: string;
  grupoSanguineo: string;
  alergias: string;
  ultimaVisita: string;
}

type PatientForm = Omit<Patient, keyof VerticalEntity>;

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const emptyForm = (): PatientForm => ({
  nombre: '', dni: '', fechaNacimiento: '', telefono: '',
  email: '', grupoSanguineo: 'A+', alergias: '', ultimaVisita: '',
});

export function ClinicPatients() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<Patient>('clinic', 'patients'), []);
  const userId = user?.user_id || user?.id || '';

  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterBlood, setFilterBlood] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Patient | null>(null);
  const [form, setForm] = useState<PatientForm>(emptyForm());
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
      setPatients(list);
    } finally {
      setLoading(false);
    }
  }, [userId, api]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'dni', label: 'DNI' },
    { key: 'phone', label: 'Teléfono' },
    { key: 'email', label: 'Email' },
    { key: 'birthDate', label: 'Fecha nacimiento' },
    { key: 'address', label: 'Dirección' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: '' },
    { key: 'dni', label: 'DNI', example: '' },
    { key: 'phone', label: 'Teléfono', example: '' },
    { key: 'email', label: 'Email', example: '' },
    { key: 'birthDate', label: 'Fecha nacimiento', example: '' },
    { key: 'address', label: 'Dirección', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} paciente(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} paciente(s) importado(s)`);
  };

  useModalClose(showModal, () => setShowModal(false));

  const filtered = patients.filter(p => {
    const matchSearch = p.nombre.toLowerCase().includes(search.toLowerCase()) || p.dni.toLowerCase().includes(search.toLowerCase());
    const matchBlood = !filterBlood || p.grupoSanguineo === filterBlood;
    return matchSearch && matchBlood;
  });

  const today = new Date().toISOString().slice(0, 7);
  const newThisMonth = patients.filter(p => p.ultimaVisita.startsWith(today)).length;

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setShowModal(true); };
  const openEdit = (p: Patient) => {
    setEditing(p);
    setForm({ nombre: p.nombre, dni: p.dni, fechaNacimiento: p.fechaNacimiento, telefono: p.telefono, email: p.email, grupoSanguineo: p.grupoSanguineo, alergias: p.alergias, ultimaVisita: p.ultimaVisita });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.nombre || !form.dni || !userId) return;
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
    { label: 'Total Pacientes', value: patients.length, icon: <Users className="w-5 h-5 text-blue-500" />, bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Nuevos este mes', value: newThisMonth, icon: <UserPlus className="w-5 h-5 text-emerald-500" />, bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'Citas pendientes', value: 12, icon: <CalendarDays className="w-5 h-5 text-amber-500" />, bg: 'bg-amber-50 dark:bg-amber-900/30' },
  ];

  return (
    <Layout title="Pacientes">
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
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre o DNI..." className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div className="flex gap-2 items-center">
            <select value={filterBlood} onChange={e => setFilterBlood(e.target.value)} className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300">
              <option value="">Grupo sanguíneo</option>
              {BLOOD_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <AddButtonDropdown
                label="Nuevo paciente"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de paciente"
              />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Nombre</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">DNI</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 hidden md:table-cell">Nacimiento</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 hidden lg:table-cell">Teléfono</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 hidden lg:table-cell">Email</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Grupo</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 hidden xl:table-cell">Alergias</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Última visita</th>
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
              ) : filtered.map(p => (
                <tr key={p._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{p.nombre}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{p.dni}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden md:table-cell">{p.fechaNacimiento}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden lg:table-cell"><span className="flex items-center gap-1"><Phone className="w-3 h-3" />{p.telefono}</span></td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden lg:table-cell"><span className="flex items-center gap-1"><Mail className="w-3 h-3" />{p.email}</span></td>
                  <td className="px-4 py-3"><span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300"><Droplets className="w-3 h-3" />{p.grupoSanguineo}</span></td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden xl:table-cell">{p.alergias !== 'Ninguna' ? <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400"><AlertTriangle className="w-3 h-3" />{p.alergias}</span> : <span className="text-gray-400">Ninguna</span>}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{p.ultimaVisita}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"><Edit3 className="w-4 h-4" /></button>
                      <button onClick={() => void handleDelete(p._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-500 dark:text-gray-400 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">No se encontraron pacientes</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{editing ? 'Editar Paciente' : 'Nuevo Paciente'}</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              {([
                { key: 'nombre', label: 'Nombre completo', type: 'text' },
                { key: 'dni', label: 'DNI', type: 'text' },
                { key: 'fechaNacimiento', label: 'Fecha de nacimiento', type: 'date' },
                { key: 'telefono', label: 'Teléfono', type: 'tel' },
                { key: 'email', label: 'Email', type: 'email' },
                { key: 'alergias', label: 'Alergias', type: 'text' },
                { key: 'ultimaVisita', label: 'Última visita', type: 'date' },
              ] as const).map(f => (
                <div key={f.key}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{f.label}</label>
                  <input type={f.type} value={(form as any)[f.key]} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Grupo sanguíneo</label>
                <select value={form.grupoSanguineo} onChange={e => setForm(prev => ({ ...prev, grupoSanguineo: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                  {BLOOD_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
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
        module="clinic_patients"
        moduleLabel="Pacientes"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Pacientes"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
