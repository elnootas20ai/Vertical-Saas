import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { useModalClose } from '../../hooks/useModalClose';
import {
  Search, X, Edit3, Filter, Phone, Mail, Globe, Users,
  CalendarClock, UserPlus, AlertTriangle, CheckCircle2,
  Loader2, ArrowRight, Inbox,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  buildLawyerDemoBundle,
  isLawyerDemoViewer,
  withLawyerDemoList,
} from '../../lib/lawyerOpsDemo';
import {
  VERTIAL_BTN_PRIMARY,
  VERTIAL_BTN_SECONDARY,
} from '../../lib/vertialUiTokens';

type LeadCanal = 'llamada' | 'email' | 'web' | 'referido';
type AsuntoTipo = 'civil' | 'penal' | 'laboral' | 'mercantil' | 'administrativo' | 'familia';
type Urgencia = 'baja' | 'media' | 'alta';
type ConsultaTipo = 'gratuita' | 'pago';
type LeadEstado = 'nuevo' | 'contactado' | 'consulta_agendada' | 'aceptado' | 'descartado';

interface LawyerLead extends VerticalEntity {
  nombre: string;
  telefono: string;
  email: string;
  canal: LeadCanal;
  tipoAsunto: AsuntoTipo;
  urgencia: Urgencia;
  consultaTipo: ConsultaTipo;
  fechaConsulta: string;
  estado: LeadEstado;
  notas: string;
  expedienteId?: string;
  expediente?: string;
}

type LeadForm = Omit<LawyerLead, keyof VerticalEntity | 'expedienteId' | 'expediente'>;

interface LawyerCase extends VerticalEntity {
  expediente: string;
  tipo: AsuntoTipo;
  cliente: string;
  fechaApertura: string;
  estado: string;
  abogado: string;
  juzgado: string;
  leadId?: string;
  urgencia?: Urgencia;
  notas?: string;
}

const CANAL_LABELS: Record<LeadCanal, string> = {
  llamada: 'Llamada',
  email: 'Email',
  web: 'Formulario web',
  referido: 'Referido',
};

const ASUNTO_LABELS: Record<AsuntoTipo, string> = {
  civil: 'Civil',
  penal: 'Penal',
  laboral: 'Laboral',
  mercantil: 'Mercantil',
  administrativo: 'Administrativo',
  familia: 'Familia',
};

