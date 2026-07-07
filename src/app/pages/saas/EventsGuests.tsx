import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { useModalClose } from '../../hooks/useModalClose';
import {
  Search, Plus, X, Edit3, Trash2, Users, UserCheck, UserX,
  Clock, Mail, Phone, UtensilsCrossed, AlertTriangle, CheckCircle2, Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';
import { bulkCreateVerticalEntries, entryNum, entryStr } from '../../lib/bulkVerticalImport';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validateEmail(email: string): string | null {
  if (!email.trim()) return 'El email es obligatorio.';
  if (!EMAIL_REGEX.test(email.trim())) return 'El formato del email no es válido.';
  return null;
}

interface Toast {
  id: number;
  text: string;
  type: 'success' | 'error';
}

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map(t => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    const timer = setTimeout(() => onDismissRef.current(toast.id), 4000);
    return () => clearTimeout(timer);
  }, [toast.id]);

  const isSuccess = toast.type === 'success';
  return (
    <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg animate-in slide-in-from-right-4 ${
      isSuccess
        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
        : 'border-red-200 bg-red-50 text-red-800'
    }`}>
      {isSuccess
        ? <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-500 flex-shrink-0" />
        : <AlertTriangle className="w-4 h-4 mt-0.5 text-red-500 flex-shrink-0" />}
      <span className="flex-1">{toast.text}</span>
      <button type="button" onClick={() => onDismiss(toast.id)} className="flex-shrink-0 opacity-60 hover:opacity-100">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

type Confirmation = 'confirmado' | 'pendiente' | 'rechazado';
type MenuType = 'normal' | 'vegetariano' | 'vegano' | 'celiaco' | 'halal';

interface Guest extends VerticalEntity {
  nombre: string;
  evento: string;
  email: string;
  telefono: string;
  mesa: string;
  confirmacion: Confirmation;
  menu: MenuType;
  acompanantes: number;
}

type GuestForm = Omit<Guest, keyof VerticalEntity>;

/** Catálogo de eventos (misma vertical) para el desplegable de invitados */
interface EventRecord extends VerticalEntity {
  nombre: string;
  tipo: string;
  fecha: string;
  lugar: string;
  cliente: string;
  invitados: number;
  presupuesto: number;
  estado: string;
}

const CONFIRM_CONFIG: Record<Confirmation, { label: string; bg: string; text: string; icon: React.ReactNode }> = {
  confirmado: { label: 'Confirmado', bg: 'bg-emerald-50 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300', icon: <UserCheck className="w-3.5 h-3.5" /> },
  pendiente:  { label: 'Pendiente',  bg: 'bg-amber-50 dark:bg-amber-900/30',    text: 'text-amber-700 dark:text-amber-300', icon: <Clock className="w-3.5 h-3.5" /> },
  rechazado:  { label: 'Rechazado',  bg: 'bg-red-50 dark:bg-red-900/30',        text: 'text-red-700 dark:text-red-300', icon: <UserX className="w-3.5 h-3.5" /> },
};

const MENU_LABELS: Record<MenuType, string> = {
  normal: 'Normal', vegetariano: 'Vegetariano', vegano: 'Vegano', celiaco: 'Celíaco', halal: 'Halal',
};

const EMPTY_FORM: GuestForm = { nombre: '', evento: '', email: '', telefono: '', mesa: '', confirmacion: 'pendiente', menu: 'normal', acompanantes: 0 };

export function EventsGuests() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const linkedEventName = searchParams.get('eventName') || '';
  const linkedEventId = searchParams.get('eventId') || '';
  const api = useMemo(() => createVerticalApi<Guest>('events', 'guests'), []);
  const eventsCatalogApi = useMemo(() => createVerticalApi<EventRecord>('events', 'events'), []);
  const userId = user?.user_id || user?.id || '';

  const [guests, setGuests] = useState<Guest[]>([]);
  const [eventCatalog, setEventCatalog] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterConfirm, setFilterConfirm] = useState<Confirmation | ''>('');
  const [filterEvent, setFilterEvent] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Guest | null>(null);
  const [form, setForm] = useState<GuestForm>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<{ nombre?: string; email?: string; evento?: string }>({});
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Teléfono' },
    { key: 'event', label: 'Evento' },
    { key: 'status', label: 'Estado' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: '' },
    { key: 'email', label: 'Email', example: '' },
    { key: 'phone', label: 'Teléfono', example: '' },
    { key: 'event', label: 'Evento', example: '' },
    { key: 'status', label: 'Estado', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const persistEntries = async (entries: Record<string, unknown>[]) => {
    if (!userId) {
      toast.error('Sesión no válida');
      return;
    }
    const created = await bulkCreateVerticalEntries(userId, api, entries, (e) => {
      const nombre = entryStr(e, 'name', 'nombre');
      const email = entryStr(e, 'email');
      if (!nombre || !email) return null;
      return {
        nombre,
        email,
        evento: entryStr(e, 'event', 'evento') || linkedEventName,
        telefono: entryStr(e, 'phone', 'telefono'),
        mesa: entryStr(e, 'table', 'mesa'),
        confirmacion: (entryStr(e, 'status', 'confirmacion') || 'pendiente') as Confirmation,
        menu: 'normal' as MenuType,
        acompanantes: entryNum(e, 'companions', 'acompanantes'),
      };
    });
    if (created > 0) {
      await loadData();
      toast.success(`${created} invitado(s) creado(s)`);
    } else {
      toast.error('No se pudo crear ningún invitado');
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
      const [list, evs] = await Promise.all([api.list(userId), eventsCatalogApi.list(userId)]);
      setGuests(list);
      setEventCatalog(evs);
    } finally {
      setLoading(false);
    }
  }, [userId, api, eventsCatalogApi]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (linkedEventName) setFilterEvent(linkedEventName);
  }, [linkedEventName]);

  const eventNameOptions = useMemo(() => {
    const s = new Set<string>();
    eventCatalog.forEach(e => {
      if (e.nombre) s.add(e.nombre);
    });
    guests.forEach(g => {
      if (g.evento) s.add(g.evento);
    });
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [guests, eventCatalog]);

  const addToast = (text: string, type: 'success' | 'error') => {
    setToasts(prev => [...prev, { id: Date.now(), text, type }]);
  };
  const dismissToast = (id: number) => setToasts(prev => prev.filter(t => t.id !== id));

  const filtered = useMemo(() => guests.filter(g => {
    const ms = g.nombre.toLowerCase().includes(search.toLowerCase()) || g.email.toLowerCase().includes(search.toLowerCase());
    const mc = !filterConfirm || g.confirmacion === filterConfirm;
    const me = !filterEvent || g.evento === filterEvent;
    return ms && mc && me;
  }), [guests, search, filterConfirm, filterEvent]);

  const stats = useMemo(() => {
    const confirmados = guests.filter(g => g.confirmacion === 'confirmado').length;
    const pendientes = guests.filter(g => g.confirmacion === 'pendiente').length;
    const especiales = guests.filter(g => g.menu !== 'normal').length;
    return { confirmados, pendientes, especiales };
  }, [guests]);

  const openCreate = () => {
    setEditing(null);
    setForm(linkedEventName ? { ...EMPTY_FORM, evento: linkedEventName } : EMPTY_FORM);
    setFormErrors({});
    setShowModal(true);
  };
  const openEdit = (g: Guest) => {
    setEditing(g);
    setForm({
      nombre: g.nombre,
      evento: g.evento,
      email: g.email,
      telefono: g.telefono,
      mesa: g.mesa,
      confirmacion: g.confirmacion,
      menu: g.menu,
      acompanantes: g.acompanantes,
    });
    setFormErrors({});
    setShowModal(true);
  };

  const handleDelete = async (docId: string) => {
    if (!userId) return;
    const guest = guests.find(g => g._id === docId);
    try {
      await api.remove(userId, docId);
      await loadData();
      if (guest) addToast(`Invitado "${guest.nombre}" eliminado correctamente.`, 'success');
    } catch {
      /* error from fetch */
    }
  };

  const handleSave = async () => {
    const errors: { nombre?: string; email?: string; evento?: string } = {};
    if (!form.nombre.trim()) errors.nombre = 'El nombre es obligatorio.';
    if (!form.evento.trim()) errors.evento = 'El evento es obligatorio.';
    const emailErr = validateEmail(form.email);
    if (emailErr) errors.email = emailErr;

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    setFormErrors({});

    if (!userId) return;

    const isDuplicate = guests.some(
      g => g.email.toLowerCase() === form.email.trim().toLowerCase() && (!editing || g._id !== editing._id),
    );
    if (isDuplicate) {
      setFormErrors({ email: 'Ya existe un invitado con ese email.' });
      return;
    }

    try {
      const payload = linkedEventId && !editing ? { ...form, eventId: linkedEventId } : form;
      if (editing) {
        await api.update(userId, editing._id, payload);
        addToast(`Invitado "${form.nombre}" actualizado. Email: ${form.email}`, 'success');
      } else {
        await api.create(userId, payload);
        addToast(`Invitado "${form.nombre}" añadido correctamente. Email: ${form.email}`, 'success');
      }
      await loadData();
      setShowModal(false);
    } catch {
      /* error from fetch */
    }
  };

  const statsCards = [
    { label: 'Confirmados', value: stats.confirmados, icon: <UserCheck className="w-5 h-5 text-emerald-500" />, bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'Pendientes', value: stats.pendientes, icon: <Clock className="w-5 h-5 text-amber-500" />, bg: 'bg-amber-50 dark:bg-amber-900/30' },
    { label: 'Dietas especiales', value: stats.especiales, icon: <UtensilsCrossed className="w-5 h-5 text-violet-500" />, bg: 'bg-violet-50 dark:bg-violet-900/30' },
  ];

  return (
    <Layout title="Invitados / Asistentes">
      <div className="space-y-6">
        {linkedEventName && (
          <div className="rounded-xl border border-cyan-200 dark:border-cyan-800 bg-cyan-50 dark:bg-cyan-950/30 px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>Evento: <strong>{linkedEventName}</strong></span>
            {linkedEventId && (
              <Link to={`/saas/vertical/eventos/${linkedEventId}`} className="font-semibold text-cyan-700 dark:text-cyan-300 hover:underline">
                Volver al proyecto
              </Link>
            )}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {statsCards.map(s => (
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
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar invitado o email..." disabled={loading} className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <select value={filterEvent} onChange={e => setFilterEvent(e.target.value)} disabled={loading} className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300">
              <option value="">Todos los eventos</option>
              {eventNameOptions.map(ev => <option key={ev} value={ev}>{ev}</option>)}
            </select>
            <select value={filterConfirm} onChange={e => setFilterConfirm(e.target.value as any)} disabled={loading} className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300">
              <option value="">Todas las confirmaciones</option>
              {Object.entries(CONFIRM_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <AddButtonDropdown
                label="Nuevo invitado"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de invitado"
              />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-x-auto">
          <table className="w-full text-sm min-w-[1100px]">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Nombre</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Evento</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Email</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 hidden lg:table-cell">Teléfono</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 hidden md:table-cell">Mesa</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Confirmación</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Menú</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 hidden md:table-cell">Acomp.</th>
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
              ) : filtered.map(g => {
                const cf = CONFIRM_CONFIG[g.confirmacion];
                return (
                  <tr key={g._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{g.nombre}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 text-xs">{g.evento}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300"><span className="flex items-center gap-1"><Mail className="w-3 h-3" />{g.email}</span></td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden lg:table-cell"><span className="flex items-center gap-1"><Phone className="w-3 h-3" />{g.telefono}</span></td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden md:table-cell">{g.mesa}</td>
                    <td className="px-4 py-3"><span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cf.bg} ${cf.text}`}>{cf.icon}{cf.label}</span></td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${g.menu !== 'normal' ? 'bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}`}>
                        {MENU_LABELS[g.menu]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden md:table-cell text-center">{g.acompanantes}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => openEdit(g)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"><Edit3 className="w-4 h-4" /></button>
                        <button onClick={() => void handleDelete(g._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">No se encontraron invitados</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{editing ? 'Editar Invitado' : 'Nuevo Invitado'}</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Nombre completo <span className="text-red-400">*</span>
                </label>
                <input
                  value={form.nombre}
                  onChange={e => {
                    setForm(p => ({ ...p, nombre: e.target.value }));
                    if (formErrors.nombre) setFormErrors(p => ({ ...p, nombre: undefined }));
                  }}
                  className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 outline-none transition-colors ${
                    formErrors.nombre ? 'border-red-400 focus:ring-red-200' : 'border-gray-200 dark:border-gray-700 focus:ring-blue-500'
                  }`}
                />
                {formErrors.nombre && <p className="mt-1 text-xs text-red-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{formErrors.nombre}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Evento</label>
                <select
                  value={form.evento}
                  onChange={e => {
                    setForm(p => ({ ...p, evento: e.target.value }));
                    if (formErrors.evento) setFormErrors(p => ({ ...p, evento: undefined }));
                  }}
                  className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 outline-none ${
                    formErrors.evento ? 'border-red-400 focus:ring-red-200' : 'border-gray-200 dark:border-gray-700 focus:ring-blue-500'
                  }`}
                >
                  <option value="">Seleccionar evento…</option>
                  {eventNameOptions.map(ev => <option key={ev} value={ev}>{ev}</option>)}
                  {form.evento && !eventNameOptions.includes(form.evento) ? (
                    <option value={form.evento}>{form.evento}</option>
                  ) : null}
                </select>
                {formErrors.evento && <p className="mt-1 text-xs text-red-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{formErrors.evento}</p>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Email <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => {
                      setForm(p => ({ ...p, email: e.target.value }));
                      if (formErrors.email) setFormErrors(p => ({ ...p, email: undefined }));
                    }}
                    className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 outline-none transition-colors ${
                      formErrors.email ? 'border-red-400 focus:ring-red-200' : 'border-gray-200 dark:border-gray-700 focus:ring-blue-500'
                    }`}
                  />
                  {formErrors.email && <p className="mt-1 text-xs text-red-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{formErrors.email}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Teléfono</label>
                  <input value={form.telefono} onChange={e => setForm(p => ({ ...p, telefono: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Mesa</label>
                  <input value={form.mesa} onChange={e => setForm(p => ({ ...p, mesa: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Confirmación</label>
                  <select value={form.confirmacion} onChange={e => setForm(p => ({ ...p, confirmacion: e.target.value as Confirmation }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                    {Object.entries(CONFIRM_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Acompañantes</label>
                  <input type="number" min="0" value={form.acompanantes} onChange={e => setForm(p => ({ ...p, acompanantes: +e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Menú</label>
                <select value={form.menu} onChange={e => setForm(p => ({ ...p, menu: e.target.value as MenuType }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                  {Object.entries(MENU_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">Cancelar</button>
              <button type="button" onClick={() => void handleSave()} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">Guardar</button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="events_guests"
        moduleLabel="Invitados"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Invitados"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
