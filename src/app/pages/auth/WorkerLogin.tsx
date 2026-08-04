import { useState, useCallback, useRef, useEffect, type FormEvent, type PointerEvent } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { Eye, Mail, Lock, ShieldAlert, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTheme } from 'next-themes';
import { ACCESO__Button } from '../../components/design-system/ACCESO__Button';
import { ACCESO__Input } from '../../components/design-system/ACCESO__Input';
import { ACCESO__Checkbox } from '../../components/design-system/ACCESO__Checkbox';
import { VertialLogo } from '../../components/VertialLogo';
import { AccesoSplitLayout } from '../../components/auth/AccesoSplitLayout';
import { AppleSignInButton } from '../../components/auth/AppleSignInButton';
import { useAuth } from '../../context/AuthContext';
import { AUTH_PATHS } from '../../lib/authEntryPaths';
import { WORKER_DEFAULT_LANDING_PATH } from '../../lib/workerProfileCompletion';
import { useGoogleSignIn, googleClientConfigured } from '../../hooks/useGoogleSignIn';
import { shouldHideThirdPartyAuthOnIos, isAppleSignInAvailable } from '../../lib/appStoreCompliance';
import { signInWithApple } from '../../lib/appleSignIn';
import { normalizeTpvTabletCode } from '../../lib/tpvTabletLoginUrl';

const CREDENTIALS_KEY = 'vertial_saved_worker_login';

function loadSavedLogin(): { email: string } | null {
  try {
    const raw = localStorage.getItem(CREDENTIALS_KEY);
    if (!raw) return null;
    return JSON.parse(atob(raw)) as { email: string };
  } catch {
    return null;
  }
}

