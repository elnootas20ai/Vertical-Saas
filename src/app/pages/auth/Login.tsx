import { useState, useCallback, useRef, useEffect, type FormEvent, type PointerEvent } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { Eye, Mail, Lock, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTheme } from 'next-themes';
import { ACCESO__Button } from '../../components/design-system/ACCESO__Button';
import { ACCESO__Input } from '../../components/design-system/ACCESO__Input';
import { ACCESO__Checkbox } from '../../components/design-system/ACCESO__Checkbox';
import { VertialLogo } from '../../components/VertialLogo';
import { useAuth } from '../../context/AuthContext';
import { useGoogleSignIn, googleClientConfigured } from '../../hooks/useGoogleSignIn';
import { AUTH_PATHS } from '../../lib/authEntryPaths';
import { writeDeliveryOpsSelectedPdvId } from '../../lib/deliveryOpsPdvSelection';
import { seedRetailScopeCacheFromTabletLogin } from '../../lib/retailScopeCache';
import {
  writeTpvTabletBinding,
  TPV_TABLET_DELIVERY_PATH,
} from '../../lib/tpvTabletSession';
import { useBusiness } from '../../context/BusinessContext';

const CREDENTIALS_KEY = 'vertial_saved_login';

function loadSavedLogin(): { email: string } | null {
  try {
    const raw = localStorage.getItem(CREDENTIALS_KEY);
    if (!raw) return null;
    const decoded = atob(raw);
    return JSON.parse(decoded) as { email: string };
  } catch {
    return null;
  }
}

