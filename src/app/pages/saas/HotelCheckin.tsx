import { useState, useMemo, useCallback, useEffect } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import {
  Search, LogIn, LogOut, CheckCircle, Clock, User,
  BedDouble, FileText, Calendar, AlertCircle, ChevronDown, Loader2,
} from 'lucide-react';

type TabType = 'checkin' | 'checkout';

interface CheckinItem extends VerticalEntity {
  guest: string;
  room: string;
  date: string;
  nights: number;
  documentation: boolean;
  /** check-in vs check-out (evita conflicto con VerticalEntity.type del documento) */
  flow?: TabType;
  processed: boolean;
}

export function HotelCheckin() {
  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<CheckinItem>('hotel', 'checkins'), []);
  const userId = user?.user_id || user?.id || '';

  const [data, setData] = useState<CheckinItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('checkin');
  const [search, setSearch] = useState('');

  const loadData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await api.list(userId);
      setData(
        list.map(doc => ({
          ...doc,
          flow: doc.flow ?? 'checkin',
        })),
      );
    } finally {
      setLoading(false);
    }
  }, [userId, api]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = data.filter(i => {
    const flow = i.flow ?? 'checkin';
    const matchTab = flow === activeTab;
    const matchSearch = i.guest.toLowerCase().includes(search.toLowerCase()) || i.room.includes(search);
    return matchTab && matchSearch;
  });

  const pendingItems = filtered.filter(i => !i.processed);
  const processedItems = filtered.filter(i => i.processed);

  const stats = {
    pendingCheckins: data.filter(i => (i.flow ?? 'checkin') === 'checkin' && !i.processed).length,
    pendingCheckouts: data.filter(i => (i.flow ?? 'checkin') === 'checkout' && !i.processed).length,
    processedToday: data.filter(i => i.processed).length,
  };

  const processItem = async (doc: CheckinItem) => {
    if (!userId) return;
    try {
      await api.update(userId, doc._id, { processed: true });
      await loadData();
    } catch {
      /* error from fetch */
    }
  };

  return (
    <Layout title="Check-in / Check-out">
      <div className="space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: 'Check-ins pendientes', value: stats.pendingCheckins, icon: <LogIn className="w-5 h-5" />, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
            { label: 'Check-outs pendientes', value: stats.pendingCheckouts, icon: <LogOut className="w-5 h-5" />, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30' },
            { label: 'Procesados hoy', value: stats.processedToday, icon: <CheckCircle className="w-5 h-5" />, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
          ].map(s => (
            <div key={s.label} className={`${s.bg} rounded-xl p-4 flex items-center gap-4`}>
              <div className={s.color}>{s.icon}</div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">{s.label}</p>
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs + search */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            <button onClick={() => setActiveTab('checkin')} className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'checkin' ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}>
              <LogIn className="w-4 h-4" /> Check-in
              <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400">{data.filter(i => (i.flow ?? 'checkin') === 'checkin' && !i.processed).length}</span>
            </button>
            <button onClick={() => setActiveTab('checkout')} className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'checkout' ? 'bg-white dark:bg-gray-800 text-amber-600 dark:text-amber-400 shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}>
              <LogOut className="w-4 h-4" /> Check-out
              <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400">{data.filter(i => (i.flow ?? 'checkin') === 'checkout' && !i.processed).length}</span>
            </button>
          </div>
          <div className="relative w-full sm:w-auto sm:min-w-[280px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar huésped o habitación..." disabled={loading} className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-blue-500 outline-none dark:text-gray-100" />
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-12 text-gray-500 dark:text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin" />
            Cargando…
          </div>
        )}

        {/* Pending */}
        {!loading && pendingItems.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Pendientes</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {pendingItems.map(item => (
                <div key={item._id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h4 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                        <User className="w-4 h-4 text-gray-400" /> {item.guest}
                      </h4>
                      <div className="flex items-center gap-3 mt-1 text-sm text-gray-500 dark:text-gray-400">
                        <span className="flex items-center gap-1"><BedDouble className="w-3.5 h-3.5" /> Hab. {item.room}</span>
                        <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {item.date}</span>
                        <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {item.nights} noches</span>
                      </div>
                    </div>
                    <div>
                      {item.documentation ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-1 rounded-full">
                          <FileText className="w-3 h-3" /> Doc. OK
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-2 py-1 rounded-full">
                          <AlertCircle className="w-3 h-3" /> Falta doc.
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => void processItem(item)}
                    disabled={!item.documentation && (item.flow ?? 'checkin') === 'checkin'}
                    className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      activeTab === 'checkin'
                        ? item.documentation
                          ? 'bg-blue-600 hover:bg-blue-700 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                        : 'bg-amber-500 hover:bg-amber-600 text-white'
                    }`}
                  >
                    {activeTab === 'checkin' ? <><LogIn className="w-4 h-4" /> Realizar check-in</> : <><LogOut className="w-4 h-4" /> Realizar check-out</>}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Processed */}
        {!loading && processedItems.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Procesados hoy</h3>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-x-auto">
              <table className="w-full min-w-[700px] text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                    <th className="px-4 py-3 font-medium">Huésped</th>
                    <th className="px-4 py-3 font-medium">Habitación</th>
                    <th className="px-4 py-3 font-medium">Fecha</th>
                    <th className="px-4 py-3 font-medium">Tipo</th>
                    <th className="px-4 py-3 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {processedItems.map(item => (
                    <tr key={item._id} className="border-b border-gray-100 dark:border-gray-700/50">
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{item.guest}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{item.room}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{item.date}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${(item.flow ?? 'checkin') === 'checkin' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'}`}>
                          {(item.flow ?? 'checkin') === 'checkin' ? <LogIn className="w-3 h-3" /> : <LogOut className="w-3 h-3" />}
                          {(item.flow ?? 'checkin') === 'checkin' ? 'Check-in' : 'Check-out'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full">
                          <CheckCircle className="w-3 h-3" /> Completado
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="text-center py-12 text-gray-400 dark:text-gray-500">
            <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-lg">No hay {activeTab === 'checkin' ? 'check-ins' : 'check-outs'} registrados</p>
          </div>
        )}
      </div>
    </Layout>
  );
}