export function WorkerLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, googleLogin, appleLogin } = useAuth();
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();

  const tpvReturn = location.state as {
    fromTpvTablet?: boolean;
    terminalCode?: string;
    returnTo?: string;
    message?: string;
  } | null;

  const saved = loadSavedLogin();
  const [formData, setFormData] = useState({
    email: saved?.email ?? '',
    password: '',
    remember: saved !== null,
  });
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [lockInfo, setLockInfo] = useState<{ lockUntil?: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [peekPassword, setPeekPassword] = useState(false);
  const [googleTimedOut, setGoogleTimedOut] = useState(false);

  const goAfterLogin = useCallback(
    (fallback?: string) => {
      if (tpvReturn?.fromTpvTablet) {
        const code = normalizeTpvTabletCode(tpvReturn.terminalCode || '');
        navigate(tpvReturn.returnTo || AUTH_PATHS.tpvTabletLogin, {
          replace: true,
          state: code ? { terminalCode: code } : undefined,
        });
        return;
      }
      navigate(fallback || WORKER_DEFAULT_LANDING_PATH);
    },
    [navigate, tpvReturn],
  );

  const handlePasswordPeekStart = (e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setPeekPassword(true);
    const hide = () => {
      setPeekPassword(false);
      window.removeEventListener('pointerup', hide);
      window.removeEventListener('pointercancel', hide);
    };
    window.addEventListener('pointerup', hide);
    window.addEventListener('pointercancel', hide);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const newErrors: { email?: string; password?: string } = {};
    if (!formData.email.trim()) newErrors.email = t('auth.errors.emailRequired');
    if (!formData.password) newErrors.password = t('auth.errors.passwordRequired');

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    if (formData.remember) {
      localStorage.setItem(CREDENTIALS_KEY, btoa(JSON.stringify({ email: formData.email.trim() })));
    } else {
      localStorage.removeItem(CREDENTIALS_KEY);
    }

    setIsSubmitting(true);
    setLockInfo(null);
    const result = await login(formData.email.trim(), formData.password);
    setIsSubmitting(false);

    if (result.success) {
      goAfterLogin(result.redirectTo || WORKER_DEFAULT_LANDING_PATH);
      return;
    }

    if (result.code === 'ACCOUNT_LOCKED') {
      setLockInfo({ lockUntil: result.lockUntil });
      setErrors({ email: result.error || 'Cuenta bloqueada temporalmente' });
      return;
    }

    const msg = (result.error ?? '').trim();
    if (msg) console.warn('[auth/worker-login]', msg);
    setErrors({ email: msg || t('auth.errors.loginError') });
  };

  const handleGoogleCredential = useCallback(async (credential: string) => {
    setIsSubmitting(true);
    setErrors({});
    try {
      const result = await googleLogin(credential);

      if (result.success) {
        goAfterLogin(result.redirectTo || WORKER_DEFAULT_LANDING_PATH);
        return;
      }

      if (result.code === 'GOOGLE_ACCOUNT_NOT_FOUND' && result.googleUser) {
        navigate(AUTH_PATHS.register, {
          state: {
            accountType: 'user' as const,
            googleUser: result.googleUser,
            googleCredential: credential,
          },
        });
        return;
      }

      const msg = (result.error || t('auth.errors.googleError')).trim();
      if (msg) console.warn('[auth/worker-google-login]', msg);
      setErrors({ email: msg || t('auth.errors.googleError') });
    } finally {
      setIsSubmitting(false);
    }
  }, [goAfterLogin, googleLogin, navigate, t]);

  const showAppleAuth = isAppleSignInAvailable();

  const handleAppleSignIn = useCallback(async () => {
    setErrors({});
    setIsSubmitting(true);
    try {
      const apple = await signInWithApple();
      const result = await appleLogin(apple.identityToken, {
        givenName: apple.givenName || undefined,
        familyName: apple.familyName || undefined,
      });
      if (result.success) {
        goAfterLogin(result.redirectTo || WORKER_DEFAULT_LANDING_PATH);
        return;
      }
      if (result.code === 'APPLE_ACCOUNT_NOT_FOUND' && result.appleUser) {
        navigate(AUTH_PATHS.register, {
          state: {
            accountType: 'user' as const,
            appleUser: result.appleUser,
            appleCredential: apple.identityToken,
          },
        });
        return;
      }
      const msg = (result.error || 'Error al acceder con Apple').trim();
      if (msg) console.warn('[auth/worker-apple-login]', msg);
      setErrors({ email: msg });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error al acceder con Apple';
      if (!msg.toLowerCase().includes('cancel')) {
        setErrors({ email: msg });
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [appleLogin, goAfterLogin, navigate]);

  const hideGoogleOnIos = shouldHideThirdPartyAuthOnIos();
  const showGoogleAuth = googleClientConfigured && !hideGoogleOnIos;
  const { ready: googleReady, renderButton } = useGoogleSignIn(handleGoogleCredential);
  const googleBtnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showGoogleAuth || !googleReady || !googleBtnRef.current) return;
    const theme = resolvedTheme === 'dark' ? 'filled_black' : 'filled_blue';
    renderButton(googleBtnRef.current, { theme, size: 'medium', text: 'signin_with' });
  }, [showGoogleAuth, googleReady, renderButton, resolvedTheme]);

  useEffect(() => {
    if (!showGoogleAuth || googleReady) {
      setGoogleTimedOut(false);
      return;
    }
    const timeout = window.setTimeout(() => {
      setGoogleTimedOut(true);
    }, 8000);
    return () => window.clearTimeout(timeout);
  }, [showGoogleAuth, googleReady]);

  return (
    <AccesoSplitLayout visualKey="register-user" scrollable>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-start px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 sm:justify-center sm:p-6 sm:pb-[max(1.25rem,env(safe-area-inset-bottom))] lg:min-h-dvh lg:px-8">
      <div className="w-full max-w-md shrink-0">
        <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl p-4 pb-3.5 sm:p-6 sm:pb-5 shadow-sm">
          <div className="text-center mb-4 sm:mb-5">
            <div className="hidden sm:flex items-center justify-center mb-3">
              <VertialLogo size="lg" />
            </div>
            <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
              <Users className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <span className="inline-block mb-2 px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
              Acceso trabajador
            </span>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">
              Iniciar sesión
            </h1>
          </div>

          {tpvReturn?.message && !lockInfo && (
            <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">{tpvReturn.message}</p>
            </div>
          )}

          {lockInfo && (
            <div className="mb-4 rounded-xl bg-red-50 border border-red-200 p-4 flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-700">Cuenta bloqueada temporalmente</p>
                <p className="text-xs text-red-500 mt-0.5">
                  Demasiados intentos fallidos.
                  {lockInfo.lockUntil
                    ? ` Podrás volver a intentarlo a las ${new Date(lockInfo.lockUntil).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}.`
                    : ''}
                </p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <ACCESO__Input
              label={t('auth.email')}
              type="email"
              placeholder={t('auth.emailPlaceholder')}
              icon={<Mail className="w-5 h-5" />}
              value={formData.email}
              onChange={(e) => {
                setFormData({ ...formData, email: e.target.value });
                setErrors({ ...errors, email: undefined });
              }}
              error={errors.email}
              autoComplete="email"
              autoFocus
            />

            <ACCESO__Input
              label={t('auth.password')}
              type={peekPassword ? 'text' : 'password'}
              placeholder={t('auth.passwordPlaceholder')}
              autoComplete="current-password"
              icon={<Lock className="w-5 h-5" />}
              value={formData.password}
              onChange={(e) => {
                setFormData({ ...formData, password: e.target.value });
                setErrors({ ...errors, password: undefined });
              }}
              error={errors.password}
              suffix={
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={t('auth.passwordPeekLabel')}
                  className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500 hover:text-gray-600 transition-colors select-none touch-manipulation"
                  onPointerDown={handlePasswordPeekStart}
                >
                  <Eye className="w-5 h-5" />
                </button>
              }
            />

            <div className="flex items-center justify-between">
              <ACCESO__Checkbox
                label={t('auth.rememberMe')}
                checked={formData.remember}
                onChange={(e) => setFormData({ ...formData, remember: e.target.checked })}
              />
              <button
                type="button"
                onClick={() => navigate('/auth/recover')}
                className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 transition-colors"
              >
                {t('auth.forgotPassword')}
              </button>
            </div>

            <ACCESO__Button type="submit" variant="primary" fullWidth size="lg" disabled={isSubmitting}>
              {isSubmitting ? 'Entrando...' : 'Entrar a mi panel'}
            </ACCESO__Button>

            {!hideGoogleOnIos && (
              <>
                <div className="relative my-1">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200 dark:border-gray-700" />
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-4 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400">{t('common.or')}</span>
                  </div>
                </div>

                <div className="flex flex-col items-center gap-2.5 w-full">
                  {!showGoogleAuth ? null : !googleReady && !googleTimedOut ? (
                    <div className="min-h-[40px] w-full max-w-sm flex items-center justify-center gap-2 rounded-lg border-2 border-gray-200 dark:border-gray-600 py-2 px-3 text-sm text-gray-500 dark:text-gray-400">
                      <svg className="w-5 h-5 shrink-0 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      <span>{t('auth.googleLogin')}…</span>
                    </div>
                  ) : !googleReady && googleTimedOut ? null : (
                    <div ref={googleBtnRef} className="min-h-[40px] w-full max-w-sm flex justify-center" />
                  )}
                  {showAppleAuth ? (
                    <div className="w-full max-w-sm">
                      <AppleSignInButton disabled={isSubmitting} onPress={handleAppleSignIn} />
                    </div>
                  ) : null}
                </div>
              </>
            )}

            {hideGoogleOnIos && showAppleAuth && (
              <>
                <div className="relative my-1">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200 dark:border-gray-700" />
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-4 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400">{t('common.or')}</span>
                  </div>
                </div>
                <AppleSignInButton disabled={isSubmitting} onPress={handleAppleSignIn} />
              </>
            )}
          </form>

          <p className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
            ¿No tienes cuenta?{' '}
            <button
              type="button"
              onClick={() => navigate(AUTH_PATHS.register, { state: { accountType: 'user' as const } })}
              className="font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              Crear cuenta de trabajador
            </button>
          </p>

          <p className="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
            ¿Usas el TPV en tablet?{' '}
            <button
              type="button"
              onClick={() => navigate(AUTH_PATHS.tpvTabletLogin)}
              className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            >
              Entrar con código de tienda
            </button>
          </p>

          <p className="mt-4 text-center text-sm text-gray-600 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700 pt-4">
            ¿Gestionas la empresa?{' '}
            <button
              type="button"
              onClick={() => navigate(AUTH_PATHS.companyLogin)}
              className="font-medium text-[#0f1419] hover:underline dark:text-gray-100"
            >
              Acceso empresa
            </button>
          </p>
        </div>

        <div className="mt-6 text-center">
          <ACCESO__Button variant="ghost" onClick={() => navigate(AUTH_PATHS.entry)}>
            ← Elegir tipo de acceso
          </ACCESO__Button>
        </div>
      </div>
      </div>
    </AccesoSplitLayout>
  );
}
