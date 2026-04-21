import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  ArrowLeft,
  Calendar,
  CheckSquare,
  Clock,
  FileAudio,
  FileText,
  PhoneIncoming,
  PhoneOutgoing,
  Plus,
  Sparkles,
  Upload,
  User,
} from 'lucide-react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import {
  getCallAudioUrl,
  getCallRequest,
  processCallAudioRequest,
  type CallDirection,
  type CallRecord,
} from '../../lib/callsApi';

interface TaskItem {
  id: string;
  text: string;
  completed: boolean;
}

function createEmptyCall(callId: string): CallRecord {
  return {
    id: callId,
    type: 'call',
    user_id: 'guest',
    clientName: 'Contacto sin identificar',
    clientPhone: '',
    direction: 'incoming',
    status: 'completed',
    duration: 0,
    date: new Date().toISOString(),
    notes: '',
    transcriptionText: '',
    hasAudio: false,
    hasTranscription: false,
    hasAISummary: false,
    createdAt: new Date().toISOString(),
    updatedAt: '',
  };
}

async function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}

async function getAudioDuration(file: File) {
  return new Promise<number>((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const audio = document.createElement('audio');
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      const duration = Number.isFinite(audio.duration) ? Math.round(audio.duration) : 0;
      URL.revokeObjectURL(objectUrl);
      resolve(duration);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(0);
    };
    audio.src = objectUrl;
  });
}

