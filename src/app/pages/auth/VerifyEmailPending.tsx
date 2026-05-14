import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, RefreshCw, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import { VertialLogo } from '../../components/VertialLogo';
import { ACCESO__Button } from '../../components/design-system/ACCESO__Button';
import { useAuth } from '../../context/AuthContext';

const RESEND_COOLDOWN_KEY = 'emailVerifResendAt';
const COOLDOWN_SECONDS = 60;

export function VerifyEmailPending() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, resendVerificationEmail, verifyEmail, refreshCurrentUser } = useAuth();

  const tokenFromUrl = searchParams.get('token');
  const emailFromUrl = searchParams.get('email');

  const [resendState, setResendState] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle');
  const [resendError, setResendError] = useState('');
  const [verifyState, setVerifyState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [verifyError, setVerifyError] = useState('');
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const targetEmail = emailFromUrl || user?.email || '';

  const startCountdown = useCallback((seconds: number) => {
    setCountdown(seconds);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    const storedAt = localStorage.getItem(RESEND_COOLDOWN_KEY);
    if (storedAt) {
      const elapsed = Math.floor((Date.now() - Number(storedAt)) / 1000);
      const remaining = COOLDOWN_SECONDS - elapsed;
      if (remaining > 0) {
        setResendState('sent');
        startCountdown(remaining);
      } else {
        localStorage.removeItem(RESEND_COOLDOWN_KEY);
      }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [startCountdown]);

  useEffect(() => {
    if (tokenFromUrl && emailFromUrl) {
      setVerifyState('loading');
      verifyEmail(tokenFromUrl, emailFromUrl).then((result) => {
        if (result.success) {
          setVerifyState('success');
        } else {
          setVerifyState('error');
          setVerifyError(result.error || 'Enlace inválido o expirado');
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenFromUrl, emailFromUrl]);

  /** Tras verificar con enlace del correo, breve mensaje de éxito y avance. */
  useEffect(() => {
    if (verifyState !== 'success' || !user?.emailVerified) return;
    const t = window.setTimeout(() => {
      navigate(user.accountType === 'user' ? '/saas/worker' : '/auth/onboarding/business-type', { replace: true });
    }, 2000);
    return () => window.clearTimeout(t);
  }, [verifyState, user?.emailVerified, user?.accountType, navigate]);

  /**
   * Si verificaste el email en otra pestaña (mismo navegador), las cookies ya están bien:
   * re-sincronizamos el perfil aquí para que esta pantalla avance sin recargar a mano.
   */
  useEffect(() => {
    if (tokenFromUrl && emailFromUrl) return;
    if (!user?.user_id || user.emailVerified) return;
    if (verifyState === 'loading' || verifyState === 'success') return;

    const tick = () => {
      void refreshCurrentUser();
    };

    const id = window.setInterval(tick, 4000);
    const onFocusOrVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onFocusOrVisible);
    window.addEventListener('focus', onFocusOrVisible);
    tick();

    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
      window.removeEventListener('focus', onFocusOrVisible);
    };
  }, [tokenFromUrl, emailFromUrl, user?.user_id, user?.emailVerified, verifyState, refreshCurrentUser]);

  /** Verificación detectada vía /me (p. ej. otra pestaña) — no pisar la pantalla de éxito del enlace. */
  useEffect(() => {
    if (!user?.emailVerified) return;
    if (verifyState === 'loading' || verifyState === 'success') return;
    navigate(user.accountType === 'user' ? '/saas/worker' : '/auth/onboarding/business-type', { replace: true });
  }, [user?.emailVerified, user?.accountType, verifyState, navigate]);

  const handleResend = async () => {
    if (!targetEmail || countdown > 0) return;
    setResendState('loading');
    setResendError('');
    const result = await resendVerificationEmail(targetEmail);
    if (result.success) {
      setResendState('sent');
      localStorage.setItem(RESEND_COOLDOWN_KEY, String(Date.now()));
      startCountdown(COOLDOWN_SECONDS);
    } else {
      setResendState('error');
      const retryMatch = result.error?.match(/esperar (\d+) segundos/);
      if (retryMatch) {
        const secs = Number(retryMatch[1]);
        startCountdown(secs);
        localStorage.setItem(RESEND_COOLDOWN_KEY, String(Date.now() - (COOLDOWN_SECONDS - secs) * 1000));
      }
      setResendError(result.error || 'Error al reenviar el email');
    }
  };

  // Estado: verificando token de URL
  if (verifyState === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-800 flex items-center justify-center p-6">
        <div className="w-full max-w-md text-center">
          <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl p-10 shadow-sm">
            <div className="flex justify-center mb-6">
              <VertialLogo size="lg" />
            </div>
            <div className="flex justify-center mb-6">
              <div className="w-12 h-12 border-4 border-gray-200 dark:border-gray-700 border-t-black rounded-full animate-spin" />
            </div>
            <p className="text-gray-600 dark:text-gray-400">Verificando tu email...</p>
          </div>
        </div>
      </div>
    );
  }

  // Estado: verificación completada con éxito
  if (verifyState === 'success') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-800 flex items-center justify-center p-6">
        <div className="w-full max-w-md text-center">
          <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl p-10 shadow-sm">
            <div className="flex justify-center mb-6">
              <VertialLogo size="lg" />
            </div>
            <div className="flex justify-center mb-6">
              <CheckCircle className="w-16 h-16 text-green-500" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-3">¡Email verificado!</h1>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Tu cuenta ha sido activada correctamente. Redirigiendo...
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Estado: error de verificación
  if (verifyState === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-800 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl p-10 shadow-sm">
            <div className="flex justify-center mb-6">
              <VertialLogo size="lg" />
            </div>
            <div className="flex justify-center mb-6">
              <AlertCircle className="w-16 h-16 text-red-500" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-3 text-center">Enlace inválido</h1>
            <p className="text-gray-600 dark:text-gray-400 mb-6 text-center">{verifyError}</p>
            {targetEmail && (
              <div className="space-y-3">
                {resendState === 'sent' ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                      <CheckCircle className="w-4 h-4 shrink-0" />
                      <span>Nuevo enlace enviado a <strong>{targetEmail}</strong></span>
                    </div>
                    {countdown > 0 && (
                      <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
                        <Clock className="w-4 h-4" />
                        <span>Podrás reenviar en {countdown}s</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <ACCESO__Button
                    variant="primary"
                    fullWidth
                    disabled={resendState === 'loading' || countdown > 0}
                    onClick={handleResend}
                  >
                    {resendState === 'loading' ? (
                      <span className="flex items-center gap-2 justify-center">
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Enviando...
                      </span>
                    ) : countdown > 0 ? (
                      <span className="flex items-center gap-2 justify-center">
                        <Clock className="w-4 h-4" />
                        Espera {countdown}s
                      </span>
                    ) : (
                      'Solicitar nuevo enlace'
                    )}
                  </ACCESO__Button>
                )}
              </div>
            )}
            <div className="mt-4 text-center">
              <button
                onClick={() => navigate('/auth/login')}
                className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 underline"
              >
                Volver al inicio de sesión
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Estado por defecto: esperar confirmación de email
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-800 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl p-10 shadow-sm">
          <div className="flex justify-center mb-6">
            <VertialLogo size="lg" />
          </div>

          {/* Icono */}
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center">
              <Mail className="w-10 h-10 text-gray-600 dark:text-gray-400" />
            </div>
          </div>

          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-3">Confirma tu email</h1>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
              Te hemos enviado un enlace de verificación a{' '}
              {targetEmail ? (
                <strong className="text-gray-900 dark:text-gray-100">{targetEmail}</strong>
              ) : (
                'tu dirección de email'
              )}
              . Haz clic en el enlace para activar tu cuenta.
            </p>
          </div>

          <div className="space-y-4 mb-6 text-sm text-gray-500 dark:text-gray-400">
            <div className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <span className="mt-0.5 text-gray-400 dark:text-gray-500">·</span>
              <span>El enlace expira en <strong>24 horas</strong></span>
            </div>
            <div className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <span className="mt-0.5 text-gray-400 dark:text-gray-500">·</span>
              <span>Revisa la carpeta de <strong>spam o correo no deseado</strong></span>
            </div>
            <div className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <span className="mt-0.5 text-gray-400 dark:text-gray-500">·</span>
              <span>
                Si ya hiciste clic en el correo en <strong>otra pestaña</strong>, vuelve aquí o espera unos segundos:
                detectamos la verificación automáticamente.
              </span>
            </div>
          </div>

          {/* Reenviar email */}
          {resendState === 'sent' && countdown > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>Nuevo enlace enviado a <strong>{targetEmail}</strong></span>
              </div>
              <div className="flex items-center justify-center gap-2 text-sm text-gray-400 dark:text-gray-500">
                <Clock className="w-4 h-4" />
                <span>Podrás reenviar en {countdown}s</span>
              </div>
            </div>
          ) : resendState === 'sent' && countdown <= 0 ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>Enlace enviado a <strong>{targetEmail}</strong></span>
              </div>
              <ACCESO__Button
                variant="secondary"
                fullWidth
                onClick={() => { setResendState('idle'); handleResend(); }}
              >
                <span className="flex items-center gap-2 justify-center">
                  <RefreshCw className="w-4 h-4" />
                  Reenviar de nuevo
                </span>
              </ACCESO__Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-center text-sm text-gray-500 dark:text-gray-400">¿No has recibido el email?</p>
              <ACCESO__Button
                variant="secondary"
                fullWidth
                disabled={resendState === 'loading' || !targetEmail || countdown > 0}
                onClick={handleResend}
              >
                {resendState === 'loading' ? (
                  <span className="flex items-center gap-2 justify-center">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Enviando...
                  </span>
                ) : countdown > 0 ? (
                  <span className="flex items-center gap-2 justify-center">
                    <Clock className="w-4 h-4" />
                    Espera {countdown}s para reenviar
                  </span>
                ) : (
                  <span className="flex items-center gap-2 justify-center">
                    <RefreshCw className="w-4 h-4" />
                    Reenviar enlace de verificación
                  </span>
                )}
              </ACCESO__Button>
              {resendState === 'error' && resendError && (
                <p className="text-sm text-red-600 text-center">{resendError}</p>
              )}
            </div>
          )}

          <div className="mt-6 text-center">
            <button
              onClick={() => navigate('/auth/login')}
              className="text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 underline"
            >
              Volver al inicio de sesión
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