export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, googleLogin, requestLoginCode, verifyLoginCode, tpvTabletLogin } = useAuth();
  const { switchBusiness, reloadBusinesses } = useBusiness();
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();

  const saved = loadSavedLogin();
  const [formData, setFormData] = useState({
    email: saved?.email ?? '',
    password: '',
    remember: saved !== null,
  });
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [lockInfo, setLockInfo] = useState<{ lockUntil?: string } | null>(null);
  const [loginMode, setLoginMode] = useState<'password' | 'emailCode' | 'tpvStore'>('password');
  const [codeValue, setCodeValue] = useState('');
  const [tpvStoreCode, setTpvStoreCode] = useState('');
  const [codeInfo, setCodeInfo] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [peekPassword, setPeekPassword] = useState(false);
  const [googleTimedOut, setGoogleTimedOut] = useState(false);

  useEffect(() => {
    const state = location.state as { mode?: string; terminalCode?: string } | null;
    if (state?.mode === 'tpvStore' || state?.terminalCode) {
      setLoginMode('tpvStore');
      if (state?.terminalCode) {
        setTpvStoreCode(String(state.terminalCode).trim().toUpperCase());
      }
    }
  }, [location.state]);

  const completeTpvTabletSession = useCallback(
    async (result: Awaited<ReturnType<typeof tpvTabletLogin>>) => {
      const user = result.user;
      const business = result.business;
      const terminalBinding = result.terminalBinding;
      const pdv = result.pointOfSale;

      if (terminalBinding) {
        writeTpvTabletBinding({
          terminalCode: terminalBinding.terminalCode,
          pdvId: terminalBinding.pdvId,
          workCenterId: terminalBinding.workCenterId,
          businessId: terminalBinding.businessId,
          dataUserId: terminalBinding.dataUserId,
          tpvVertical: terminalBinding.tpvVertical || 'delivery',
          pdvName: pdv?.name,
          businessName: business?.name,
        });
      }

      if (business?.business_id && pdv) {
        seedRetailScopeCacheFromTabletLogin({
          businessId: business.business_id,
          pointOfSale: pdv,
          workCenterId: terminalBinding?.workCenterId,
        });
      }

      if (user?.user_id && business?.business_id) {
        try {
          localStorage.setItem(`vertial_current_business:${user.user_id}`, business.business_id);
        } catch {
          /* ignore */
        }
      }

      if (business?.business_id && terminalBinding?.dataUserId && terminalBinding.pdvId) {
        writeDeliveryOpsSelectedPdvId(
          business.business_id,
          terminalBinding.dataUserId,
          terminalBinding.pdvId,
        );
      }

      try {
        await reloadBusinesses();
        if (business?.business_id) switchBusiness(business.business_id);
      } catch {
        // El binding tablet ya fija empresa; seguir al TPV aunque falle el refresco global.
      }

      navigate(result.redirectTo || TPV_TABLET_DELIVERY_PATH, { replace: true });
    },
    [navigate, reloadBusinesses, switchBusiness],
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
    
    // Validación simple
    const newErrors: { email?: string; password?: string } = {};
    if (!formData.email) newErrors.email = t('auth.errors.emailRequired');
    if (!formData.password) newErrors.password = t('auth.errors.passwordRequired');
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    
    if (formData.remember) {
      const encoded = btoa(JSON.stringify({ email: formData.email }));
      localStorage.setItem(CREDENTIALS_KEY, encoded);
    } else {
      localStorage.removeItem(CREDENTIALS_KEY);
    }

    setIsSubmitting(true);
    setLockInfo(null);
    const result = await login(formData.email, formData.password);
    setIsSubmitting(false);

    if (result.success) {
      navigate(result.redirectTo || '/saas/dashboard');
    } else if (result.code === 'ACCOUNT_LOCKED') {
      setLockInfo({ lockUntil: result.lockUntil });
      setLoginMode('emailCode');
      setErrors({
        email: result.error || 'Cuenta bloqueada temporalmente. Usa el código por email.',
      });
    } else {
      const msg = (result.error ?? '').trim();
      if (msg) console.warn('[auth/login]', msg);
      const rateLimited = /demasiados intentos/i.test(msg) || /rate_limit/i.test(msg);
      if (rateLimited) setLoginMode('emailCode');
      setErrors({ email: msg || t('auth.errors.loginError') });
    }
  };

  const handleRequestCode = async () => {
    const email = formData.email.trim();
    if (!email) {
      setErrors({ email: t('auth.errors.emailRequired') });
      return;
    }
    setIsSubmitting(true);
    setCodeInfo(null);
    setErrors({});
    const result = await requestLoginCode(email);
    setIsSubmitting(false);
    if (result.success) {
      setLoginMode('emailCode');
      setCodeInfo(result.info || 'Revisa tu correo. El código caduca en 10 minutos.');
    } else {
      setErrors({ email: result.error || 'No se pudo enviar el código' });
    }
  };

  const handleTpvStoreLogin = async (e: FormEvent) => {
    e.preventDefault();
    const code = tpvStoreCode.trim().toUpperCase();
    if (code.length < 4) {
      setErrors({ email: 'Introduce el código de tienda (4-12 caracteres, ej. ABC123)' });
      return;
    }
    setIsSubmitting(true);
    setErrors({});
    const result = await tpvTabletLogin(code, false);
    setIsSubmitting(false);
    if (result.success) {
      await completeTpvTabletSession(result);
    } else {
      setErrors({
        email:
          result.error ||
          'Código de tienda incorrecto. Revisa Ajustes → Tienda → Código tablet.',
      });
    }
  };

  const handleVerifyCode = async (e: FormEvent) => {
    e.preventDefault();
    const email = formData.email.trim();
    const code = codeValue.replace(/\D/g, '').slice(0, 6);
    if (!email) {
      setErrors({ email: t('auth.errors.emailRequired') });
      return;
    }
    if (code.length !== 6) {
      setErrors({ password: 'Introduce el código de 6 dígitos' });
      return;
    }
    setIsSubmitting(true);
    setErrors({});
    const result = await verifyLoginCode(email, code);
    setIsSubmitting(false);
    if (result.success) {
      navigate(result.redirectTo || '/saas/dashboard');
    } else {
      setErrors({ password: result.error || 'Código inválido o expirado' });
    }
  };

  const handleGoogleCredential = useCallback(async (credential: string) => {
    setIsSubmitting(true);
    setErrors({});
    try {
      const result = await googleLogin(credential);

      if (result.success) {
        navigate(result.redirectTo || '/saas/dashboard');
        return;
      }

      if (result.code === 'GOOGLE_ACCOUNT_NOT_FOUND' && result.googleUser) {
        navigate('/auth/register', {
          state: {
            googleUser: result.googleUser,
            googleCredential: credential,
          },
        });
        return;
      }

      const msg = (result.error || t('auth.errors.googleError')).trim();
      if (msg) console.warn('[auth/google-login]', msg);
      setErrors({ email: msg || t('auth.errors.googleError') });
    } finally {
      setIsSubmitting(false);
    }
  }, [googleLogin, navigate, t]);

  const { ready: googleReady, renderButton } = useGoogleSignIn(handleGoogleCredential);
  const googleBtnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (googleReady && googleBtnRef.current) {
      const theme = resolvedTheme === 'dark' ? 'filled_black' : 'filled_blue';
      renderButton(googleBtnRef.current, { theme, size: 'large', text: 'signin_with' });
    }
  }, [googleReady, renderButton, resolvedTheme]);

  useEffect(() => {
    if (googleReady || !googleClientConfigured) {
      setGoogleTimedOut(false);
      return;
    }
    const timeout = window.setTimeout(() => {
      setGoogleTimedOut(true);
    }, 8000);
    return () => window.clearTimeout(timeout);
  }, [googleReady, googleClientConfigured]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-800 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl p-8 shadow-sm">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center mb-6">
              <VertialLogo size="lg" />
            </div>
            <span className="inline-block mb-3 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200">
              Acceso empresa
            </span>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              Iniciar sesión — Empresa
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Para propietarios, gerentes y administración del negocio.
            </p>
          </div>

          {/* S-03: Banner de cuenta bloqueada */}
          {lockInfo && (
            <div className="mb-4 rounded-xl bg-red-50 border border-red-200 p-4 flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-700">Acceso con contraseña bloqueado temporalmente</p>
                <p className="text-xs text-red-500 mt-0.5">
                  Demasiados intentos fallidos.
                  {lockInfo.lockUntil ? ` Podrás usar la contraseña otra vez a las ${new Date(lockInfo.lockUntil).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}.` : ''}
                  Puedes entrar ahora con un código por email.
                </p>
              </div>
            </div>
          )}

          {codeInfo && (
            <div className="mb-4 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800">
              {codeInfo}
            </div>
          )}

          {loginMode === 'emailCode' ? (
            <form onSubmit={handleVerifyCode} className="space-y-6">
              <p className="text-xs text-gray-500 dark:text-gray-400 -mt-2">
                Código de <strong>6 dígitos</strong> que llega a tu correo. No es el código de la tablet.
              </p>
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
              />
              <ACCESO__Input
                label="Código del correo (6 dígitos)"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                icon={<Lock className="w-5 h-5" />}
                value={codeValue}
                onChange={(e) => {
                  setCodeValue(e.target.value.replace(/\D/g, '').slice(0, 6));
                  setErrors({ ...errors, password: undefined });
                }}
                error={errors.password}
              />
              <div className="flex flex-col gap-2">
                <ACCESO__Button
                  type="submit"
                  variant="primary"
                  fullWidth
                  size="lg"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Verificando…' : 'Entrar con código'}
                </ACCESO__Button>
                <button
                  type="button"
                  onClick={() => void handleRequestCode()}
                  disabled={isSubmitting}
                  className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                >
                  Reenviar código al email
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLoginMode('password');
                    setCodeInfo(null);
                    setCodeValue('');
                    setErrors({});
                  }}
                  className="text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
                >
                  Volver a contraseña
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLoginMode('tpvStore');
                    setErrors({});
                  }}
                  className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  Tengo el código de tienda (tablet)
                </button>
              </div>
            </form>
          ) : loginMode === 'tpvStore' ? (
            <form onSubmit={handleTpvStoreLogin} className="space-y-6">
              <p className="text-xs text-gray-500 dark:text-gray-400 -mt-2">
                Código de <strong>tablet / tienda</strong> (Ajustes → Tienda → Código tablet). Letras y números.
              </p>
              <ACCESO__Input
                label="Código de tienda"
                type="text"
                autoComplete="off"
                autoCapitalize="characters"
                placeholder="Ej. ABC123"
                icon={<Lock className="w-5 h-5" />}
                value={tpvStoreCode}
                onChange={(e) => {
                  setTpvStoreCode(e.target.value.toUpperCase().replace(/\s/g, '').slice(0, 12));
                  setErrors({ ...errors, email: undefined });
                }}
                error={errors.email}
                className="font-mono uppercase tracking-widest"
              />
              <div className="flex flex-col gap-2">
                <ACCESO__Button
                  type="submit"
                  variant="primary"
                  fullWidth
                  size="lg"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Activando…' : 'Entrar con código de tienda'}
                </ACCESO__Button>
                <button
                  type="button"
                  onClick={() => navigate(AUTH_PATHS.tpvTabletLogin)}
                  className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                >
                  Pantalla completa tablet TPV
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLoginMode('password');
                    setTpvStoreCode('');
                    setErrors({});
                  }}
                  className="text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
                >
                  Volver a contraseña
                </button>
              </div>
            </form>
          ) : (
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

            <ACCESO__Button
              type="submit"
              variant="primary"
              fullWidth
              size="lg"
              className="mb-0"
              disabled={isSubmitting}
            >
              {t('auth.submit')}
            </ACCESO__Button>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200 dark:border-gray-700" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400">{t('common.or')}</span>
              </div>
            </div>

            <div className="flex justify-center w-full">
              {!googleClientConfigured ? null : !googleReady && !googleTimedOut ? (
                <div className="min-h-[44px] w-full max-w-sm flex items-center justify-center gap-2 rounded-lg border-2 border-gray-200 dark:border-gray-600 py-3 px-4 text-sm text-gray-500 dark:text-gray-400">
                  <svg className="w-5 h-5 shrink-0 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span>{t('auth.googleLogin')}…</span>
                </div>
              ) : !googleReady && googleTimedOut ? (
                <div className="min-h-[44px] w-full max-w-sm flex items-center justify-center rounded-lg border-2 border-amber-200 bg-amber-50 py-3 px-4 text-sm text-amber-800 text-center">
                  Google (script) no cargó a tiempo. Revisa bloqueadores, CSP o red; puedes usar email y contraseña.
                </div>
              ) : (
                <div ref={googleBtnRef} className="min-h-[44px] w-full max-w-sm flex justify-center" />
              )}
            </div>
            {!googleClientConfigured && (
              <div className="w-full py-3 px-4 border border-gray-200 dark:border-gray-600 rounded-lg text-xs text-gray-500 dark:text-gray-400 text-center">
                Inicio con Google no está activo en este sitio: falta{' '}
                <code className="font-mono bg-gray-100 dark:bg-gray-900 px-1 rounded">VITE_GOOGLE_CLIENT_ID</code> en el{' '}
                <strong>build</strong> del frontend (debe ser el mismo Client ID que{' '}
                <code className="font-mono bg-gray-100 dark:bg-gray-900 px-1 rounded">GOOGLE_CLIENT_ID</code> en el servidor).
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setLoginMode('tpvStore');
                setErrors({});
              }}
              disabled={isSubmitting}
              className="w-full text-sm text-center text-gray-600 dark:text-gray-400 hover:underline"
            >
              Código de tienda / tablet TPV
            </button>
          </form>
          )}

          <p className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
            {t('auth.noAccount')}{' '}
            <button
              type="button"
              onClick={() => navigate(AUTH_PATHS.register, { state: { accountType: 'company' } })}
              className="font-medium text-[#0f1419] hover:underline dark:text-gray-100"
            >
              Crear cuenta de empresa
            </button>
          </p>

          <p className="mt-4 text-center text-sm text-gray-600 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700 pt-4">
            ¿Eres trabajador?{' '}
            <button
              type="button"
              onClick={() => navigate(AUTH_PATHS.workerLogin)}
              className="font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              Accede por aquí
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
  );
}