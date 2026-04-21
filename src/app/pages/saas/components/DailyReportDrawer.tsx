import { useState, useEffect, useRef, useMemo } from 'react';
import {
  X, CheckCircle, Clock, AlertCircle, ExternalLink, Plus, Trash2,
  Camera, Upload, AlertTriangle, ChevronRight, Send, Check, XCircle,
} from 'lucide-react';
import type {
  ConstructionDailyReport, ConstructionProject, ConstructionWorker,
  ConstructionTask, ReportMaterial, TaskFoto,
} from '../../../lib/constructionApi';
import {
  createDailyReport, updateDailyReport, submitDailyReport,
  validateDailyReport, rejectDailyReport,
} from '../../../lib/constructionApi';

interface Props {
  report: ConstructionDailyReport | null;
  isNew: boolean;
  projects: ConstructionProject[];
  workers: ConstructionWorker[];
  tasks: ConstructionTask[];
  userId: string;
  onClose: () => void;
  onSaved: () => void;
}

const GREMIOS = ['carpintería', 'peletería', 'lampistería', 'pradurista', 'yesero', 'pintor', 'herrero', 'electricista', 'fontanero', 'albañil', 'otro'];
const INCIDENT_TYPES = [
  { id: 'seguridad', label: 'Seguridad' }, { id: 'calidad', label: 'Calidad' },
  { id: 'material', label: 'Material' }, { id: 'maquinaria', label: 'Maquinaria' },
  { id: 'accidente', label: 'Accidente' }, { id: 'clima', label: 'Clima' }, { id: 'otro', label: 'Otro' },
];
const GRAVEDAD = [
  { id: 'baja', label: 'Baja', color: 'text-gray-600' }, { id: 'media', label: 'Media', color: 'text-yellow-600' },
  { id: 'alta', label: 'Alta', color: 'text-orange-600' }, { id: 'critica', label: 'Crítica', color: 'text-red-600' },
];

type Tab = 'datos' | 'materiales' | 'fotos' | 'incidencia' | 'aprobacion' | 'historial';

const emptyMaterial: ReportMaterial = { materialId: '', nombre: '', cantidad: 0, unidad: 'unidades', costeUnitario: 0, costeTotal: 0 };