export function CallDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { user } = useAuth();
  const callId = id || 'call-1';
  const userId = user?.user_id || 'guest';
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [call, setCall] = useState<CallRecord>(() => createEmptyCall(callId));
  const [clientName, setClientName] = useState('Contacto sin identificar');
  const [clientPhone, setClientPhone] = useState('');
  const [direction, setDirection] = useState<CallDirection>('incoming');
  const [notes, setNotes] = useState('');
  const [provider, setProvider] = useState<'openai' | 'replicate'>('openai');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [newTask, setNewTask] = useState('');
  const [tasks, setTasks] = useState<TaskItem[]>([]);

  useEffect(() => {
    let mounted = true;

    const applyCallToForm = (nextCall: CallRecord) => {
      setClientName(nextCall.clientName || 'Contacto sin identificar');
      setClientPhone(nextCall.clientPhone || '');
      setDirection(nextCall.direction || 'incoming');
      setNotes(nextCall.notes || '');
      setTasks(
        (nextCall.aiSummary?.nextSteps || []).map((task, index) => ({
          id: `${nextCall.id}-task-${index}`,
          text: task,
          completed: false,
        })),
      );
    };

    const loadCall = async () => {
      setLoading(true);
      setError('');
      try {
        const found = await getCallRequest(callId);
        const nextCall = found || createEmptyCall(callId);
        if (mounted) {
          setCall(nextCall);
          applyCallToForm(nextCall);
        }
      } catch (_error) {
        if (mounted) {
          const emptyCall = createEmptyCall(callId);
          setCall(emptyCall);
          applyCallToForm(emptyCall);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadCall();

    return () => {
      mounted = false;
    };
  }, [callId]);

  const audioUrl = useMemo(
    () => getCallAudioUrl(call.id, call.audio?.attachmentName),
    [call.audio?.attachmentName, call.id],
  );

  const transcriptBlocks = useMemo(
    () =>
      (call.transcriptionText || '')
        .split(/\n+/)
        .map((block) => block.trim())
        .filter(Boolean),
    [call.transcriptionText],
  );

  const formatDuration = (seconds?: number) => {
    if (!seconds) {
      return 'Sin duración';
    }
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const handleAddTask = () => {
    if (!newTask.trim()) {
      return;
    }

    setTasks((current) => [
      ...current,
      { id: `${call.id}-${Date.now()}`, text: newTask.trim(), completed: false },
    ]);
    setNewTask('');
  };

  const toggleTask = (taskId: string) => {
    setTasks((current) =>
      current.map((task) =>
        task.id === taskId ? { ...task, completed: !task.completed } : task,
      ),
    );
  };

  const handleProcessAudio = async () => {
    if (!selectedFile) {
      window.alert('Selecciona un audio antes de procesarlo.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const [audioBase64, duration] = await Promise.all([
        readFileAsDataUrl(selectedFile),
        getAudioDuration(selectedFile),
      ]);

      const savedCall = await processCallAudioRequest(callId, {
        userId,
        clientName: clientName.trim() || 'Contacto sin identificar',
        clientPhone: clientPhone.trim(),
        direction,
        notes: notes.trim(),
        provider,
        audioFileName: selectedFile.name,
        audioContentType: selectedFile.type || 'audio/webm',
        audioBase64,
        audioSize: selectedFile.size,
        duration,
        language: 'es',
      });

      if (!savedCall) {
        throw new Error('No se pudo guardar la llamada');
      }

      setCall(savedCall);
      setClientName(savedCall.clientName || 'Contacto sin identificar');
      setClientPhone(savedCall.clientPhone || '');
      setDirection(savedCall.direction || 'incoming');
      setNotes(savedCall.notes || '');
      setTasks(
        (savedCall.aiSummary?.nextSteps || []).map((task, index) => ({
          id: `${savedCall.id}-task-${index}`,
          text: task,
          completed: false,
        })),
      );
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo procesar el audio');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout title={`Llamada ${call.id}`} subtitle={clientPhone || 'Sube un audio para generar IA'}>
      <div className="space-y-6">
        <button
          onClick={() => navigate('/saas/calls')}
          className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver a llamadas
        </button>

        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-8 text-white">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                  {direction === 'incoming' ? (
                    <PhoneIncoming className="w-6 h-6 text-white" />
                  ) : (
                    <PhoneOutgoing className="w-6 h-6 text-white" />
                  )}
                </div>
                <div>
                  <h1 className="text-3xl font-bold">{clientName || 'Contacto sin identificar'}</h1>
                  <div className="text-blue-100">{clientPhone || 'Sin teléfono asignado'}</div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-6 text-blue-100">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  {new Date(call.date).toLocaleString('es-ES')}
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  {formatDuration(call.duration)}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`px-4 py-2 rounded-full text-sm font-semibold ${
                  direction === 'incoming'
                    ? 'bg-blue-500/30 text-white border-2 border-white/30'
                    : 'bg-purple-500/30 text-white border-2 border-white/30'
                }`}
              >
                {direction === 'incoming' ? 'Entrante' : 'Saliente'}
              </span>
            </div>
          </div>
        </div>

        {error ? (
          <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-6">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                <User className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                Datos de la llamada
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="space-y-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Nombre del cliente</span>
                  <input
                    type="text"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Teléfono</span>
                  <input
                    type="text"
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                </label>
                <label className="space-y-2 md:col-span-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Tipo de llamada</span>
                  <select
                    value={direction}
                    onChange={(e) => setDirection(e.target.value as CallDirection)}
                    className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-lg focus:border-blue-500 focus:outline-none"
                  >
                    <option value="incoming">Entrante</option>
                    <option value="outgoing">Saliente</option>
                  </select>
                </label>
                <label className="space-y-2 md:col-span-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Notas</span>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-lg focus:border-blue-500 focus:outline-none resize-none"
                    placeholder="Añade contexto de la llamada antes de procesar el audio..."
                  />
                </label>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-6">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                Notas y contexto
              </h3>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                {notes || 'Todavía no hay notas guardadas para esta llamada.'}
              </p>
            </div>

            {call.hasAISummary && call.aiSummary ? (
              <div className="bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-200 rounded-xl p-6">
                <h3 className="text-lg font-bold text-purple-900 mb-4 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-purple-600" />
                  Lectura IA de la llamada
                </h3>
                <div className="space-y-4 text-purple-900">
                  <div>
                    <div className="font-semibold mb-1">Objetivo</div>
                    <p className="text-purple-800">{call.aiSummary.objective || 'Sin objetivo detectado'}</p>
                  </div>
                  <div>
                    <div className="font-semibold mb-1">Resumen</div>
                    <p className="text-purple-800">{call.aiSummary.summary || 'Sin resumen disponible'}</p>
                  </div>
                  <div>
                    <div className="font-semibold mb-1">Puntos clave</div>
                    {call.aiSummary.keyPoints.length > 0 ? (
                      <ul className="text-purple-800 space-y-1 list-disc list-inside">
                        {call.aiSummary.keyPoints.map((point) => (
                          <li key={point}>{point}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-purple-800">No se han detectado puntos clave.</p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-800 border-2 border-dashed border-gray-300 rounded-xl p-6 text-center text-gray-500 dark:text-gray-400">
                Sube un audio para generar el apartado de lectura IA.
              </div>
            )}

            {call.hasTranscription && transcriptBlocks.length > 0 ? (
              <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-6">
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                  Transcripción de la llamada
                </h3>
                <div className="space-y-4 text-sm">
                  {transcriptBlocks.map((block, index) => (
                    <div key={`${call.id}-transcript-${index}`} className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg text-gray-700 dark:text-gray-300">
                      {block}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-800 border-2 border-dashed border-gray-300 rounded-xl p-6 text-center text-gray-500 dark:text-gray-400">
                La transcripción aparecerá aquí cuando el audio se procese.
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-6">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                <FileAudio className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                Grabación
              </h3>

              {call.hasAudio && audioUrl ? (
                <div className="space-y-4">
                  <audio controls className="w-full" src={audioUrl}>
                    Tu navegador no soporta reproducción de audio.
                  </audio>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    Audio guardado en CouchDB y disponible para reproducir desde lista y detalle.
                  </div>
                </div>
              ) : (
                <div className="bg-gray-50 dark:bg-gray-800 border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                  <FileAudio className="w-8 h-8 text-gray-400 dark:text-gray-500 mx-auto mb-2" />
                  <div className="text-sm text-gray-600 dark:text-gray-400">Todavía no hay audio guardado</div>
                </div>
              )}

              <div className="mt-4 flex gap-3">
                <button
                  onClick={() => navigate('/saas/calls')}
                  className="flex-1 px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium transition-colors"
                >
                  Atras
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-900 hover:bg-black text-white rounded-lg font-medium transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  Subir audio
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
              />

              <div className="mt-4 space-y-3">
                <label className="space-y-2 block">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Proveedor de transcripción</span>
                  <select
                    value={provider}
                    onChange={(e) => setProvider(e.target.value as 'openai' | 'replicate')}
                    className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-lg focus:border-blue-500 focus:outline-none"
                  >
                    <option value="openai">OpenAI</option>
                    <option value="replicate">Replicate</option>
                  </select>
                </label>

                <div className="text-sm text-gray-600 dark:text-gray-400">
                  {selectedFile ? `Archivo seleccionado: ${selectedFile.name}` : 'Selecciona un audio para procesarlo.'}
                </div>

                <button
                  onClick={() => void handleProcessAudio()}
                  disabled={saving || loading}
                  className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg font-medium transition-colors"
                >
                  {saving ? 'Procesando audio...' : 'Guardar, transcribir y generar IA'}
                </button>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-6">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                Variables IA
              </h3>
              {call.aiVariables ? (
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="text-gray-500 dark:text-gray-400">Intención</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100 text-right">{call.aiVariables.intent}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-gray-500 dark:text-gray-400">Sentimiento</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100 text-right">{call.aiVariables.sentiment}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-gray-500 dark:text-gray-400">Urgencia</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100 text-right">{call.aiVariables.urgency}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-gray-500 dark:text-gray-400">Cita solicitada</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100 text-right">
                      {call.aiVariables.appointmentRequested ? 'Si' : 'No'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-gray-500 dark:text-gray-400">Interés financiación</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100 text-right">
                      {call.aiVariables.financingInterest ? 'Si' : 'No'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-gray-500 dark:text-gray-400">Entrega vehículo</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100 text-right">
                      {call.aiVariables.tradeInInterest ? 'Si' : 'No'}
                    </span>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-gray-400 mb-2">Vehículos detectados</div>
                    <div className="flex flex-wrap gap-2">
                      {call.aiVariables.mentionedVehicles.length > 0 ? (
                        call.aiVariables.mentionedVehicles.map((vehicle) => (
                          <span
                            key={vehicle}
                            className="px-2.5 py-1 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-xs font-medium rounded-full"
                          >
                            {vehicle}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-gray-400 dark:text-gray-500">Sin vehículos detectados</span>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-gray-500 dark:text-gray-400">Las variables aparecerán después del análisis.</div>
              )}
            </div>

            <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-6">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                <CheckSquare className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                Tareas generadas
              </h3>

              <div className="space-y-3 mb-4">
                {tasks.length > 0 ? (
                  tasks.map((task) => (
                    <label
                      key={task.id}
                      className="flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={task.completed}
                        onChange={() => toggleTask(task.id)}
                        className="mt-0.5 w-5 h-5 border-2 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                      />
                      <span
                        className={`flex-1 text-sm ${
                          task.completed ? 'line-through text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-gray-100'
                        }`}
                      >
                        {task.text}
                      </span>
                    </label>
                  ))
                ) : (
                  <div className="text-sm text-gray-500 dark:text-gray-400">Todavía no hay tareas generadas.</div>
                )}
              </div>

              <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newTask}
                    onChange={(e) => setNewTask(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTask();
                      }
                    }}
                    placeholder="Nueva tarea..."
                    className="flex-1 px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg focus:border-blue-500 focus:outline-none text-sm"
                  />
                  <button
                    onClick={handleAddTask}
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-sm text-gray-500 dark:text-gray-400 text-center">Cargando detalle de llamada...</div>
        ) : null}
      </div>
    </Layout>
  );
}
