import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Layout } from '../../components/saas/Layout';
import { useModalClose } from '../../hooks/useModalClose';
import { useAuth } from '../../context/AuthContext';
import {
  listCleaningServicesRequest,
  updateCleaningServiceRequest,
  type CleaningService,
} from '../../lib/cleaningApi';
import {
  Star, TrendingUp, CheckCircle, AlertTriangle, Loader2,
  Search, X, MapPin, Calendar, User, SprayCan,
} from 'lucide-react';

export function CleaningQuality() {
  const { user } = useAuth();
  const [services, setServices] = useState<CleaningService[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [reviewModal, setReviewModal] = useState<CleaningService | null>(null);
  const [rating, setRating] = useState(0);
  const [qualityNotes, setQualityNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useModalClose(!!reviewModal, () => setReviewModal(null));

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await listCleaningServicesRequest(user.id);
      setServices(data.filter(s => s.status !== 'cancelled'));
    } catch (err: any) {
      toast.error(err.message || 'Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  const completedServices = services.filter(s => s.status === 'completed');
  const ratedServices = completedServices.filter(s => s.qualityRating > 0);
  const avgRating = ratedServices.length > 0 ? (ratedServices.reduce((sum, s) => sum + s.qualityRating, 0) / ratedServices.length).toFixed(1) : '—';
  const incidents = completedServices.filter(s => s.qualityOk === false).length;

  const openReview = (svc: CleaningService) => {
    setReviewModal(svc);
    setRating(svc.qualityRating || 0);
    setQualityNotes(svc.qualityNotes || '');
  };

  const handleSaveReview = async () => {
    if (!user?.id || !reviewModal) return;
    setSaving(true);
    try {
      const updated = await updateCleaningServiceRequest(user.id, {
        ...reviewModal,
        qualityRating: rating,
        qualityNotes,
        qualityOk: rating >= 3,
      } as CleaningService);
      setServices(prev => prev.map(s => s._id === updated._id ? updated : s));
      toast.success('Calidad actualizada');
      setReviewModal(null);
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const filtered = services.filter(s => {
    if (s.status !== 'completed') return false;
    if (search) {
      const q = search.toLowerCase();
      return s.clientName.toLowerCase().includes(q) || s.serviceNumber.toLowerCase().includes(q) || s.address.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <Layout title="Control de Calidad" subtitle="Supervisión y puntuación de servicios">
      <div className="flex flex-col gap-5">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Puntuación media', value: avgRating, icon: <Star className="w-4 h-4" />, bg: 'bg-amber-50', text: 'text-amber-600' },
            { label: 'Servicios revisados', value: ratedServices.length, icon: <CheckCircle className="w-4 h-4" />, bg: 'bg-emerald-50', text: 'text-emerald-600' },
            { label: 'Incidencias', value: incidents, icon: <AlertTriangle className="w-4 h-4" />, bg: 'bg-red-50', text: 'text-red-600' },
            { label: 'Sin revisar', value: completedServices.length - ratedServices.length, icon: <TrendingUp className="w-4 h-4" />, bg: 'bg-blue-50', text: 'text-blue-600' },
          ].map(stat => (
            <div key={stat.label} className={`${stat.bg} rounded-2xl p-4 border border-gray-200 dark:border-gray-700`}>
              <div className="flex items-center gap-2 mb-2">
                <span className={stat.text}>{stat.icon}</span>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{stat.label}</p>
              </div>
              <p className={`text-2xl font-black ${stat.text}`}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar servicio..." className="pl-9 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 w-full" />
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
        ) : filtered.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl p-12 text-center">
            <div className="max-w-sm mx-auto">
              <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-2xl flex items-center justify-center mx-auto mb-5">
                <Star className="w-8 h-8 text-amber-500" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">Sin servicios completados</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Completa servicios para poder revisarlos aquí.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-3">
            {filtered.map(svc => (
              <div key={svc._id} onClick={() => openReview(svc)} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 hover:border-amber-300 dark:hover:border-amber-700 transition-colors cursor-pointer">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-xl flex items-center justify-center shrink-0">
                      <SprayCan className="w-5 h-5 text-amber-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{svc.clientName}</p>
                        <span className="text-xs text-gray-400">{svc.serviceNumber}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="flex items-center gap-1 text-xs text-gray-500"><MapPin className="w-3 h-3" />{svc.address}</span>
                        <span className="flex items-center gap-1 text-xs text-gray-500"><Calendar className="w-3 h-3" />{svc.date}</span>
                        {svc.assignedToName && <span className="flex items-center gap-1 text-xs text-gray-500"><User className="w-3 h-3" />{svc.assignedToName}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {svc.qualityRating > 0 ? (
                      <>
                        {[1, 2, 3, 4, 5].map(n => (
                          <Star key={n} className={`w-4 h-4 ${n <= svc.qualityRating ? 'text-amber-400 fill-amber-400' : 'text-gray-300'}`} />
                        ))}
                      </>
                    ) : (
                      <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded-full text-gray-500">Sin revisar</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quality Review Modal */}
      {reviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setReviewModal(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Revisión de calidad</h2>
                <p className="text-xs text-gray-400">{reviewModal.serviceNumber} — {reviewModal.clientName}</p>
              </div>
              <button onClick={() => setReviewModal(null)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">Puntuación</label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} onClick={() => setRating(n)} className="p-1 transition-transform hover:scale-110">
                      <Star className={`w-8 h-8 ${n <= rating ? 'text-amber-400 fill-amber-400' : 'text-gray-300 dark:text-gray-600'}`} />
                    </button>
                  ))}
                  {rating > 0 && <span className="ml-2 text-sm font-bold text-gray-600 dark:text-gray-300">{rating}/5</span>}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Notas de calidad</label>
                <textarea value={qualityNotes} onChange={e => setQualityNotes(e.target.value)} rows={3} placeholder="Observaciones sobre la calidad del servicio..." className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none" />
              </div>

              {/* Checklist progress */}
              {reviewModal.tasks.length > 0 && (
                <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
                  <p className="text-xs font-semibold text-gray-500 mb-2">Checklist completado</p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full bg-violet-500 rounded-full" style={{ width: `${reviewModal.tasks.length > 0 ? Math.round((reviewModal.tasks.filter(t => t.done).length / reviewModal.tasks.length) * 100) : 0}%` }} />
                    </div>
                    <span className="text-xs text-gray-500">{reviewModal.tasks.filter(t => t.done).length}/{reviewModal.tasks.length}</span>
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 p-5 border-t border-gray-200 dark:border-gray-700">
              <button onClick={() => setReviewModal(null)} className="px-4 py-2 text-sm font-semibold text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors">Cancelar</button>
              <button onClick={handleSaveReview} disabled={saving || rating === 0} className="px-6 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Guardar revisión
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
