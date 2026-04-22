import { useState, useCallback, useRef, useEffect, type FormEvent, type PointerEvent } from 'react';
import { useNavigate } from 'react-router';
import { Eye, Mail, Lock, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ACCESO__Button } from '../../components/design-system/ACCESO__Button';
import { ACCESO__Input } from '../../components/design-system/ACCESO__Input';
import { ACCESO__Checkbox } from '../../components/design-system/ACCESO__Checkbox';
import { UdarLogo } from '../../components/UdarLogo';
import { useAuth } from '../../context/AuthContext';
import { useGoogleSignIn } from '../../hooks/useGoogleSignIn';

const CREDENTIALS_KEY = 'udar_saved_credentials';

function loadSavedCredentials(): { email: string; password: string } | null {
  try {
    const raw = localStorage.getItem(CREDENTIALS_KEY);
    if (!raw) return null;
    const decoded = atob(raw);
    return JSON.parse(decoded) as { email: string; password: string };
  } catch {
    return null;
  }
}

export function Login() {
  const navigate = useNavigate();
  const { login, googleLogin } = useAuth();
  const { t } = useTranslation();

  const saved = loadSavedCredentials();
  const [formData, setFormData] = useState({
    email: saved?.email ?? '',
    password: saved?.password ?? '',
    remember: saved !== null,
  });
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [lockInfo, setLockInfo] = useState<{ lockUntil?: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [peekPassword, setPeekPassword] = useState(false);
  const [googleTimedOut, setGoogleTimedOut] = useState(false);

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
      const encoded = btoa(JSON.stringify({ email: formData.email, password: formData.password }));
      localStorage.setItem(CREDENTIALS_KEY, encoded);
    } else {
      localStorage.removeItem(CREDENTIALS_KEY);
    }

    setIsSubmitting(true);
    setLockInfo(null);
    const result = await login(formData.email, formData.password);
    setIsSubmitting(false);

    if (result.success) {
      navigate(result.redirectTo || '/auth/gate');
    } else if (result.code === 'ACCOUNT_LOCKED') {
      setLockInfo({ lockUntil: result.lockUntil });
      setErrors({ email: result.error || 'Cuenta bloqueada temporalmente' });
    } else {
      setErrors({ email: result.error || t('auth.errors.loginError') });
    }
  };

  const handleGoogleCredential = useCallback(async (credential: string) => {
    setIsSubmitting(true);
    setErrors({});
    const result = await googleLogin(credential);
    setIsSubmitting(false);

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

    setErrors({ email: result.error || t('auth.errors.googleError') });
  }, [googleLogin, navigate, t]);

  const { ready: googleReady, renderButton } = useGoogleSignIn(handleGoogleCredential);
  const googleBtnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (googleReady && googleBtnRef.current) {
      renderButton(googleBtnRef.current, { theme: 'outline', size: 'large', text: 'signin_with' });
    }
  }, [googleReady, renderButton]);

  useEffect(() => {
    if (googleReady) {
      setGoogleTimedOut(false);
      return;
    }
    const timeout = window.setTimeout(() => {
      setGoogleTimedOut(true);
    }, 8000);
    return () => window.clearTimeout(timeout);
  }, [googleReady]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-800 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl p-8 shadow-sm">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center mb-6">
              <UdarLogo size="lg" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              {t('auth.login')}
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              {t('auth.loginSubtitle')}
            </p>
          </div>

          {/* S-03: Banner de cuenta bloqueada */}
          {lockInfo && (
            <div className="mb-4 rounded-xl bg-red-50 border border-red-200 p-4 flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-700">Cuenta bloqueada temporalmente</p>
                <p className="text-xs text-red-500 mt-0.5">
                  Demasiados intentos fallidos.
                  {lockInfo.lockUntil ? ` Podrás volver a intentarlo a las ${new Date(lockInfo.lockUntil).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}.` : ''}
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

            <div className="flex justify-center">
              <div ref={googleBtnRef} className="min-h-[44px]" />
            </div>
            {!googleReady && !googleTimedOut && (
              <button
                type="button"
                disabled
                className="w-full py-3 px-4 border-2 border-gray-200 rounded-lg font-medium flex items-center justify-center gap-2 text-gray-400 cursor-not-allowed"
              >
                <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {t('auth.googleLogin')}
              </button>
            )}
            {!googleReady && googleTimedOut && (
              <div className="w-full py-3 px-4 border-2 border-amber-200 bg-amber-50 rounded-lg text-sm text-amber-700 text-center">
                Google no disponible temporalmente. Puedes iniciar sesión con email y contraseña.
              </div>
            )}
          </form>

          <p className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
            {t('auth.noAccount')}{' '}
            <button
              onClick={() => navigate('/auth/register')}
              className="font-medium text-[#0f1419] hover:underline"
            >
              {t('auth.createAccount')}
            </button>
          </p>
        </div>

        <div className="mt-6 text-center">
          <ACCESO__Button 
            variant="ghost"
            onClick={() => navigate('/auth/entry')}
          >
            ← {t('common.back')}
          </ACCESO__Button>
        </div>
      </div>
    </div>
  );
}