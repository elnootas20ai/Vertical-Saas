import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  Calendar,
  Clock,
  Eye,
  Pause,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  Play,
  Search,
  Upload,
  User,
} from 'lucide-react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import {
  getCallAudioUrl,
  listCallsRequest,
  type CallRecord,
  type CallStatus,
} from '../../lib/callsApi';

export function Calls() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user } = useAuth();
  const userId = user?.user_id || 'guest';
  const [searchQuery, setSearchQuery] = useState('');
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [playingId, setPlayingId] = useState('');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadCalls = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await listCallsRequest(userId);
        if (mounted) {
          setCalls(data);
        }
      } catch (loadError) {
        if (mounted) {
          setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar las llamadas');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadCalls();

    return () => {
      mounted = false;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [userId]);

  const filteredCalls = useMemo(
    () =>
      calls.filter((call) => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) {
          return true;
        }

        return (
          call.clientName.toLowerCase().includes(query) ||
          call.clientPhone.toLowerCase().includes(query) ||
          call.notes?.toLowerCase().includes(query)
        );
      }),
    [calls, searchQuery],
  );

  const stats = useMemo(
    () => ({
      total: calls.length,
      completed: calls.filter((call) => call.status === 'completed').length,
      missed: calls.filter((call) => call.status === 'missed').length,
      scheduled: calls.filter((call) => call.status === 'scheduled').length,
    }),
    [calls],
  );

  const formatDuration = (seconds?: number) => {
    if (!seconds) {
      return '—';
    }

    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusBadge = (status: CallStatus) => {
    const config = {
      completed: { label: 'Completada', class: 'bg-green-100 text-green-800 border-green-200' },
      missed: { label: 'Perdida', class: 'bg-red-100 text-red-800 border-red-200' },
      scheduled: { label: 'Programada', class: 'bg-blue-100 text-blue-800 border-blue-200' },
    }[status];

    return (
      <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${config.class}`}>
        {config.label}
      </span>
    );
  };

  const handlePlayAudio = async (call: CallRecord) => {
    if (!call.audio?.attachmentName) {
      return;
    }

    if (audioRef.current && playingId === call.id) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
      setPlayingId('');
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    const audio = new Audio(getCallAudioUrl(call.id, call.audio.attachmentName));
    audioRef.current = audio;
    audio.onended = () => {
      setPlayingId('');
      audioRef.current = null;
    };

    try {
      await audio.play();
      setPlayingId(call.id);
    } catch (_error) {
      setPlayingId('');
      window.alert('No se pudo reproducir el audio de la llamada');
    }
  };

  return (
    <Layout title={t('calls.title')} subtitle={t('calls.subtitle')}>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
            <input
              type="text"
              placeholder="Buscar por cliente, teléfono o nota..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none"
            />
          </div>
          <button
            onClick={() => navigate('/saas/calls/call-1')}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors"
          >
            <Upload className="w-4 h-4" />
            Subir audio
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Total</span>
              <Phone className="w-5 h-5 text-gray-400 dark:text-gray-500" />
            </div>
            <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">{stats.total}</div>
          </div>

          <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Completadas</span>
              <Phone className="w-5 h-5 text-green-500" />
            </div>
            <div className="text-3xl font-bold text-green-600">{stats.completed}</div>
          </div>

          <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Perdidas</span>
              <Phone className="w-5 h-5 text-red-500" />
            </div>
            <div className="text-3xl font-bold text-red-600">{stats.missed}</div>
          </div>

          <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Programadas</span>
              <Clock className="w-5 h-5 text-blue-500" />
            </div>
            <div className="text-3xl font-bold text-blue-600">{stats.scheduled}</div>
          </div>
        </div>

        {error ? (
          <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-12 text-center text-gray-500 dark:text-gray-400">
            Cargando llamadas...
          </div>
        ) : filteredCalls.length > 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Tipo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Cliente</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Estado</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Duración</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Fecha</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">IA</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredCalls.map((call) => (
                  <tr key={call.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    <td className="px-4 py-4">
                      <div
                        className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold ${
                          call.direction === 'incoming'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-purple-100 text-purple-800'
                        }`}
                      >
                        {call.direction === 'incoming' ? (
                          <>
                            <PhoneIncoming className="w-3 h-3" />
                            Entrante
                          </>
                        ) : (
                          <>
                            <PhoneOutgoing className="w-3 h-3" />
                            Saliente
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                          <User className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                        </div>
                        <div>
                          <div className="font-semibold text-gray-900 dark:text-gray-100">{call.clientName}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">{call.clientPhone || 'Sin teléfono'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">{getStatusBadge(call.status)}</td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 font-mono">
                        <Clock className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                        {formatDuration(call.duration)}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <Calendar className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                        {new Date(call.date).toLocaleString('es-ES', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      {call.hasAISummary ? (
                        <div className="flex flex-wrap gap-1">
                          <span className="px-2 py-1 bg-gradient-to-r from-purple-100 to-pink-100 text-purple-800 text-xs font-semibold rounded-full">
                            IA
                          </span>
                          {call.hasTranscription ? (
                            <span className="px-2 py-1 bg-cyan-100 text-cyan-800 text-xs font-semibold rounded-full">
                              Texto
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400 dark:text-gray-500">Pendiente</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-center gap-2">
                        {call.audio?.attachmentName ? (
                          <button
                            onClick={() => void handlePlayAudio(call)}
                            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                            title="Reproducir audio"
                          >
                            {playingId === call.id ? (
                              <Pause className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                            ) : (
                              <Play className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                            )}
                          </button>
                        ) : null}
                        <button
                          onClick={() => navigate(`/saas/calls/${call.id}`)}
                          className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                          title="Ver detalle"
                        >
                          <Eye className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-12 text-center">
            <div className="text-6xl mb-4">📞</div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">No hay llamadas guardadas</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Sube un audio desde el detalle para crear la fila, guardar la transcripción y el resumen IA.
            </p>
            <button
              onClick={() => navigate('/saas/calls/call-1')}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors"
            >
              <Upload className="w-4 h-4" />
              Ir a subir audio
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
}