const URGENCIA_CONFIG: Record<Urgencia, { label: string; cls: string }> = {
  baja: { label: 'Baja', cls: 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300' },
  media: { label: 'Media', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  alta: { label: 'Alta', cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' },
};

const ESTADO_CONFIG: Record<LeadEstado, { label: string; cls: string }> = {
  nuevo: { label: 'Nuevo', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  contactado: { label: 'Contactado', cls: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400' },
  consulta_agendada: { label: 'Consulta agendada', cls: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400' },
  aceptado: { label: 'Aceptado', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  descartado: { label: 'Descartado', cls: 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400' },
};

const CANAL_ICON: Record<LeadCanal, typeof Phone> = {
  llamada: Phone,
  email: Mail,
  web: Globe,
  referido: Users,
};

const emptyForm = (): LeadForm => ({
  nombre: '',
  telefono: '',
  email: '',
  canal: 'llamada',
  tipoAsunto: 'civil',
  urgencia: 'media',
  consultaTipo: 'gratuita',
  fechaConsulta: '',
  estado: 'nuevo',
  notas: '',
});

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function nextExpedienteNumber(existing: LawyerCase[]): string {
  const year = new Date().getFullYear();
  const prefix = `EXP-${year}-`;
  let max = 0;
  for (const c of existing) {
    const n = String(c.expediente || '');
    if (!n.startsWith(prefix)) continue;
    const num = Number(n.slice(prefix.length));
    if (Number.isFinite(num) && num > max) max = num;
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}

export function LawyerCaptacion() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const leadsApi = useMemo(() => createVerticalApi<LawyerLead>('lawyer', 'leads'), []);
  const casesApi = useMemo(() => createVerticalApi<LawyerCase>('lawyer', 'cases'), []);
  const userId = user?.user_id || user?.id || '';

  const [leads, setLeads] = useState<LawyerLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState<LeadEstado | ''>('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<LawyerLead | null>(null);
  const [form, setForm] = useState<LeadForm>(emptyForm());

  const loadData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await leadsApi.list(userId);
      const demo = isLawyerDemoViewer(user?.email) ? buildLawyerDemoBundle(userId).leads : [];
      setLeads(withLawyerDemoList(list, demo as LawyerLead[], user?.email));
    } finally {
      setLoading(false);
    }
  }, [userId, user?.email, leadsApi]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useModalClose(modalOpen, () => setModalOpen(false));

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return leads.filter((l) => {
      const matchSearch =
        !q ||
        l.nombre.toLowerCase().includes(q) ||
        (l.telefono || '').includes(q) ||
        (l.email || '').toLowerCase().includes(q) ||
        (l.notas || '').toLowerCase().includes(q);
      const matchEstado = !filterEstado || l.estado === filterEstado;
      return matchSearch && matchEstado;
    });
  }, [leads, search, filterEstado]);

  const stats = useMemo(() => ({
    nuevos: leads.filter((l) => l.estado === 'nuevo').length,
    consultas: leads.filter((l) => l.estado === 'consulta_agendada').length,
    urgentes: leads.filter((l) => l.urgencia === 'alta' && l.estado !== 'aceptado' && l.estado !== 'descartado').length,
    aceptados: leads.filter((l) => l.estado === 'aceptado').length,
  }), [leads]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setModalOpen(true);
  };

  const openEdit = (l: LawyerLead) => {
    setEditing(l);
    setForm({
      nombre: l.nombre,
      telefono: l.telefono || '',
      email: l.email || '',
      canal: l.canal || 'llamada',
      tipoAsunto: l.tipoAsunto || 'civil',
      urgencia: l.urgencia || 'media',
      consultaTipo: l.consultaTipo || 'gratuita',
      fechaConsulta: l.fechaConsulta || '',
      estado: l.estado || 'nuevo',
      notas: l.notas || '',
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre.trim() || !userId) return;
    setSaving(true);
    try {
      if (editing) {
        await leadsApi.update(userId, editing._id, form);
        toast.success('Lead actualizado');
      } else {
        await leadsApi.create(userId, form);
        toast.success('Lead registrado');
      }
      await loadData();
      setModalOpen(false);
    } catch {
      toast.error('No se pudo guardar el lead');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (docId: string) => {
    if (!userId) return;
    try {
      await leadsApi.remove(userId, docId);
      await loadData();
      toast.success('Lead eliminado');
    } catch {
      toast.error('No se pudo eliminar');
    }
  };

  const markContacted = async (l: LawyerLead) => {
    if (!userId || l.estado === 'aceptado' || l.estado === 'descartado') return;
    try {
      await leadsApi.update(userId, l._id, { estado: 'contactado' });
      await loadData();
      toast.success('Marcado como contactado');
    } catch {
      toast.error('No se pudo actualizar');
    }
  };

  const scheduleConsulta = async (l: LawyerLead) => {
    if (!userId || l.estado === 'aceptado' || l.estado === 'descartado') return;
    const fecha = l.fechaConsulta || todayIso();
    try {
      await leadsApi.update(userId, l._id, {
        estado: 'consulta_agendada',
        fechaConsulta: fecha,
      });
      await loadData();
      toast.success('Consulta agendada');
    } catch {
      toast.error('No se pudo agendar');
    }
  };

  const discardLead = async (l: LawyerLead) => {
    if (!userId || l.estado === 'aceptado') return;
    try {
      await leadsApi.update(userId, l._id, { estado: 'descartado' });
      await loadData();
      toast.success('Lead descartado');
    } catch {
      toast.error('No se pudo descartar');
    }
  };

  /** Acepta el caso: abre expediente y pasa a la siguiente etapa del flujo. */
  const acceptAndOpenExpediente = async (l: LawyerLead) => {
    if (!userId) return;
    if (l.estado === 'aceptado' && l.expedienteId) {
      navigate(`/saas/lawyer-cases?open=${encodeURIComponent(l.expedienteId)}`);
      return;
    }
    setSaving(true);
    try {
      const existingCases = await casesApi.list(userId);
      const expediente = nextExpedienteNumber(existingCases);
      const created = await casesApi.create(userId, {
        expediente,
        tipo: l.tipoAsunto || 'civil',
        cliente: l.nombre,
        fechaApertura: todayIso(),
        estado: 'abierto',
        abogado: '',
        juzgado: '',
        leadId: l._id,
        urgencia: l.urgencia,
        notas: l.notas || '',
      });
      await leadsApi.update(userId, l._id, {
        estado: 'aceptado',
        expedienteId: created._id,
        expediente,
      });
      toast.success(`Expediente ${expediente} abierto`);
      navigate(`/saas/lawyer-cases?open=${encodeURIComponent(created._id)}&desdeCaptacion=1`);
    } catch {
      toast.error('No se pudo abrir el expediente');
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    'w-full px-3 py-2.5 border border-stone-200 dark:border-stone-700 rounded-xl focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100';
  const labelClass = 'block text-sm font-semibold text-stone-700 dark:text-stone-300 mb-1.5';

  return (
    <Layout title="Captación" subtitle="Leads y primera consulta → apertura de expediente">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Nuevos', value: stats.nuevos, icon: Inbox, color: 'text-blue-600' },
          { label: 'Consultas agendadas', value: stats.consultas, icon: CalendarClock, color: 'text-violet-600' },
          { label: 'Urgentes abiertos', value: stats.urgentes, icon: AlertTriangle, color: 'text-rose-600' },
          { label: 'Aceptados', value: stats.aceptados, icon: CheckCircle2, color: 'text-emerald-600' },
        ].map((s) => (
          <div key={s.label} className="bg-white dark:bg-stone-900 rounded-2xl p-5 border border-stone-200 dark:border-stone-800">
            <div className="flex items-center gap-3 mb-2">
              <s.icon className={`w-5 h-5 ${s.color}`} />
              <span className="text-sm text-stone-500 dark:text-stone-400">{s.label}</span>
            </div>
            <p className="text-2xl font-bold text-stone-900 dark:text-stone-100">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
          <input
            type="text"
            placeholder="Buscar por nombre, teléfono, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            disabled={loading}
            className="w-full pl-10 pr-4 py-2.5 border border-stone-200 dark:border-stone-700 rounded-xl bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <select
              value={filterEstado}
              onChange={(e) => setFilterEstado(e.target.value as LeadEstado | '')}
              disabled={loading}
              className="pl-9 pr-4 py-2.5 border border-stone-200 dark:border-stone-700 rounded-xl bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 outline-none appearance-none cursor-pointer"
            >
              <option value="">Todos los estados</option>
              {Object.entries(ESTADO_CONFIG).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
          <button type="button" onClick={openCreate} className={VERTIAL_BTN_PRIMARY}>
            <UserPlus className="w-4 h-4" />
            Nuevo lead
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 overflow-x-auto">
        <table className="w-full text-sm min-w-[980px]">
          <thead>
            <tr className="border-b border-stone-200 dark:border-stone-800 text-left">
              {['Cliente', 'Canal', 'Asunto', 'Urgencia', 'Consulta', 'Estado', 'Siguiente paso', ''].map((h) => (
                <th key={h || 'actions'} className="px-4 py-3 font-semibold text-stone-500 dark:text-stone-400 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-stone-500">
                  <span className="inline-flex items-center justify-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Cargando…
                  </span>
                </td>
              </tr>
            ) : filtered.map((l) => {
              const CanalIcon = CANAL_ICON[l.canal] || Phone;
              const canAdvance = l.estado !== 'aceptado' && l.estado !== 'descartado';
              return (
                <tr key={l._id} className="border-b border-stone-100 dark:border-stone-800/60 hover:bg-stone-50 dark:hover:bg-stone-800/40 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-stone-900 dark:text-stone-100">{l.nombre}</p>
                    <p className="text-xs text-stone-500 mt-0.5">{l.telefono || l.email || '—'}</p>
                  </td>
                  <td className="px-4 py-3 text-stone-600 dark:text-stone-300">
                    <span className="inline-flex items-center gap-1.5">
                      <CanalIcon className="w-4 h-4 text-stone-400" />
                      {CANAL_LABELS[l.canal] || l.canal}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-stone-600 dark:text-stone-300">{ASUNTO_LABELS[l.tipoAsunto] || l.tipoAsunto}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-semibold ${URGENCIA_CONFIG[l.urgencia]?.cls || ''}`}>
                      {URGENCIA_CONFIG[l.urgencia]?.label || l.urgencia}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-stone-600 dark:text-stone-300 whitespace-nowrap">
                    {l.consultaTipo === 'pago' ? 'De pago' : 'Gratuita'}
                    {l.fechaConsulta ? ` · ${l.fechaConsulta}` : ''}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-semibold ${ESTADO_CONFIG[l.estado]?.cls || ''}`}>
                      {ESTADO_CONFIG[l.estado]?.label || l.estado}
                    </span>
                    {l.expediente ? (
                      <p className="text-xs text-stone-500 mt-1">{l.expediente}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {canAdvance && l.estado === 'nuevo' && (
                        <button type="button" onClick={() => void markContacted(l)} className={`${VERTIAL_BTN_SECONDARY} !min-h-9 !px-3 !py-1.5 text-xs`}>
                          Contactar
                        </button>
                      )}
                      {canAdvance && l.estado !== 'consulta_agendada' && (
                        <button type="button" onClick={() => void scheduleConsulta(l)} className={`${VERTIAL_BTN_SECONDARY} !min-h-9 !px-3 !py-1.5 text-xs`}>
                          Agendar consulta
                        </button>
                      )}
                      {canAdvance && (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void acceptAndOpenExpediente(l)}
                          className={`${VERTIAL_BTN_PRIMARY} !min-h-9 !px-3 !py-1.5 text-xs`}
                        >
                          Abrir expediente
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {l.estado === 'aceptado' && l.expedienteId && (
                        <button
                          type="button"
                          onClick={() => navigate(`/saas/lawyer-cases?open=${encodeURIComponent(l.expedienteId!)}`)}
                          className={`${VERTIAL_BTN_PRIMARY} !min-h-9 !px-3 !py-1.5 text-xs`}
                        >
                          Ver expediente
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 justify-end">
                      <button type="button" onClick={() => openEdit(l)} className="p-1.5 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg transition-colors" title="Editar">
                        <Edit3 className="w-4 h-4 text-stone-500" />
                      </button>
                      {canAdvance && (
                        <button type="button" onClick={() => void discardLead(l)} className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-colors" title="Descartar">
                          <X className="w-4 h-4 text-rose-400" />
                        </button>
                      )}
                      {l.estado === 'descartado' && (
                        <button type="button" onClick={() => void handleDelete(l._id)} className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-colors" title="Eliminar">
                          <X className="w-4 h-4 text-rose-400" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-stone-400">
                  No hay leads. Registra el primer contacto para empezar el flujo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setModalOpen(false)}>
          <form
            onSubmit={(e) => void handleSave(e)}
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-stone-900 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-stone-200 dark:border-stone-800"
          >
            <div className="flex items-center justify-between p-6 border-b border-stone-200 dark:border-stone-800">
              <h2 className="text-xl font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-blue-600" />
                {editing ? 'Editar lead' : 'Nuevo lead'}
              </h2>
              <button type="button" onClick={() => setModalOpen(false)} className="p-2 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-xl">
                <X className="w-5 h-5 text-stone-500" />
              </button>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className={labelClass}>Nombre del cliente</label>
                <input className={inputClass} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required />
              </div>
              <div>
                <label className={labelClass}>Teléfono</label>
                <input className={inputClass} value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
              </div>
              <div>
                <label className={labelClass}>Email</label>
                <input type="email" className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <label className={labelClass}>Canal de entrada</label>
                <select className={inputClass} value={form.canal} onChange={(e) => setForm({ ...form, canal: e.target.value as LeadCanal })}>
                  {Object.entries(CANAL_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Tipo de asunto</label>
                <select className={inputClass} value={form.tipoAsunto} onChange={(e) => setForm({ ...form, tipoAsunto: e.target.value as AsuntoTipo })}>
                  {Object.entries(ASUNTO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Urgencia</label>
                <select className={inputClass} value={form.urgencia} onChange={(e) => setForm({ ...form, urgencia: e.target.value as Urgencia })}>
                  {Object.entries(URGENCIA_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Primera consulta</label>
                <select className={inputClass} value={form.consultaTipo} onChange={(e) => setForm({ ...form, consultaTipo: e.target.value as ConsultaTipo })}>
                  <option value="gratuita">Gratuita</option>
                  <option value="pago">De pago</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Fecha consulta</label>
                <input type="date" className={inputClass} value={form.fechaConsulta} onChange={(e) => setForm({ ...form, fechaConsulta: e.target.value })} />
              </div>
              <div>
                <label className={labelClass}>Estado</label>
                <select className={inputClass} value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value as LeadEstado })}>
                  {Object.entries(ESTADO_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Notas del caso (info básica)</label>
                <textarea
                  className={`${inputClass} min-h-[88px] resize-y`}
                  value={form.notas}
                  onChange={(e) => setForm({ ...form, notas: e.target.value })}
                  placeholder="Resumen breve: hechos, plazos conocidos, documentación pendiente…"
                />
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-stone-900 flex flex-wrap gap-3 p-6 border-t border-stone-200 dark:border-stone-800 rounded-b-2xl">
              <button type="button" onClick={() => setModalOpen(false)} className={`${VERTIAL_BTN_SECONDARY} flex-1`}>
                Cancelar
              </button>
              <button type="submit" disabled={saving} className={`${VERTIAL_BTN_PRIMARY} flex-1`}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Guardar
              </button>
            </div>
          </form>
        </div>
      )}
    </Layout>
  );
}
