import { useState, useRef, type FormEvent, type PointerEvent, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';
import { Eye, Building2, User, Lock, ShieldAlert, ArrowLeft, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ACCESO__Button } from '../../components/design-system/ACCESO__Button';
import { ACCESO__Input } from '../../components/design-system/ACCESO__Input';
import { VertialLogo } from '../../components/VertialLogo';
import { useAuth } from '../../context/AuthContext';
import { AUTH_PATHS } from '../../lib/authEntryPaths';

type Step = 'companyCode' | 'credentials';

export function TeamLogin() {
  const navigate = useNavigate();
  const { teamLogin } = useAuth();
  const { t } = useTranslation();

  const [step, setStep] = useState<Step>('companyCode');
  const [companyCode, setCompanyCode] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ companyCode?: string; username?: string; password?: string; general?: string }>({});
  const [lockInfo, setLockInfo] = useState<{ lockUntil?: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [peekPassword, setPeekPassword] = useState(false);

  const usernameRef = useRef<HTMLInputElement>(null);

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

  const handleCompanyCodeNext = () => {
    if (!companyCode.trim()) {
      setErrors({ companyCode: 'Introduce el código de tu empresa' });
      return;
    }
    setErrors({});
    setStep('credentials');
    setTimeout(() => usernameRef.current?.focus(), 100);
  };

  const handleCompanyCodeKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCompanyCodeNext();
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const newErrors: typeof errors = {};
    if (!companyCode.trim()) newErrors.companyCode = 'Código de empresa obligatorio';
    if (!username.trim()) newErrors.username = 'El usuario es obligatorio';
    if (!password) newErrors.password = 'La contraseña es obligatoria';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsSubmitting(true);
    setLockInfo(null);
    setErrors({});

    const result = await teamLogin(companyCode.trim(), username.trim(), password);
    setIsSubmitting(false);

    if (result.success) {
      navigate(result.redirectTo || '/saas/dashboard');
    } else if (result.code === 'ACCOUNT_LOCKED') {
      setLockInfo({ lockUntil: result.lockUntil });
      setErrors({ general: result.error || 'Cuenta bloqueada temporalmente' });
    } else {
      setErrors({ general: result.error || 'Credenciales incorrectas' });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-800 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl p-8 shadow-sm">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center mb-6">
              <VertialLogo size="lg" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              Acceso de equipo
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              {step === 'companyCode'
                ? 'Introduce el código que te proporcionó tu empresa'
                : 'Introduce tu usuario y contraseña'}
            </p>
          </div>

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

          {errors.general && !lockInfo && (
            <div className="mb-4 rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              {errors.general}
            </div>
          )}

          {step === 'companyCode' ? (
            <div className="space-y-6">
              <ACCESO__Input
                label="Código de empresa"
                type="text"
                placeholder="Ej: ABC123"
                icon={<Building2 className="w-5 h-5" />}
                value={companyCode}
                onChange={(e) => {
                  setCompanyCode(e.target.value.toUpperCase());
                  setErrors({});
                }}
                onKeyDown={handleCompanyCodeKeyDown}
                error={errors.companyCode}
                autoFocus
                autoComplete="off"
                style={{ textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 600 }}
              />

              <ACCESO__Button
                type="button"
                variant="primary"
                fullWidth
                size="lg"
                onClick={handleCompanyCodeNext}
                disabled={!companyCode.trim()}
              >
                Continuar
                <ArrowRight className="w-5 h-5 ml-2" />
              </ACCESO__Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <button
                type="button"
                onClick={() => {
                  setStep('companyCode');
                  setErrors({});
                }}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors mb-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Empresa: <span className="font-mono font-bold tracking-wider">{companyCode}</span>
              </button>

              <ACCESO__Input
                ref={usernameRef}
                label="Usuario"
                type="text"
                placeholder="Tu nombre de usuario"
                icon={<User className="w-5 h-5" />}
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setErrors((prev) => ({ ...prev, username: undefined, general: undefined }));
                }}
                error={errors.username}
                autoComplete="username"
              />

              <ACCESO__Input
                label="Contraseña"
                type={peekPassword ? 'text' : 'password'}
                placeholder="Tu contraseña"
                icon={<Lock className="w-5 h-5" />}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setErrors((prev) => ({ ...prev, password: undefined, general: undefined }));
                }}
                error={errors.password}
                autoComplete="current-password"
                suffix={
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label="Mostrar contraseña"
                    className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500 hover:text-gray-600 transition-colors select-none touch-manipulation"
                    onPointerDown={handlePasswordPeekStart}
                  >
                    <Eye className="w-5 h-5" />
                  </button>
                }
              />

              <ACCESO__Button
                type="submit"
                variant="primary"
                fullWidth
                size="lg"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Entrando...' : 'Entrar'}
              </ACCESO__Button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
          ¿Tienes correo y contraseña de la empresa?{' '}
          <button
            type="button"
            onClick={() => navigate(AUTH_PATHS.workerLogin)}
            className="font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            Iniciar sesión — Trabajador
          </button>
        </p>
        <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
          ¿Gestionas la empresa?{' '}
          <button
            type="button"
            onClick={() => navigate(AUTH_PATHS.companyLogin)}
            className="font-medium text-[#0f1419] hover:underline dark:text-gray-100"
          >
            Acceso empresa
          </button>
        </p>

        <div className="mt-4 text-center">
          <ACCESO__Button variant="ghost" onClick={() => navigate(AUTH_PATHS.entry)}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Elegir tipo de acceso
          </ACCESO__Button>
        </div>
      </div>
    </div>
  );
}
