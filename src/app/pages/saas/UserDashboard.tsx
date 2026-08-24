import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Building2,
  Send,
  CheckCircle,
  Clock,
  XCircle,
  User,
  LogOut,
  ArrowRight,
  Loader2,
  MapPin,
  Briefcase,
  Mail,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import {
  isWorkerAccount,
  searchBusinessesRequest,
  createJoinRequestRequest,
  getMyJoinRequestsRequest,
  type BusinessSearchResult,
  type JoinRequest,
  type TeamInvitation,
} from '../../lib/authApi';
import {
  resolveWorkerSessionEntryPath,
  userOwnsAnyBusiness,
} from '../../lib/workerProfileCompletion';
import { canUseCeoAdminPanel } from '../../lib/teamManagerAccess';

const STATUS_LABELS: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  pending: { label: 'Pendiente', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', icon: Clock },
  accepted: { label: 'Aceptada', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: CheckCircle },
  rejected: { label: 'Rechazada', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: XCircle },
};

export function UserDashboard() {
  const navigate = useNavigate();
  const { user, logout, listMyInvitations } = useAuth();
  const { businesses, currentBusiness, switchBusiness, isLoading: isLoadingBusinesses } = useBusiness();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<BusinessSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [myRequests, setMyRequests] = useState<JoinRequest[]>([]);
  const [teamInvitations, setTeamInvitations] = useState<TeamInvitation[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [loadingInvitations, setLoadingInvitations] = useState(true);
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [sentSuccess, setSentSuccess] = useState<string | null>(null);

  const isWorker = isWorkerAccount(user);
  const linkedWorker = isWorker && Boolean(String(user?.linkedBusinessId || '').trim());

  // Trabajador ya vinculado → no este home de empresas; va a su backoffice.
  // Administrador/RRHH invitado: panel como el titular.
  useEffect(() => {
    if (!user || !linkedWorker) return;
    navigate(
      canUseCeoAdminPanel(user, businesses) ? '/saas/dashboard' : resolveWorkerSessionEntryPath(user, businesses),
      { replace: true },
    );
  }, [user, linkedWorker, navigate, businesses]);

  const ownsBusiness = userOwnsAnyBusiness(user?.user_id, businesses);
  const ownedBusinesses = useMemo(
    () => businesses.filter((b) => b.owner_user_id === user?.user_id),
    [businesses, user?.user_id],
  );
  const activeOwnedBusiness = useMemo(() => {
    if (ownedBusinesses.length === 0) return null;
    if (currentBusiness && ownedBusinesses.some((b) => b.business_id === currentBusiness.business_id)) {
      return currentBusiness;
    }
    return ownedBusinesses[0];
  }, [ownedBusinesses, currentBusiness]);

  const loadMyRequests = useCallback(async () => {
    try {
      setLoadingRequests(true);
      const res = await getMyJoinRequestsRequest();
      setMyRequests((res as unknown as { joinRequests: JoinRequest[] }).joinRequests || []);
    } catch {
      // silently fail
    } finally {
      setLoadingRequests(false);
    }
  }, []);

  const loadTeamInvitations = useCallback(async () => {
    try {
      setLoadingInvitations(true);
      const list = await listMyInvitations();
      setTeamInvitations(list);
    } catch {
      setTeamInvitations([]);
    } finally {
      setLoadingInvitations(false);
    }
  }, [listMyInvitations]);

  useEffect(() => {
    loadMyRequests();
  }, [loadMyRequests]);

  useEffect(() => {
    loadTeamInvitations();
  }, [loadTeamInvitations]);

  useEffect(() => {
    const handler = () => {
      void loadTeamInvitations();
    };
    window.addEventListener('vertial:invitations:refresh', handler);
    return () => window.removeEventListener('vertial:invitations:refresh', handler);
  }, [loadTeamInvitations]);

  const handleSearch = useCallback(async (q: string) => {
    setSearchQuery(q);
    if (q.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const res = await searchBusinessesRequest(q);
      setSearchResults((res as unknown as { businesses: BusinessSearchResult[] }).businesses || []);
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleSendRequest = async (business: BusinessSearchResult) => {
    setSendingTo(business.business_id);
    try {
      await createJoinRequestRequest(business.business_id);
      setSentSuccess(business.business_id);
      await loadMyRequests();
      setTimeout(() => setSentSuccess(null), 3000);
    } catch {
      // already handled by API
    } finally {
      setSendingTo(null);
    }
  };

  const handleEnterBackoffice = () => {
    const biz = activeOwnedBusiness;
    if (!biz) return;
    switchBusiness(biz.business_id);
    navigate('/saas/dashboard');
  };

  const hasPendingRequestFor = (businessId: string) =>
    myRequests.some((r) => r.business_id === businessId && r.status === 'pending');

  const pendingRequests = myRequests.filter((r) => r.status === 'pending');
  const resolvedRequests = myRequests.filter((r) => r.status !== 'pending');
  const hasAnyPendingSidebar =
    pendingRequests.length > 0 || teamInvitations.length > 0;

  if (linkedWorker) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center text-sm text-gray-500">
        Abriendo tu espacio de trabajo…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-5xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                <User className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  {user?.fullName || 'Mi cuenta'}
                </h1>
                <p className="text-xs text-gray-500 dark:text-gray-400">{user?.email}</p>
              </div>
            </div>
            <button
              onClick={() => { logout(); navigate('/'); }}
              className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Welcome banner */}
        <div className="mb-8 p-6 bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl text-white">
          <h2 className="text-2xl font-bold mb-2">
            Bienvenido, {user?.firstName || 'Usuario'}
          </h2>
          <p className="text-blue-100 text-sm max-w-lg">
            {isWorker
              ? 'Tu cuenta de trabajador está activa. Aquí solo ves invitaciones; no hay selector ni búsqueda de empresas.'
              : ownsBusiness
                ? 'Tu cuenta personal y tu empresa están activas. Puedes entrar al back office o unirte a otra empresa como trabajador.'
                : 'Tu cuenta personal está activa. Busca una empresa para unirte como miembro del equipo, o espera a que te inviten directamente.'}
          </p>
          {ownsBusiness && activeOwnedBusiness && (
            <button
              type="button"
              onClick={handleEnterBackoffice}
              disabled={isLoadingBusinesses}
              className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 bg-white text-blue-700 hover:bg-blue-50 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60"
            >
              {isLoadingBusinesses ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ArrowRight className="w-4 h-4" />
              )}
              Ir al back office
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Owned business */}
            {ownsBusiness && activeOwnedBusiness && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-amber-50 dark:bg-amber-900/30 rounded-xl flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">Tu empresa</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Empresa que has creado en Vertial</p>
                  </div>
                </div>
                <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gradient-to-br from-gray-50 to-white dark:from-gray-800 dark:to-gray-800/70">
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 bg-gray-900 dark:bg-gray-700 rounded-xl flex items-center justify-center shrink-0 overflow-hidden">
                      {activeOwnedBusiness.logo ? (
                        <img src={activeOwnedBusiness.logo} alt="" className="w-12 h-12 object-cover" />
                      ) : (
                        <Building2 className="w-6 h-6 text-white" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">
                          {activeOwnedBusiness.name}
                        </h4>
                        <span className="inline-block px-2 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 text-xs font-medium rounded-full">
                          Empresa activa
                        </span>
                      </div>
                      {activeOwnedBusiness.taxId ? (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                          CIF: {activeOwnedBusiness.taxId}
                        </p>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs font-medium rounded-full mt-1">
                          CIF pendiente
                        </span>
                      )}
                      {activeOwnedBusiness.city && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {activeOwnedBusiness.city}
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleEnterBackoffice}
                    disabled={isLoadingBusinesses}
                    className="w-full mt-4 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
                  >
                    {isLoadingBusinesses ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <ArrowRight className="w-4 h-4" />
                    )}
                    Entrar al panel
                  </button>
                </div>
              </div>
            )}

            {/* Search businesses — solo cuentas personales / dueños; nunca trabajadores */}
            {!isWorker && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">Unirse a una empresa</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Busca por nombre, razón social o CIF</p>
                </div>
              </div>

              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder="Buscar empresas..."
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
                {isSearching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
                )}
              </div>

              {searchResults.length > 0 && (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {searchResults.map((biz) => {
                    const isPending = hasPendingRequestFor(biz.business_id);
                    const justSent = sentSuccess === biz.business_id;
                    const isSending = sendingTo === biz.business_id;

                    return (
                      <div
                        key={biz.business_id}
                        className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                      >
                        <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center shrink-0 overflow-hidden">
                          {biz.logo ? (
                            <img src={biz.logo} alt="" className="w-10 h-10 object-cover" />
                          ) : (
                            <Building2 className="w-5 h-5 text-gray-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">{biz.name}</p>
                          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                            {biz.city && (
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                {biz.city}
                              </span>
                            )}
                            {biz.businessType && (
                              <span className="flex items-center gap-1">
                                <Briefcase className="w-3 h-3" />
                                {biz.businessType}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0">
                          {justSent ? (
                            <span className="flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
                              <CheckCircle className="w-4 h-4" />
                              Enviada
                            </span>
                          ) : isPending ? (
                            <span className="flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                              <Clock className="w-4 h-4" />
                              Pendiente
                            </span>
                          ) : (
                            <button
                              onClick={() => handleSendRequest(biz)}
                              disabled={isSending}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                            >
                              {isSending ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Send className="w-3.5 h-3.5" />
                              )}
                              Solicitar
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {searchQuery.length >= 2 && !isSearching && searchResults.length === 0 && (
                <div className="text-center py-6">
                  <Building2 className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">No se encontraron empresas</p>
                </div>
              )}

              {searchQuery.length < 2 && searchResults.length === 0 && (
                <div className="text-center py-6">
                  <Search className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Escribe al menos 2 caracteres para buscar
                  </p>
                </div>
              )}
            </div>
            )}

            {/* Resolved requests */}
            {resolvedRequests.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Historial de solicitudes</h3>
                <div className="space-y-2">
                  {resolvedRequests.map((req) => {
                    const statusInfo = STATUS_LABELS[req.status] || STATUS_LABELS.pending;
                    const Icon = statusInfo.icon;
                    return (
                      <div key={req.request_id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-700/30">
                        <Building2 className="w-5 h-5 text-gray-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                            {req.businessName}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {new Date(req.createdAt).toLocaleDateString('es-ES')}
                          </p>
                        </div>
                        <span className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}>
                          <Icon className="w-3 h-3" />
                          {statusInfo.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Right sidebar */}
          <div className="space-y-6">
            {/* Pending invitations & join requests */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Solicitudes pendientes</h3>
              {loadingInvitations || loadingRequests ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                </div>
              ) : hasAnyPendingSidebar ? (
                <div className="space-y-3">
                  {teamInvitations.map((inv) => (
                    <button
                      key={inv.invitationId}
                      type="button"
                      onClick={() => navigate('/saas/invitations')}
                      className="w-full text-left p-3 rounded-xl bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800/40 hover:bg-violet-100/80 dark:hover:bg-violet-900/30 transition-colors"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Mail className="w-4 h-4 text-violet-600 dark:text-violet-400 shrink-0" />
                        <p className="text-sm font-medium text-violet-800 dark:text-violet-200 truncate">
                          {inv.businessName || 'Invitación de equipo'}
                        </p>
                      </div>
                      <p className="text-xs text-violet-600 dark:text-violet-400">
                        Te invitan como {inv.role || 'Usuario'}
                        {inv.invitedByName ? ` · ${inv.invitedByName}` : ''}
                      </p>
                      <p className="text-xs text-violet-500 dark:text-violet-400 mt-1 font-medium">
                        Toca para ver y aceptar
                      </p>
                    </button>
                  ))}
                  {pendingRequests.map((req) => (
                    <div key={req.request_id} className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40">
                      <div className="flex items-center gap-2 mb-1">
                        <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        <p className="text-sm font-medium text-amber-800 dark:text-amber-200 truncate">
                          {req.businessName}
                        </p>
                      </div>
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        Solicitud de unión · enviada el {new Date(req.createdAt).toLocaleDateString('es-ES')}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4">
                  <CheckCircle className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">Sin solicitudes pendientes</p>
                  <button
                    type="button"
                    onClick={() => navigate('/saas/invitations')}
                    className="mt-3 text-xs font-medium text-violet-600 dark:text-violet-400 hover:underline"
                  >
                    Ver mis invitaciones
                  </button>
                </div>
              )}
            </div>

            {/* Quick info */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">¿Cómo funciona?</h3>
              <ol className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
                <li className="flex gap-3">
                  <span className="w-6 h-6 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center text-xs font-bold shrink-0">1</span>
                  Busca la empresa donde trabajas
                </li>
                <li className="flex gap-3">
                  <span className="w-6 h-6 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center text-xs font-bold shrink-0">2</span>
                  Envía tu solicitud de unión o acepta una invitación
                </li>
                <li className="flex gap-3">
                  <span className="w-6 h-6 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center text-xs font-bold shrink-0">3</span>
                  La empresa aprueba tu acceso
                </li>
                <li className="flex gap-3">
                  <span className="w-6 h-6 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center text-xs font-bold shrink-0">
                    <CheckCircle className="w-3.5 h-3.5" />
                  </span>
                  Accedes al panel con tu rol asignado
                </li>
              </ol>
            </div>

            {/* Profile link */}
            <button
              onClick={() => navigate('/saas/worker/profile')}
              className="w-full flex items-center gap-3 p-4 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left"
            >
              <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
                <User className="w-5 h-5 text-gray-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Mi perfil</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Editar datos personales</p>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