export function DailyReportDrawer({ report, isNew, projects, workers, tasks, userId, onClose, onSaved }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [tab, setTab] = useState<Tab>('datos');
  const [saving, setSaving] = useState(false);

  // Form state
  const [fecha, setFecha] = useState(report?.fecha || today);
  const [obraId, setObraId] = useState(report?.obraId || '');
  const [trabajadorId, setTrabajadorId] = useState(report?.trabajadorId || '');
  const [gremio, setGremio] = useState(report?.gremio || '');
  const [tareaId, setTareaId] = useState(report?.tareaId || '');
  const [descripcion, setDescripcion] = useState(report?.descripcion || '');
  const [horasTrabajadas, setHorasTrabajadas] = useState(report?.horasTrabajadas || 0);
  const [horasPrevistas, setHorasPrevistas] = useState(report?.horasPrevistas || 0);
  const [tarifaHora, setTarifaHora] = useState(report?.tarifaHora || 0);
  const [observaciones, setObservaciones] = useState(report?.observaciones || '');
  const [materiales, setMateriales] = useState<ReportMaterial[]>(report?.materiales || []);
  const [fotos, setFotos] = useState<TaskFoto[]>(report?.fotos || []);
  const [tieneIncidencia, setTieneIncidencia] = useState(report?.tieneIncidencia || false);
  const [incTipo, setIncTipo] = useState(report?.incidencia?.tipo || 'otro');
  const [incDescripcion, setIncDescripcion] = useState(report?.incidencia?.descripcion || '');
  const [incGravedad, setIncGravedad] = useState(report?.incidencia?.gravedad || 'media');
  const [motivoRechazo, setMotivoRechazo] = useState('');

  const fotoInputRef = useRef<HTMLInputElement>(null);

  const readOnly = report?.estado === 'validado';
  const canEdit = isNew || report?.estado === 'borrador' || report?.estado === 'rechazado';
  const canValidate = report?.estado === 'enviado';

  const obraNombre = projects.find(p => p._id === obraId)?.nombre || report?.obraNombre || '';

  const filteredWorkers = useMemo(() => {
    if (!obraId) return workers;
    return workers.filter(w => w.obraAsignada === obraId || !w.obraAsignada);
  }, [obraId, workers]);

  const filteredTasks = useMemo(() => {
    if (!obraId) return tasks;
    return tasks.filter(t => t.obraId === obraId);
  }, [obraId, tasks]);

  const trabajadorNombre = workers.find(w => w._id === trabajadorId)?.nombre || report?.trabajadorNombre || '';
  const tareaNombre = tasks.find(t => t._id === tareaId)?.titulo || report?.tareaNombre || '';

  // Auto-fill gremio from worker
  useEffect(() => {
    if (trabajadorId && !gremio) {
      const w = workers.find(w => w._id === trabajadorId);
      if (w?.gremio) setGremio(w.gremio);
    }
  }, [trabajadorId, workers, gremio]);

  const costeMateriales = materiales.reduce((s, m) => s + (m.costeTotal || 0), 0);
  const costeTotal = (horasTrabajadas * tarifaHora) + costeMateriales;

  const handleAddMaterial = () => setMateriales([...materiales, { ...emptyMaterial }]);
  const handleRemoveMaterial = (idx: number) => setMateriales(materiales.filter((_, i) => i !== idx));
  const handleUpdateMaterial = (idx: number, field: keyof ReportMaterial, value: string | number) => {
    setMateriales(materiales.map((m, i) => {
      if (i !== idx) return m;
      const updated = { ...m, [field]: value };
      if (field === 'cantidad' || field === 'costeUnitario') {
        updated.costeTotal = (Number(updated.cantidad) || 0) * (Number(updated.costeUnitario) || 0);
      }
      return updated;
    }));
  };

  const handleFotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1] || '';
        setFotos(prev => [...prev, {
          id: `foto-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          url: '', base64, mimeType: file.type || 'image/jpeg',
          descripcion: file.name, fecha: new Date().toISOString(),
        }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const handleRemoveFoto = (id: string) => setFotos(fotos.filter(f => f.id !== id));

  const buildReportData = (): Partial<ConstructionDailyReport> => ({
    fecha, obraId, obraNombre, trabajadorId, trabajadorNombre, gremio,
    tareaId, tareaNombre, descripcion, horasTrabajadas, horasPrevistas,
    tarifaHora, costeTotal, observaciones, materiales, fotos,
    tieneIncidencia,
    incidencia: tieneIncidencia ? {
      tipo: incTipo as any, descripcion: incDescripcion,
      gravedad: incGravedad as any, fotos: [], incidenciaId: report?.incidencia?.incidenciaId || '',
    } : null,
  });

  const handleSave = async (andSubmit = false) => {
    if (!obraId || !trabajadorId || !descripcion || horasTrabajadas <= 0) return;
    setSaving(true);
    try {
      if (isNew) {
        const created = await createDailyReport(userId, buildReportData());
        if (andSubmit) await submitDailyReport(userId, created._id);
      } else if (report) {
        await updateDailyReport(userId, { ...report, ...buildReportData() } as ConstructionDailyReport);
        if (andSubmit) await submitDailyReport(userId, report._id);
      }
      onSaved();
    } catch { /* */ }
    setSaving(false);
  };

  const handleValidate = async () => {
    if (!report) return;
    setSaving(true);
    try { await validateDailyReport(userId, report._id, userId, ''); onSaved(); } catch { /* */ }
    setSaving(false);
  };

  const handleReject = async () => {
    if (!report || !motivoRechazo) return;
    setSaving(true);
    try { await rejectDailyReport(userId, report._id, motivoRechazo); onSaved(); } catch { /* */ }
    setSaving(false);
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'datos', label: 'Datos' },
    { id: 'materiales', label: `Materiales (${materiales.length})` },
    { id: 'fotos', label: `Fotos (${fotos.length})` },
    { id: 'incidencia', label: 'Incidencia' },
    ...(report && !isNew ? [
      { id: 'aprobacion' as Tab, label: 'Aprobación' },
      { id: 'historial' as Tab, label: 'Historial' },
    ] : []),
  ];

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="fixed top-0 right-0 h-full w-full md:w-[640px] bg-white dark:bg-gray-900 shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              {isNew ? 'Nuevo parte de trabajo' : `${report?.referencia} — ${obraNombre}`}
            </h2>
            {report && !isNew && (
              <p className="text-xs text-gray-500 mt-0.5">
                Creado el {new Date(report.createdAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6" /></button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 dark:border-gray-700 px-6 overflow-x-auto">
          <div className="flex gap-4">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  tab === t.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Tab: Datos */}
          {tab === 'datos' && (
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Obra *</label>
                  <select value={obraId} onChange={e => setObraId(e.target.value)} disabled={readOnly}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white disabled:bg-gray-50 dark:disabled:bg-gray-800/50">
                    <option value="">Seleccionar obra…</option>
                    {projects.filter(p => p.estado === 'en_obra' || p._id === obraId).map(p => (
                      <option key={p._id} value={p._id}>{p.nombre}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Trabajador *</label>
                  <select value={trabajadorId} onChange={e => setTrabajadorId(e.target.value)} disabled={readOnly}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white disabled:bg-gray-50 dark:disabled:bg-gray-800/50">
                    <option value="">Seleccionar trabajador…</option>
                    {filteredWorkers.filter(w => w.activo || w._id === trabajadorId).map(w => (
                      <option key={w._id} value={w._id}>{w.nombre} — {w.gremio}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha *</label>
                  <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} disabled={readOnly}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white disabled:bg-gray-50" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Gremio *</label>
                  <select value={gremio} onChange={e => setGremio(e.target.value)} disabled={readOnly}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white disabled:bg-gray-50 capitalize">
                    <option value="">Seleccionar…</option>
                    {GREMIOS.map(g => <option key={g} value={g} className="capitalize">{g}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Tarea vinculada</label>
                  <select value={tareaId} onChange={e => setTareaId(e.target.value)} disabled={readOnly}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white disabled:bg-gray-50">
                    <option value="">Sin tarea vinculada</option>
                    {filteredTasks.map(t => <option key={t._id} value={t._id}>{t.titulo}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Descripción del trabajo *</label>
                  <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} rows={3} disabled={readOnly}
                    placeholder="Describe el trabajo realizado…"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none disabled:bg-gray-50" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Horas trabajadas *</label>
                  <input type="number" step="0.5" min="0" value={horasTrabajadas || ''} onChange={e => setHorasTrabajadas(Number(e.target.value))} disabled={readOnly}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white disabled:bg-gray-50" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Horas previstas</label>
                  <input type="number" step="0.5" min="0" value={horasPrevistas || ''} onChange={e => setHorasPrevistas(Number(e.target.value))} disabled={readOnly}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white disabled:bg-gray-50" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Tarifa €/h *</label>
                  <input type="number" step="0.5" min="0" value={tarifaHora || ''} onChange={e => setTarifaHora(Number(e.target.value))} disabled={readOnly}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white disabled:bg-gray-50" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Coste total</label>
                  <div className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-blue-50 dark:bg-blue-900/20 font-semibold text-blue-700 dark:text-blue-400">
                    {costeTotal.toFixed(2)} €
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Observaciones</label>
                  <textarea value={observaciones} onChange={e => setObservaciones(e.target.value)} rows={2} disabled={readOnly}
                    placeholder="Notas adicionales…"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none disabled:bg-gray-50" />
                </div>
              </div>
            </div>
          )}

          {/* Tab: Materiales */}
          {tab === 'materiales' && (
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Materiales consumidos</h3>
                {canEdit && (
                  <button onClick={handleAddMaterial} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 border border-blue-300 rounded-lg hover:bg-blue-50">
                    <Plus className="w-3.5 h-3.5" /> Añadir
                  </button>
                )}
              </div>
              {materiales.length === 0 && (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <p className="text-sm">Sin materiales registrados</p>
                </div>
              )}
              {materiales.map((m, idx) => (
                <div key={idx} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-500">Material {idx + 1}</span>
                    {canEdit && (
                      <button onClick={() => handleRemoveMaterial(idx)} className="text-red-500 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <input value={m.nombre} onChange={e => handleUpdateMaterial(idx, 'nombre', e.target.value)} disabled={readOnly}
                        placeholder="Nombre del material" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                    </div>
                    <input type="number" value={m.cantidad || ''} onChange={e => handleUpdateMaterial(idx, 'cantidad', Number(e.target.value))} disabled={readOnly}
                      placeholder="Cantidad" className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                    <select value={m.unidad} onChange={e => handleUpdateMaterial(idx, 'unidad', e.target.value)} disabled={readOnly}
                      className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                      {['unidades', 'kg', 'm', 'm²', 'm³', 'litros', 'sacos', 'piezas'].map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                    <input type="number" value={m.costeUnitario || ''} onChange={e => handleUpdateMaterial(idx, 'costeUnitario', Number(e.target.value))} disabled={readOnly}
                      placeholder="€/unidad" className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                    <div className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-blue-50 dark:bg-blue-900/20 font-medium text-blue-700 dark:text-blue-400">
                      {(m.costeTotal || 0).toFixed(2)} €
                    </div>
                  </div>
                </div>
              ))}
              {materiales.length > 0 && (
                <div className="flex justify-end text-sm font-semibold text-gray-900 dark:text-white">
                  Total materiales: {costeMateriales.toFixed(2)} €
                </div>
              )}
            </div>
          )}

          {/* Tab: Fotos */}
          {tab === 'fotos' && (
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Evidencia fotográfica</h3>
                {canEdit && (
                  <button onClick={() => fotoInputRef.current?.click()} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 border border-blue-300 rounded-lg hover:bg-blue-50">
                    <Camera className="w-3.5 h-3.5" /> Añadir foto
                  </button>
                )}
              </div>
              <input ref={fotoInputRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={handleFotoUpload} />
              {fotos.length === 0 && (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <Camera className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                  <p className="text-sm">Sin fotos adjuntas</p>
                  <p className="text-xs mt-1">Sube fotos del trabajo realizado</p>
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {fotos.map(f => (
                  <div key={f.id} className="relative group">
                    <div className="aspect-square bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden">
                      {f.base64 ? (
                        <img src={`data:${f.mimeType};base64,${f.base64}`} alt={f.descripcion} className="w-full h-full object-cover" />
                      ) : f.url ? (
                        <img src={f.url} alt={f.descripcion} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400"><Camera className="w-8 h-8" /></div>
                      )}
                    </div>
                    {canEdit && (
                      <button onClick={() => handleRemoveFoto(f.id)} className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <p className="text-xs text-gray-500 mt-1 truncate">{f.descripcion}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tab: Incidencia */}
          {tab === 'incidencia' && (
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={tieneIncidencia} onChange={e => setTieneIncidencia(e.target.checked)} disabled={readOnly}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                  <span className="text-sm font-medium text-gray-900 dark:text-white">¿Hay incidencia?</span>
                </label>
                {report?.incidencia?.incidenciaId && (
                  <span className="text-xs text-blue-600 flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> Incidencia creada</span>
                )}
              </div>
              {tieneIncidencia && (
                <div className="space-y-4 border-t border-gray-200 dark:border-gray-700 pt-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo</label>
                      <select value={incTipo} onChange={e => setIncTipo(e.target.value)} disabled={readOnly}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
                        {INCIDENT_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Gravedad</label>
                      <select value={incGravedad} onChange={e => setIncGravedad(e.target.value)} disabled={readOnly}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
                        {GRAVEDAD.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Descripción de la incidencia</label>
                      <textarea value={incDescripcion} onChange={e => setIncDescripcion(e.target.value)} rows={3} disabled={readOnly}
                        placeholder="Describe la incidencia…"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none" />
                    </div>
                  </div>
                  {incGravedad === 'critica' && (
                    <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                      <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-red-700 dark:text-red-400">Incidencia crítica: se notificará a gerencia de forma inmediata al enviar el parte.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Tab: Aprobación */}
          {tab === 'aprobacion' && report && (
            <div className="p-6 space-y-6">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Flujo de aprobación</h3>
              <div className="space-y-4">
                {['borrador', 'enviado', 'validado'].map((step, i) => {
                  const steps = ['borrador', 'enviado', report.estado === 'rechazado' ? 'rechazado' : 'validado'];
                  const stepIdx = steps.indexOf(report.estado);
                  const isActive = i <= stepIdx;
                  const isRejected = step === 'validado' && report.estado === 'rechazado';
                  return (
                    <div key={step} className="flex items-start gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        isRejected ? 'bg-red-100 dark:bg-red-900/30' : isActive ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-gray-100 dark:bg-gray-700'
                      }`}>
                        {isRejected ? <XCircle className="w-4 h-4 text-red-600" /> :
                         isActive ? <CheckCircle className="w-4 h-4 text-blue-600" /> :
                         <Clock className="w-4 h-4 text-gray-400" />}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white capitalize">
                          {isRejected ? 'Rechazado' : step === 'validado' ? 'Validado' : step}
                        </p>
                        {isRejected && report.motivoRechazo && (
                          <p className="text-xs text-red-600 mt-1 bg-red-50 dark:bg-red-900/10 p-2 rounded">{report.motivoRechazo}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {canValidate && (
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-3">
                  <button onClick={handleValidate} disabled={saving}
                    className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2 disabled:opacity-50">
                    <Check className="w-4 h-4" /> Validar parte
                  </button>
                  <div>
                    <textarea value={motivoRechazo} onChange={e => setMotivoRechazo(e.target.value)} rows={2}
                      placeholder="Motivo del rechazo…"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none mb-2" />
                    <button onClick={handleReject} disabled={saving || !motivoRechazo}
                      className="w-full py-2.5 border border-red-300 text-red-600 hover:bg-red-50 text-sm font-medium rounded-lg flex items-center justify-center gap-2 disabled:opacity-50">
                      <XCircle className="w-4 h-4" /> Rechazar parte
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab: Historial */}
          {tab === 'historial' && report && (
            <div className="p-6">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Historial de actividad</h3>
              {(report.historial || []).length === 0 && (
                <p className="text-sm text-gray-500 text-center py-8">Sin actividad registrada</p>
              )}
              <div className="space-y-4">
                {(report.historial || []).map((h, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        h.accion === 'rechazado' ? 'bg-red-100 dark:bg-red-900/30' :
                        h.accion === 'validado' ? 'bg-green-100 dark:bg-green-900/30' :
                        'bg-blue-100 dark:bg-blue-900/30'
                      }`}>
                        <CheckCircle className={`w-4 h-4 ${
                          h.accion === 'rechazado' ? 'text-red-600' :
                          h.accion === 'validado' ? 'text-green-600' :
                          'text-blue-600'
                        }`} />
                      </div>
                      {i < (report.historial || []).length - 1 && <div className="w-0.5 flex-1 bg-gray-200 dark:bg-gray-700 mt-2" />}
                    </div>
                    <div className="flex-1 pb-4">
                      <p className="text-sm font-medium text-gray-900 dark:text-white capitalize">{h.accion}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {new Date(h.fecha).toLocaleString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        {h.usuario && ` — ${h.usuario}`}
                      </p>
                      {h.detalle && <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{h.detalle}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
            Cerrar
          </button>
          {canEdit && (
            <>
              <button onClick={() => handleSave(false)} disabled={saving}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50">
                {saving ? 'Guardando…' : 'Guardar borrador'}
              </button>
              <button onClick={() => handleSave(true)} disabled={saving || !obraId || !trabajadorId || !descripcion || horasTrabajadas <= 0}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-1.5 disabled:opacity-50">
                <Send className="w-4 h-4" /> {saving ? 'Enviando…' : 'Guardar y enviar'}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
