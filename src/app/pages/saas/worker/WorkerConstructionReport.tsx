import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import {
  ArrowLeft, ClipboardCheck, ChevronRight, ChevronLeft, Camera, Plus,
  Trash2, AlertTriangle, Check, Send, X,
} from 'lucide-react';
import type {
  ConstructionDailyReport, ConstructionProject, ConstructionWorker,
  ConstructionTask, ReportMaterial, TaskFoto,
} from '../../../lib/constructionApi';
import {
  listConstructionProjects, listConstructionWorkers, listConstructionTasks,
  createDailyReport, submitDailyReport,
} from '../../../lib/constructionApi';
import { AUTH_PATHS } from '../../../lib/authEntryPaths';

const GREMIOS = ['carpintería', 'peletería', 'lampistería', 'pradurista', 'yesero', 'pintor', 'herrero', 'electricista', 'fontanero', 'albañil', 'otro'];

export function WorkerConstructionReport() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const userId = user?.user_id || user?.id || '';
  const today = new Date().toISOString().slice(0, 10);

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const [projects, setProjects] = useState<ConstructionProject[]>([]);
  const [workers, setWorkers] = useState<ConstructionWorker[]>([]);
  const [tasks, setTasks] = useState<ConstructionTask[]>([]);

  // Form
  const [obraId, setObraId] = useState('');
  const [trabajadorId, setTrabajadorId] = useState('');
  const [gremio, setGremio] = useState('');
  const [tareaId, setTareaId] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [horasTrabajadas, setHorasTrabajadas] = useState(8);
  const [tarifaHora, setTarifaHora] = useState(0);
  const [materiales, setMateriales] = useState<ReportMaterial[]>([]);
  const [fotos, setFotos] = useState<TaskFoto[]>([]);
  const [observaciones, setObservaciones] = useState('');
  const [tieneIncidencia, setTieneIncidencia] = useState(false);
  const [incTipo, setIncTipo] = useState('otro');
  const [incDescripcion, setIncDescripcion] = useState('');
  const [incGravedad, setIncGravedad] = useState('media');

  const fotoInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    const [p, w, t] = await Promise.all([
      listConstructionProjects(userId),
      listConstructionWorkers(userId),
      listConstructionTasks(userId),
    ]);
    setProjects(p);
    setWorkers(w);
    setTasks(t);

    // Pre-seleccionar si el trabajador solo tiene una obra
    const activeWorkers = w.filter(wr => wr.activo);
    if (activeWorkers.length === 1) {
      setTrabajadorId(activeWorkers[0]._id);
      if (activeWorkers[0].gremio) setGremio(activeWorkers[0].gremio);
      if (activeWorkers[0].obraAsignada) setObraId(activeWorkers[0].obraAsignada);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const obraNombre = projects.find(p => p._id === obraId)?.nombre || '';
  const trabajadorNombre = workers.find(w => w._id === trabajadorId)?.nombre || '';
  const tareaNombre = tasks.find(t => t._id === tareaId)?.titulo || '';
  const filteredTasks = obraId ? tasks.filter(t => t.obraId === obraId) : tasks;
  const costeMateriales = materiales.reduce((s, m) => s + (m.costeTotal || 0), 0);
  const costeTotal = (horasTrabajadas * tarifaHora) + costeMateriales;

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

  const handleSave = async (andSubmit: boolean) => {
    setSaving(true);
    try {
      const data: Partial<ConstructionDailyReport> = {
        fecha: today, obraId, obraNombre, trabajadorId, trabajadorNombre, gremio,
        tareaId, tareaNombre, descripcion, horasTrabajadas, horasPrevistas: 0,
        tarifaHora, costeTotal, observaciones, materiales, fotos,
        tieneIncidencia,
        incidencia: tieneIncidencia ? {
          tipo: incTipo as any, descripcion: incDescripcion,
          gravedad: incGravedad as any, fotos: [], incidenciaId: '',
        } : null,
      };
      const created = await createDailyReport(userId, data);
      if (andSubmit) await submitDailyReport(userId, created._id);
      setSuccess(true);
      setTimeout(() => navigate(AUTH_PATHS.tpvTabletLogin), 1500);
    } catch { /* */ }
    setSaving(false);
  };

  const canAdvance = () => {
    if (step === 0) return obraId && trabajadorId && descripcion && horasTrabajadas > 0;
    return true;
  };

  if (success) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto">
            <Check className="w-10 h-10 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Parte registrado</h2>
          <p className="text-sm text-gray-500">Redirigiendo…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-gray-700"><ArrowLeft className="w-5 h-5" /></button>
          <ClipboardCheck className="w-5 h-5 text-blue-600" />
          <div>
            <h1 className="text-base font-bold text-gray-900 dark:text-white">Mi parte de hoy</h1>
            <p className="text-xs text-gray-500">{new Date(today).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          </div>
        </div>
        {/* Steps */}
        <div className="flex gap-1 mt-3">
          {['Trabajo', 'Materiales', 'Fotos', 'Revisión'].map((s, i) => (
            <div key={s} className={`flex-1 h-1 rounded-full ${i <= step ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'}`} />
          ))}
        </div>
      </div>

      <div className="px-4 py-6 max-w-lg mx-auto space-y-5">
        {/* Paso 0: Trabajo */}
        {step === 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Trabajo realizado</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Obra *</label>
              <select value={obraId} onChange={e => setObraId(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
                <option value="">Seleccionar obra…</option>
                {projects.filter(p => p.estado === 'en_obra').map(p => <option key={p._id} value={p._id}>{p.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Trabajador *</label>
              <select value={trabajadorId} onChange={e => { setTrabajadorId(e.target.value); const w = workers.find(wr => wr._id === e.target.value); if (w?.gremio) setGremio(w.gremio); }}
                className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
                <option value="">Seleccionar…</option>
                {workers.filter(w => w.activo).map(w => <option key={w._id} value={w._id}>{w.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Gremio</label>
              <select value={gremio} onChange={e => setGremio(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white capitalize">
                <option value="">Seleccionar…</option>
                {GREMIOS.map(g => <option key={g} value={g} className="capitalize">{g}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tarea</label>
              <select value={tareaId} onChange={e => setTareaId(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
                <option value="">Sin tarea vinculada</option>
                {filteredTasks.map(t => <option key={t._id} value={t._id}>{t.titulo}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">¿Qué has hecho hoy? *</label>
              <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} rows={3}
                placeholder="Describe el trabajo realizado…"
                className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Horas *</label>
                <input type="number" step="0.5" min="0" value={horasTrabajadas || ''} onChange={e => setHorasTrabajadas(Number(e.target.value))}
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tarifa €/h</label>
                <input type="number" step="0.5" min="0" value={tarifaHora || ''} onChange={e => setTarifaHora(Number(e.target.value))}
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
              </div>
            </div>
          </div>
        )}

        {/* Paso 1: Materiales */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Materiales usados</h2>
              <button onClick={() => setMateriales([...materiales, { materialId: '', nombre: '', cantidad: 0, unidad: 'unidades', costeUnitario: 0, costeTotal: 0 }])}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 border border-blue-300 rounded-lg">
                <Plus className="w-3.5 h-3.5" /> Añadir
              </button>
            </div>
            <p className="text-xs text-gray-500">Opcional — puedes saltar este paso</p>
            {materiales.map((m, idx) => (
              <div key={idx} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-medium text-gray-500">Material {idx + 1}</span>
                  <button onClick={() => setMateriales(materiales.filter((_, i) => i !== idx))} className="text-red-500"><Trash2 className="w-4 h-4" /></button>
                </div>
                <input value={m.nombre} onChange={e => { const u = [...materiales]; u[idx] = { ...m, nombre: e.target.value }; setMateriales(u); }}
                  placeholder="Nombre" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" value={m.cantidad || ''} onChange={e => { const u = [...materiales]; const q = Number(e.target.value); u[idx] = { ...m, cantidad: q, costeTotal: q * m.costeUnitario }; setMateriales(u); }}
                    placeholder="Cantidad" className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                  <input type="number" value={m.costeUnitario || ''} onChange={e => { const u = [...materiales]; const c = Number(e.target.value); u[idx] = { ...m, costeUnitario: c, costeTotal: m.cantidad * c }; setMateriales(u); }}
                    placeholder="€/unidad" className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Paso 2: Fotos */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Fotos del trabajo</h2>
            <p className="text-xs text-gray-500">Sube fotos como evidencia del trabajo realizado</p>
            <input ref={fotoInputRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={handleFotoUpload} />
            <button onClick={() => fotoInputRef.current?.click()}
              className="w-full py-10 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl flex flex-col items-center gap-2 text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors">
              <Camera className="w-10 h-10" />
              <span className="text-sm font-medium">Toca para hacer foto o subir</span>
            </button>
            <div className="grid grid-cols-3 gap-3">
              {fotos.map(f => (
                <div key={f.id} className="relative aspect-square bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden">
                  <img src={`data:${f.mimeType};base64,${f.base64}`} alt="" className="w-full h-full object-cover" />
                  <button onClick={() => setFotos(fotos.filter(ff => ff.id !== f.id))}
                    className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Paso 3: Revisión */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Revisión</h2>
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
              <div className="p-4 flex justify-between"><span className="text-sm text-gray-500">Obra</span><span className="text-sm font-medium text-gray-900 dark:text-white">{obraNombre}</span></div>
              <div className="p-4 flex justify-between"><span className="text-sm text-gray-500">Trabajador</span><span className="text-sm font-medium text-gray-900 dark:text-white">{trabajadorNombre}</span></div>
              <div className="p-4 flex justify-between"><span className="text-sm text-gray-500">Gremio</span><span className="text-sm font-medium text-gray-900 dark:text-white capitalize">{gremio || '—'}</span></div>
              <div className="p-4 flex justify-between"><span className="text-sm text-gray-500">Horas</span><span className="text-sm font-medium text-gray-900 dark:text-white">{horasTrabajadas}h</span></div>
              <div className="p-4 flex justify-between"><span className="text-sm text-gray-500">Coste total</span><span className="text-sm font-bold text-blue-600">{costeTotal.toFixed(2)} €</span></div>
              <div className="p-4 flex justify-between"><span className="text-sm text-gray-500">Materiales</span><span className="text-sm font-medium text-gray-900 dark:text-white">{materiales.length}</span></div>
              <div className="p-4 flex justify-between"><span className="text-sm text-gray-500">Fotos</span><span className="text-sm font-medium text-gray-900 dark:text-white">{fotos.length}</span></div>
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p className="text-sm text-gray-700 dark:text-gray-300">{descripcion}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Observaciones</label>
              <textarea value={observaciones} onChange={e => setObservaciones(e.target.value)} rows={2}
                placeholder="Notas adicionales…"
                className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none" />
            </div>
            <label className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg cursor-pointer">
              <input type="checkbox" checked={tieneIncidencia} onChange={e => setTieneIncidencia(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-amber-600" />
              <div>
                <span className="text-sm font-medium text-amber-900 dark:text-amber-200">Reportar incidencia</span>
                <p className="text-xs text-amber-700 dark:text-amber-400">Marca si hubo algún problema en la obra</p>
              </div>
            </label>
            {tieneIncidencia && (
              <div className="space-y-3 pl-1">
                <select value={incTipo} onChange={e => setIncTipo(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
                  {[{ id: 'seguridad', l: 'Seguridad' }, { id: 'calidad', l: 'Calidad' }, { id: 'material', l: 'Material' }, { id: 'maquinaria', l: 'Maquinaria' }, { id: 'accidente', l: 'Accidente' }, { id: 'clima', l: 'Clima' }, { id: 'otro', l: 'Otro' }].map(t => (
                    <option key={t.id} value={t.id}>{t.l}</option>
                  ))}
                </select>
                <select value={incGravedad} onChange={e => setIncGravedad(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
                  {[{ id: 'baja', l: 'Baja' }, { id: 'media', l: 'Media' }, { id: 'alta', l: 'Alta' }, { id: 'critica', l: 'Crítica' }].map(g => (
                    <option key={g.id} value={g.id}>{g.l}</option>
                  ))}
                </select>
                <textarea value={incDescripcion} onChange={e => setIncDescripcion(e.target.value)} rows={2}
                  placeholder="Describe la incidencia…"
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation footer */}
      <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center gap-3">
        {step > 0 && (
          <button onClick={() => setStep(step - 1)} className="flex items-center gap-1 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg">
            <ChevronLeft className="w-4 h-4" /> Atrás
          </button>
        )}
        <div className="flex-1" />
        {step < 3 ? (
          <button onClick={() => setStep(step + 1)} disabled={!canAdvance()}
            className="flex items-center gap-1 px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50">
            Siguiente <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => handleSave(false)} disabled={saving}
              className="px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-50">
              Borrador
            </button>
            <button onClick={() => handleSave(true)} disabled={saving}
              className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50">
              <Send className="w-4 h-4" /> Enviar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
