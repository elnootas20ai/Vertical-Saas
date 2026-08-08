import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, Building2, CheckCircle, Loader2, MapPin, UserPlus } from 'lucide-react';
import { VertialLogo } from '../../components/VertialLogo';
import { ACCESO__Button } from '../../components/design-system/ACCESO__Button';
import { useAuth } from '../../context/AuthContext';
import { AUTH_PATHS } from '../../lib/authEntryPaths';
import {
  previewWorkerInviteLinkRequest,
  type WorkerInviteLinkPreview,
} from '../../lib/workerInviteLinksApi';

export function JoinByInviteLink() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = String(searchParams.get('token') || '').trim();
  const { isAuthenticated, user, joinByInviteLink } = useAuth();

  const [preview, setPreview] = useState<WorkerInviteLinkPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [previewError, setPreviewError] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [success, setSuccess] = useState(false);
  const [redirectTo, setRedirectTo] = useState('/saas/worker/tasks');
  const autoJoinStarted = useRef(false);

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setLoadingPreview(false);
      setPreviewError('El enlace de invitación no es válido.');
      return;
    }
    setLoadingPreview(true);
    previewWorkerInviteLinkRequest(token)
      .then((res) => {
        if (cancelled) return;
        if (!res.ok || !res.preview) {
          setPreviewError(res.error || 'Enlace no válido o caducado.');
          setPreview(null);
          return;
        }
        setPreview(res.preview);
        setPreviewError('');
      })
      .catch(() => {
        if (!cancelled) setPreviewError('No se pudo cargar el enlace. Inténtalo de nuevo.');
      })
      .finally(() => {
        if (!cancelled) setLoadingPreview(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleJoin = useCallback(async () => {
    if (!token) return;
    setJoinError('');
    setJoining(true);
    try {
      const result = await joinByInviteLink(token);
      if (result.success) {
        setSuccess(true);
        setRedirectTo(result.redirectTo || '/saas/worker/tasks');
        return;
      }
      setJoinError(result.error || 'No se pudo unir al equipo');
    } finally {
      setJoining(false);
    }
  }, [joinByInviteLink, token]);

  useEffect(() => {
    if (!success) return;
    const t = window.setTimeout(() => {
      navigate(redirectTo, { replace: true });
    }, 1400);
    return () => window.clearTimeout(t);
  }, [success, redirectTo, navigate]);

  // Tras registro/login con ?join=, unir automáticamente si la sesión ya está lista.
  useEffect(() => {
    if (!token || !preview || !isAuthenticated || !user || success || joining || joinError) return;
    if (autoJoinStarted.current) return;
    autoJoinStarted.current = true;
    void handleJoin();
  }, [token, preview, isAuthenticated, user, success, joining, joinError, handleJoin]);

  const registerHref = `${AUTH_PATHS.register}?join=${encodeURIComponent(token)}`;
  const loginHref = `${AUTH_PATHS.workerLogin}?join=${encodeURIComponent(token)}`;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl p-8 shadow-sm">
          <div className="text-center mb-6">
            <div className="flex items-center justify-center mb-6">
              <VertialLogo size="lg" />
            </div>
            <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <UserPlus className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">
              Unirse al equipo
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Te han invitado con un enlace o código QR
            </p>
          </div>

          {loadingPreview ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              Cargando invitación…
            </div>
          ) : previewError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40 px-4 py-3 text-sm text-red-700 dark:text-red-300 flex gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{previewError}</span>
            </div>
          ) : success ? (
            <div className="text-center py-4">
              <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
              <p className="font-semibold text-gray-900 dark:text-gray-100">Ya formas parte del equipo</p>
              <p className="text-sm text-gray-500 mt-1">Entrando…</p>
            </div>
          ) : preview ? (
            <>
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 px-4 py-3 space-y-2 mb-6">
                <div className="flex items-start gap-2 text-sm">
                  <Building2 className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">Empresa</p>
                    <p className="font-semibold text-gray-900 dark:text-gray-100">{preview.businessName}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <MapPin className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">Centro</p>
                    <p className="font-semibold text-gray-900 dark:text-gray-100">{preview.workCenterName}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <UserPlus className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">Función</p>
                    <p className="font-semibold text-gray-900 dark:text-gray-100">{preview.role}</p>
                  </div>
                </div>
              </div>

              {isAuthenticated && user ? (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600 dark:text-gray-300 text-center">
                    Entrarás como <span className="font-semibold">{user.email}</span>
                  </p>
                  {joinError ? (
                    <p className="text-xs text-red-600 text-center">{joinError}</p>
                  ) : null}
                  <ACCESO__Button
                    type="button"
                    onClick={() => void handleJoin()}
                    disabled={joining}
                    loading={joining}
                    fullWidth
                  >
                    {joining ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Uniéndote…
                      </span>
                    ) : (
                      'Unirme al equipo'
                    )}
                  </ACCESO__Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600 dark:text-gray-300 text-center">
                    Crea tu cuenta de trabajador o entra si ya tienes una.
                  </p>
                  <Link
                    to={registerHref}
                    state={{ accountType: 'user' as const }}
                    className="flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    Crear cuenta y unirme
                  </Link>
                  <Link
                    to={loginHref}
                    className="flex w-full items-center justify-center rounded-xl border-2 border-gray-200 dark:border-gray-600 px-4 py-3 text-sm font-semibold text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    Ya tengo cuenta — entrar
                  </Link>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
