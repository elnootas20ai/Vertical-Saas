import { useState, type FormEvent, type PointerEvent } from 'react';
import { useNavigate } from 'react-router';
import { Eye, Mail, Lock, ShieldAlert, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ACCESO__Button } from '../../components/design-system/ACCESO__Button';
import { ACCESO__Input } from '../../components/design-system/ACCESO__Input';
import { ACCESO__Checkbox } from '../../components/design-system/ACCESO__Checkbox';
import { VertialLogo } from '../../components/VertialLogo';
import { useAuth } from '../../context/AuthContext';
import { AUTH_PATHS } from '../../lib/authEntryPaths';

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
  const { login } = useAuth();
  const { t } = useTranslation();

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
      navigate(result.redirectTo || '/saas/worker');
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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-800 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl p-8 shadow-sm">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center mb-6">
              <VertialLogo size="lg" />
            </div>
            <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <span className="inline-block mb-3 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
              Acceso trabajador
            </span>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              Iniciar sesión — Trabajador
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Correo y contraseña que te dio tu empresa. Irás directo a tu panel operativo.
            </p>
          </div>

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
          </form>

          <p className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
            ¿Accedes con código de empresa?{' '}
            <button
              type="button"
              onClick={() => navigate(AUTH_PATHS.teamLogin)}
              className="font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              Entrar con código
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
  );
}
