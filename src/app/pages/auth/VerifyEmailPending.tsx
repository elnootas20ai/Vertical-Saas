import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { Mail, RefreshCw, CheckCircle, AlertCircle, ArrowLeft } from 'lucide-react';
import { VertialLogo } from '../../components/VertialLogo';
import { ACCESO__Button } from '../../components/design-system/ACCESO__Button';
import { useAuth } from '../../context/AuthContext';
import { broadcastEmailVerified, subscribeEmailVerified } from '../../lib/emailVerifyBroadcast';
import {
  clearPendingVerifyEmail,
  getPendingVerifyEmail,
  setPendingVerifyEmail,
} from '../../lib/onboardingLocalKeys';

const RESEND_COOLDOWN_KEY = 'emailVerifResendAt';
const COOLDOWN_SECONDS = 60;
const REDIRECT_DELAY_MS = 2500;

type LocationState = {
  email?: string;
  verificationEmailSent?: boolean;
};

function postVerifyPath(accountType?: string) {
  return accountType === 'user' ? '/saas/worker' : '/auth/onboarding/business-type';
}

export function VerifyEmailPending() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user, resendVerificationEmail, verifyEmail, refreshCurrentUser } = useAuth();
  const routeState = (location.state as LocationState | null) ?? null;

  const tokenFromUrl = searchParams.get('token');
  const emailFromUrl = searchParams.get('email');

  const [resendState, setResendState] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle');
  const [resendError, setResendError] = useState('');
  const [verifyState, setVerifyState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [verifyError, setVerifyError] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [checkState, setCheckState] = useState<'idle' | 'checking' | 'success'>('idle');
  const [checkMessage, setCheckMessage] = useState('');
  const [deliveryNotice, setDeliveryNotice] = useState<'sent' | 'retrying' | 'failed' | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const redirectScheduledRef = useRef(false);
  const autoSendAttemptedRef = useRef(false);

  const targetEmail = (
    emailFromUrl ||
    routeState?.email ||
    getPendingVerifyEmail() ||
    user?.email ||
    ''
  )
    .trim()
    .toLowerCase();

  useEffect(() => {
    if (targetEmail && !emailFromUrl) {
      setPendingVerifyEmail(targetEmail);
    }
  }, [targetEmail, emailFromUrl]);
  const openedFromEmailLink = Boolean(tokenFromUrl && emailFromUrl);

  const goAfterVerify = useCallback(
    (accountType?: string) => {
      if (redirectScheduledRef.current) return;
      redirectScheduledRef.current = true;
      navigate(postVerifyPath(accountType), { replace: true });
    },
    [navigate],
  );

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
          clearPendingVerifyEmail();
          broadcastEmailVerified(emailFromUrl);
          setVerifyState('success');
          window.setTimeout(() => {
            try {
              window.close();
            } catch {
              /* el navegador suele bloquear close si no es ventana abierta por script */
            }
          }, 800);
        } else {
          setVerifyState('error');
          setVerifyError(result.error || 'Enlace inválido o expirado');
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenFromUrl, emailFromUrl]);

  /** Otra pestaña con «Confirma tu email»: al verificar desde el correo, actualizar al instante. */
  useEffect(() => {
    if (tokenFromUrl && emailFromUrl) return;
    if (!targetEmail) return;

    const email = targetEmail.trim().toLowerCase();
    return subscribeEmailVerified((signal) => {
      if (signal.email !== email) return;
      void refreshCurrentUser().then((result) => {
        if (result.emailVerified) {
          setCheckState('success');
        }
      });
    });
  }, [tokenFromUrl, emailFromUrl, targetEmail, refreshCurrentUser]);

  /** Marca esta pestaña como la de «espera» (registro), no la del enlace del correo. */
  useEffect(() => {
    if (!openedFromEmailLink) {
      sessionStorage.setItem('vertial_verify_waiting', '1');
    }
  }, [openedFromEmailLink]);

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

    const id = window.setInterval(tick, 1500);
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

  /** Verificación detectada vía /me (p. ej. otra pestaña). */
  useEffect(() => {
    if (!user?.emailVerified) return;
    if (verifyState === 'loading') return;
    if (verifyState === 'success') return;
    clearPendingVerifyEmail();
    setCheckState('success');
  }, [user?.emailVerified, verifyState]);

  /** Tras verificar en la pestaña de registro: redirección automática (no en la pestaña del correo). */
  useEffect(() => {
    if (verifyState === 'success' && openedFromEmailLink) return;
    if (checkState !== 'success' && !(verifyState === 'success' && !openedFromEmailLink)) return;
    const t = window.setTimeout(() => goAfterVerify(user?.accountType), REDIRECT_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [verifyState, checkState, openedFromEmailLink, user?.accountType, goAfterVerify]);

  const handleCheckVerified = async () => {
    setCheckMessage('');
    setCheckState('checking');
    const result = await refreshCurrentUser();
    if (result.emailVerified) {
      clearPendingVerifyEmail();
      if (targetEmail) broadcastEmailVerified(targetEmail);
      setCheckState('success');
      return;
    }
    setCheckState('idle');
    if (result.sessionInvalid) {
      setCheckMessage(
        'Esta sesión ya no es válida (cuenta eliminada o distinta). Regístrate de nuevo con tu email o inicia sesión.',
      );
      return;
    }
    setCheckMessage(
      result.ok
        ? 'Aún no detectamos la verificación. Abre el enlace del correo e inténtalo de nuevo.'
        : 'No se pudo comprobar. Inténtalo en unos segundos.',
    );
  };

  const handleResend = async () => {
    if (!targetEmail || countdown > 0) return;
    setResendState('loading');
    setResendError('');
    setDeliveryNotice(null);
    const result = await resendVerificationEmail(targetEmail);
    if (result.success && result.info) {
      setResendState('idle');
      setDeliveryNotice(null);
      setResendError('');
      setCheckMessage(result.info);
      return;
    }
    if (result.success) {
      setResendState('sent');
      setDeliveryNotice('sent');
      setCheckMessage('');
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
      setDeliveryNotice('failed');
    }
  };

  /** Si el registro no pudo enviar el correo, reintentar una vez al llegar aquí. */
  useEffect(() => {
    if (tokenFromUrl || emailFromUrl) return;
    if (autoSendAttemptedRef.current) return;
    if (routeState?.verificationEmailSent !== false) return;
    if (!targetEmail) return;

    autoSendAttemptedRef.current = true;
    setDeliveryNotice('retrying');
    void handleResend();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeState?.verificationEmailSent, targetEmail, tokenFromUrl, emailFromUrl]);

  useEffect(() => {
    if (routeState?.verificationEmailSent === true && deliveryNotice === null) {
      setDeliveryNotice('sent');
    }
  }, [routeState?.verificationEmailSent, deliveryNotice]);

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



  if (verifyState === 'success' && openedFromEmailLink) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-6">
        <div className="w-full max-w-[420px] text-center">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm px-8 py-10">
            <div className="flex justify-center mb-8">
              <VertialLogo size="lg" />
            </div>
            <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/40">
              <CheckCircle className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-50 mb-2">
              Correo confirmado
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
              Tu email ya está verificado. Vuelve a la pestaña de Vertial en el ordenador donde te
              registraste (la pantalla «Revisa tu correo») y pulsa{' '}
              <strong className="text-gray-700 dark:text-gray-200">«Ya he confirmado el email»</strong>.
              El registro continuará allí. Puedes cerrar esta ventana.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (checkState === 'success' || (verifyState === 'success' && !openedFromEmailLink)) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-6">
        <div className="w-full max-w-[420px] text-center">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm px-8 py-10">
            <div className="flex justify-center mb-8">
              <VertialLogo size="lg" />
            </div>
            <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/40">
              <CheckCircle className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-50 mb-2">
              Cuenta verificada
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center justify-center gap-2">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Redirigiendo…
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
            {targetEmail ? (
              <div className="space-y-3">
                {resendState === 'sent' && countdown > 0 && (
                  <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                    <CheckCircle className="w-4 h-4 shrink-0" />
                    <span>Nuevo enlace enviado a <strong>{targetEmail}</strong></span>
                  </div>
                )}
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
                      Reenviar en {countdown}s
                    </span>
                  ) : resendState === 'sent' ? (
                    'Solicitar otro enlace'
                  ) : (
                    'Solicitar nuevo enlace'
                  )}
                </ACCESO__Button>
                {resendState === 'error' && resendError && (
                  <p className="text-sm text-red-600 text-center">{resendError}</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-amber-700 text-center">
                No tenemos tu email en esta pantalla. Vuelve a registrarte o inicia sesión para reenviar el enlace.
              </p>
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
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">Revisa tu correo</h1>
            <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
              Hemos enviado un enlace de confirmación. Ábrelo para activar tu cuenta y, cuando lo hayas
              hecho, vuelve a esta pantalla y pulsa «Ya he confirmado el email».
            </p>
            {targetEmail ? (
              <p className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gray-100 dark:bg-gray-700/80 text-sm font-medium text-gray-900 dark:text-gray-100">
                <Mail className="w-4 h-4 text-gray-500 shrink-0" />
                {targetEmail}
              </p>
            ) : (
              <p className="mt-4 text-sm text-amber-700 dark:text-amber-300">
                No encontramos el email de la cuenta. Inicia sesión de nuevo o repite el registro.
              </p>
            )}
            {(deliveryNotice === 'retrying' || resendState === 'loading') && (
              <p className="mt-4 text-sm text-gray-500 dark:text-gray-400 flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" />
                Enviando correo…
              </p>
            )}
            {deliveryNotice === 'failed' && resendState === 'error' && (
              <p className="mt-4 text-sm text-red-600 dark:text-red-400">
                {resendError || 'No pudimos enviar el correo. Pulsa «Reenviar correo» abajo.'}
              </p>
            )}
          </div>

          <p className="text-sm text-center text-gray-500 dark:text-gray-400 mb-6">
            El enlace caduca en 24 h. Revisa spam si no lo ves en unos minutos.
          </p>

          <div className="space-y-3 mb-6">
            <ACCESO__Button
              variant="primary"
              fullWidth
              disabled={checkState === 'checking'}
              onClick={handleCheckVerified}
            >
              {checkState === 'checking' ? (
                <span className="flex items-center gap-2 justify-center">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Comprobando...
                </span>
              ) : (
                <span className="flex items-center gap-2 justify-center">
                  <CheckCircle className="w-4 h-4" />
                  Ya he confirmado el email
                </span>
              )}
            </ACCESO__Button>
            {checkMessage && (
              <p className="text-sm text-amber-700 dark:text-amber-300 text-center mt-2">{checkMessage}</p>
            )}
          </div>

          <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-700 flex flex-col items-center gap-3">
            <button type="button" onClick={handleResend}
              disabled={resendState === 'loading' || !targetEmail || countdown > 0}
              className="text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 disabled:opacity-40 inline-flex items-center gap-1.5">
              <RefreshCw className={`w-3.5 h-3.5 ${resendState === 'loading' ? 'animate-spin' : ''}`} />
              {countdown > 0 ? `Reenviar en ${countdown}s` : 'Reenviar correo'}
            </button>
            {resendState === 'error' && resendError && <p className="text-sm text-red-600 text-center">{resendError}</p>}
            <button type="button" onClick={() => navigate('/auth/login')}
              className="text-sm text-gray-400 hover:text-gray-600 inline-flex items-center gap-1">
              <ArrowLeft className="w-3.5 h-3.5" /> Volver al inicio de sesión
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
