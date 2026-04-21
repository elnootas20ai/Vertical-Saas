import { useState, useMemo, useEffect, useCallback } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import {
  Search, Users, Clock, Activity, QrCode, CreditCard,
  Fingerprint, LogIn, LogOut, TrendingUp, RefreshCw, Loader2,
} from 'lucide-react';

type AccessMethod = 'qr' | 'tarjeta' | 'huella';

interface AccessLog extends VerticalEntity {
  miembro: string;
  horaEntrada: string;
  horaSalida: string | null;
  metodo: AccessMethod;
  foto: string;
}

const METHOD_CONFIG: Record<AccessMethod, { label: string; icon: typeof QrCode; bg: string; text: string }> = {
  qr:      { label: 'QR',      icon: QrCode,     bg: 'bg-blue-100 dark:bg-blue-900/40',   text: 'text-blue-700 dark:text-blue-300' },
  tarjeta: { label: 'Tarjeta', icon: CreditCard,  bg: 'bg-purple-100 dark:bg-purple-900/40', text: 'text-purple-700 dark:text-purple-300' },
  huella:  { label: 'Huella',  icon: Fingerprint, bg: 'bg-teal-100 dark:bg-teal-900/40',   text: 'text-teal-700 dark:text-teal-300' },
};

const METHODS: AccessMethod[] = ['qr', 'tarjeta', 'huella'];

function generateInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

const COLORS = ['bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500', 'bg-rose-500', 'bg-teal-500', 'bg-indigo-500', 'bg-pink-500'];
function avatarColor(name: string) { return COLORS[name.length % COLORS.length]; }

