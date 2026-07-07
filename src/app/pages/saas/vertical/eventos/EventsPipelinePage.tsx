import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../../../../components/saas/Layout';
import { useAuth } from '../../../../context/AuthContext';
import { loadEvents } from '../../../../lib/eventsFlow';
import { EVENT_CONTRACT_STAGES, type EventContractStage, type EventRecord } from '../../../../lib/eventsTypes';
import { EventStageBadge } from '../../../../components/saas/events/EventContractStepper';
import { Plus, Search, Loader2 } from 'lucide-react';

export function EventsPipelinePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.user_id || user?.id || '';
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStage, setFilterStage] = useState<EventContractStage | ''>('');

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      setEvents(await loadEvents(userId));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const filtered = useMemo(() => {
    return events
      .filter((e) => {
        const q = search.toLowerCase();
        const matchQ = !q || e.nombre.toLowerCase().includes(q) || e.cliente.toLowerCase().includes(q);
        const matchS = !filterStage || e.estado === filterStage;
        return matchQ && matchS;
      })
      .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  }, [events, search, filterStage]);

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-4 pb-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Contrataciones</h1>
            <p className="text-sm text-gray-500">Todas las operaciones en curso, por fase</p>
          </div>
          <button type="button" onClick={() => navigate('/saas/vertical/eventos/nueva-contratacion')} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-600 text-white text-sm font-semibold">
            <Plus className="w-4 h-4" /> Nueva
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm" placeholder="Buscar…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm" value={filterStage} onChange={(e) => setFilterStage(e.target.value as EventContractStage | '')}>
            <option value="">Todas las fases</option>
            {EVENT_CONTRACT_STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
        ) : (
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-white dark:bg-gray-950">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900 text-left text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-3">Evento</th>
                  <th className="px-4 py-3 hidden sm:table-cell">Cliente</th>
                  <th className="px-4 py-3 hidden md:table-cell">Fecha</th>
                  <th className="px-4 py-3">Fase</th>
                  <th className="px-4 py-3 text-right">Presupuesto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filtered.map((event) => (
                  <tr key={event._id} className="hover:bg-gray-50 dark:hover:bg-gray-900/40 cursor-pointer" onClick={() => navigate(`/saas/vertical/eventos/${event._id}`)}>
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{event.nombre}</td>
                    <td className="px-4 py-3 hidden sm:table-cell text-gray-600 dark:text-gray-400">{event.cliente}</td>
                    <td className="px-4 py-3 hidden md:table-cell text-gray-600 dark:text-gray-400">{event.fecha ? new Date(event.fecha).toLocaleDateString('es-ES') : '—'}</td>
                    <td className="px-4 py-3"><EventStageBadge stage={event.estado} /></td>
                    <td className="px-4 py-3 text-right font-semibold">{(Number(event.presupuesto) || 0).toLocaleString('es-ES')} €</td>
                  </tr>
                ))}
                {!filtered.length && (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400">Sin contrataciones</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}