export function GymAccess() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<AccessLog>('gym', 'accessLogs'), []);
  const userId = user?.user_id || user?.id || '';

  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterMethod, setFilterMethod] = useState<AccessMethod | 'all'>('all');
  const [isLive, setIsLive] = useState(true);

  const loadData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await api.list(userId);
      setLogs(list);
    } finally {
      setLoading(false);
    }
  }, [userId, api]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!isLive || !userId) return;
    const interval = setInterval(() => {
      void loadData();
    }, 9000);
    return () => clearInterval(interval);
  }, [isLive, userId, loadData]);

  const simulateEntry = useCallback(async () => {
    if (!userId) return;
    const metodo = METHODS[Math.floor(Math.random() * METHODS.length)];
    const horaEntrada = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    try {
      await api.create(userId, {
        miembro: `Entrada ${horaEntrada}`,
        horaEntrada,
        horaSalida: null,
        metodo,
        foto: '',
      });
      await loadData();
    } catch {
      /* error from fetch layer */
    }
  }, [userId, api, loadData]);

  const filtered = useMemo(() => {
    return logs.filter(l => {
      if (search && !l.miembro.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterMethod !== 'all' && l.metodo !== filterMethod) return false;
      return true;
    });
  }, [logs, search, filterMethod]);

  const stats = useMemo(() => {
    const enGym = logs.filter(l => !l.horaSalida).length;
    const entradasHoy = logs.length;
    const hours = logs.map(l => parseInt(l.horaEntrada.split(':')[0], 10)).filter(h => !Number.isNaN(h));
    const hourCounts: Record<number, number> = {};
    hours.forEach(h => { hourCounts[h] = (hourCounts[h] || 0) + 1; });
    const peakHour = Object.entries(hourCounts).sort(([, a], [, b]) => b - a)[0];
    return { enGym, entradasHoy, horaPico: peakHour ? `${String(peakHour[0]).padStart(2, '0')}:00` : '--:--' };
  }, [logs]);

  const STAT_CARDS = [
    { label: 'En el Gym Ahora',   value: stats.enGym,        icon: Users,      color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30', pulse: true },
    { label: 'Entradas Hoy',      value: stats.entradasHoy,  icon: LogIn,      color: 'text-blue-600 dark:text-blue-400',    bg: 'bg-blue-50 dark:bg-blue-900/30', pulse: false },
    { label: 'Hora Pico',         value: stats.horaPico,     icon: TrendingUp, color: 'text-amber-600 dark:text-amber-400',   bg: 'bg-amber-50 dark:bg-amber-900/30', pulse: false },
  ];

  return (
    <Layout title="Control de Acceso">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {STAT_CARDS.map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-4">
            <div className={`relative p-3 rounded-xl ${s.bg}`}>
              <s.icon className={`w-5 h-5 ${s.color}`} />
              {s.pulse && <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse" />}
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">{s.label}</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative flex-1 w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-gray-900 dark:focus:border-gray-500 outline-none text-sm" placeholder="Buscar miembro..." value={search} onChange={e => setSearch(e.target.value)} disabled={loading} />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select className="text-sm border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none" value={filterMethod} onChange={e => setFilterMethod(e.target.value as AccessMethod | 'all')} disabled={loading}>
              <option value="all">Todos los métodos</option>
              {Object.entries(METHOD_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <button
              onClick={() => setIsLive(l => !l)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition ${isLive ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}`}
            >
              <span className={`w-2 h-2 rounded-full ${isLive ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`} />
              {isLive ? 'En Vivo' : 'Pausado'}
            </button>
            <button type="button" onClick={() => void simulateEntry()} disabled={loading || !userId} className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:opacity-90 transition disabled:opacity-50">
              <RefreshCw className="w-4 h-4" /> Simular Entrada
            </button>
          </div>
        </div>
      </div>

      {/* Occupancy bar */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Ocupación del Gimnasio</span>
          <span className="text-sm text-gray-500 dark:text-gray-400">{stats.enGym} / 100 (capacidad máx.)</span>
        </div>
        <div className="w-full h-4 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${stats.enGym > 80 ? 'bg-red-500' : stats.enGym > 50 ? 'bg-amber-500' : 'bg-emerald-500'}`}
            style={{ width: `${Math.min(stats.enGym, 100)}%` }}
          />
        </div>
      </div>

      {/* Live Log */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
          <Activity className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Registro de Acceso en Tiempo Real</span>
          {isLive && !loading && <span className="ml-auto inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"><span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />Actualizando</span>}
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-700/50 max-h-[500px] overflow-y-auto">
          {loading ? (
            <div className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
              <span className="inline-flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                Cargando…
              </span>
            </div>
          ) : filtered.map(log => {
            const mc = METHOD_CONFIG[log.metodo];
            const MethodIcon = mc.icon;
            return (
              <div key={log._id} className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                <div className={`w-10 h-10 rounded-full ${avatarColor(log.miembro)} flex items-center justify-center text-white text-sm font-bold shrink-0`}>
                  {generateInitials(log.miembro)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{log.miembro}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                      <LogIn className="w-3 h-3" />{log.horaEntrada}
                    </span>
                    {log.horaSalida ? (
                      <span className="inline-flex items-center gap-1 text-xs text-red-500 dark:text-red-400">
                        <LogOut className="w-3 h-3" />{log.horaSalida}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-500">
                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />En el gym
                      </span>
                    )}
                  </div>
                </div>
                <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${mc.bg} ${mc.text}`}>
                  <MethodIcon className="w-3.5 h-3.5" />{mc.label}
                </div>
                {!log.horaSalida && (
                  <div className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {(() => {
                        const [h, m] = log.horaEntrada.split(':').map(Number);
                        const now = new Date();
                        const entryMin = h * 60 + m;
                        const nowMin = now.getHours() * 60 + now.getMinutes();
                        const diff = Math.max(nowMin - entryMin, 0);
                        return diff > 60 ? `${Math.floor(diff / 60)}h ${diff % 60}m` : `${diff}m`;
                      })()}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
          {!loading && filtered.length === 0 && (
            <div className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">No hay registros de acceso.</div>
          )}
        </div>
      </div>
    </Layout>
  );
}
