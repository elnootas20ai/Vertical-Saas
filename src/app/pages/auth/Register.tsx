import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { Mail, Lock, User, Phone, CheckCircle, Eye, EyeOff, Sparkles, Building2, Gift } from 'lucide-react';
import { validateReferralCode } from '../../lib/affiliatesApi';
import { ACCESO__Button } from '../../components/design-system/ACCESO__Button';
import { ACCESO__Input } from '../../components/design-system/ACCESO__Input';
import { ACCESO__Checkbox } from '../../components/design-system/ACCESO__Checkbox';
import { VertialLogo } from '../../components/VertialLogo';
import { useAuth } from '../../context/AuthContext';
import { useGoogleSignIn, googleClientConfigured } from '../../hooks/useGoogleSignIn';
import type { GoogleUserProfile } from '../../lib/authApi';

type AccountType = 'user' | 'company';

interface LocationState {
  googleUser?: GoogleUserProfile;
  googleCredential?: string;
  accountType?: AccountType;
}

const PW_LOWER = 'abcdefghijklmnopqrstuvwxyz';
const PW_UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const PW_NUM = '0123456789';
const PW_SYM = '!@#$%&*-_';

/** Contraseña aleatoria fuerte (mayúsculas, minúsculas, números y símbolos). */
function generateSecurePassword(length = 16): string {
  const pools = [PW_LOWER, PW_UPPER, PW_NUM, PW_SYM];
  const all = pools.join('');
  const buf = new Uint32Array(Math.max(length, 32));
  crypto.getRandomValues(buf);
  const chars: string[] = pools.map((pool, i) => pool[buf[i] % pool.length]);
  for (let i = chars.length; i < length; i++) {
    chars.push(all[buf[i] % all.length]);
  }
  for (let i = chars.length - 1; i > 0; i--) {
    const j = buf[i % buf.length] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

function destinationAfterSignup(opts: {
  emailVerified?: boolean;
  redirectTo?: string;
  isUserAccount: boolean;
}) {
  if (opts.emailVerified === false) {
    return '/auth/verify-email-pending';
  }
  return opts.redirectTo ?? (opts.isUserAccount ? '/saas/worker' : '/auth/onboarding/business-type');
}

export function Register() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { resolvedTheme } = useTheme();
  const { register, googleLogin } = useAuth();

  const locationState = (location.state || {}) as LocationState;
  const incomingGoogle = locationState.googleUser || null;
  const incomingCredential = locationState.googleCredential || '';
  const accountType: AccountType = locationState.accountType || 'company';
  const isUserAccount = accountType === 'user';

  const [googleCredential, setGoogleCredential] = useState(incomingCredential);
  const [googleAvatar, setGoogleAvatar] = useState(incomingGoogle?.avatar || '');

  const initialReferral = searchParams.get('ref') || '';

  const [formData, setFormData] = useState({
    firstName: incomingGoogle?.firstName || '',
    lastName: incomingGoogle?.lastName || '',
    email: incomingGoogle?.email || '',
    phone: '',
    password: '',
    confirmPassword: '',
    acceptTerms: false,
    referralCode: initialReferral,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [referralInfo, setReferralInfo] = useState<{ valid: boolean; name?: string } | null>(null);
  const [validatingReferral, setValidatingReferral] = useState(false);
  const [googleTimedOut, setGoogleTimedOut] = useState(false);
  const referralTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkReferralCode = useCallback((code: string) => {
    if (referralTimeout.current) clearTimeout(referralTimeout.current);
    if (!code.trim()) { setReferralInfo(null); return; }
    setValidatingReferral(true);
    referralTimeout.current = setTimeout(async () => {
      try {
        const result = await validateReferralCode(code.trim().toUpperCase());
        setReferralInfo({ valid: result.valid, name: result.affiliateName });
      } catch {
        setReferralInfo(null);
      } finally {
        setValidatingReferral(false);
      }
    }, 500);
  }, []);

  useEffect(() => {
    if (initialReferral) checkReferralCode(initialReferral);
  }, [initialReferral, checkReferralCode]);

  const isGoogleFlow = Boolean(googleCredential);

  const applyGeneratedPassword = () => {
    const pw = generateSecurePassword();
    setFormData((prev) => ({ ...prev, password: pw, confirmPassword: pw }));
    setErrors((prev) => ({ ...prev, password: '', confirmPassword: '' }));
  };

  const handleGoogleCredential = useCallback(async (credential: string) => {
    setIsSubmitting(true);
    setErrors({});
    try {
      const result = await googleLogin(credential);

      if (result.success) {
        navigate(
          destinationAfterSignup({
            emailVerified: true,
            redirectTo: result.redirectTo,
            isUserAccount,
          }),
        );
        return;
      }

      if (result.code === 'GOOGLE_ACCOUNT_NOT_FOUND' && result.googleUser) {
        setGoogleCredential(credential);
        setGoogleAvatar(result.googleUser.avatar || '');
        setFormData((prev) => ({
          ...prev,
          firstName: result.googleUser!.firstName || prev.firstName,
          lastName: result.googleUser!.lastName || prev.lastName,
          email: result.googleUser!.email || prev.email,
        }));
        return;
      }

      setErrors({ email: result.error || 'Error al registrarse con Google' });
    } finally {
      setIsSubmitting(false);
    }
  }, [googleLogin, navigate]);

  const { ready: googleReady, renderButton } = useGoogleSignIn(handleGoogleCredential);
  const googleBtnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (googleReady && googleBtnRef.current && !isGoogleFlow) {
      const theme = resolvedTheme === 'dark' ? 'filled_black' : 'filled_blue';
      renderButton(googleBtnRef.current, { theme, size: 'large', text: 'signup_with' });
    }
  }, [googleReady, renderButton, isGoogleFlow, resolvedTheme]);

  useEffect(() => {
    if (googleReady || !googleClientConfigured || isGoogleFlow) {
      setGoogleTimedOut(false);
      return;
    }
    const t = window.setTimeout(() => setGoogleTimedOut(true), 8000);
    return () => window.clearTimeout(t);
  }, [googleReady, isGoogleFlow, googleClientConfigured]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: Record<string, string> = {};
    if (!formData.firstName) newErrors.firstName = 'El nombre es requerido';
    if (!formData.lastName) newErrors.lastName = 'Los apellidos son requeridos';
    if (!formData.email) newErrors.email = 'El email es requerido';
    if (!isUserAccount && !formData.phone) newErrors.phone = 'El teléfono es requerido';
    if (!formData.password) newErrors.password = 'La contraseña es requerida';
    if (formData.password.length < 8) newErrors.password = 'Mínimo 8 caracteres';
    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Las contraseñas no coinciden';
    }
    if (!formData.acceptTerms) {
      newErrors.acceptTerms = 'Debes aceptar los términos y condiciones';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsSubmitting(true);
    const result = await register({
      firstName: formData.firstName,
      lastName: formData.lastName,
      email: formData.email,
      phone: formData.phone || undefined,
      password: formData.password,
      accountType,
      ...(googleCredential ? { googleCredential } : {}),
      ...(formData.referralCode.trim() ? { referralCode: formData.referralCode.trim().toUpperCase() } : {}),
    });
    setIsSubmitting(false);

    if (result.success) {
      navigate(
        destinationAfterSignup({
          emailVerified: result.emailVerified,
          redirectTo: result.redirectTo,
          isUserAccount,
        }),
        { replace: true },
      );
    } else {
      setErrors({ email: result.error || 'Error al crear la cuenta' });
    }
  };

  const handleCancelGoogle = () => {
    setGoogleCredential('');
    setGoogleAvatar('');
    setFormData((prev) => ({ ...prev, firstName: '', lastName: '', email: '' }));
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
              {isUserAccount ? 'Crear cuenta de usuario' : 'Crear cuenta de empresa'}
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              {isUserAccount
                ? 'Registro rápido — podrás unirte a empresas después'
                : 'Crea tu espacio de trabajo en minutos'}
            </p>
            <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
              {isUserAccount ? (
                <><User className="w-3.5 h-3.5" /> Cuenta personal</>
              ) : (
                <><Building2 className="w-3.5 h-3.5" /> Cuenta de empresa</>
              )}
            </div>
          </div>

          {isGoogleFlow && (
            <div className="mb-6 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-4">
              <div className="flex items-center gap-3">
                {googleAvatar ? (
                  <img src={googleAvatar} alt="" className="w-10 h-10 rounded-full border-2 border-blue-200" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                    <CheckCircle className="w-5 h-5 text-blue-600" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-blue-800 dark:text-blue-200">
                    Cuenta de Google verificada
                  </p>
                  <p className="text-xs text-blue-600 dark:text-blue-400 truncate">
                    {formData.email}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCancelGoogle}
                  className="text-xs text-blue-500 hover:text-blue-700 font-medium"
                >
                  Cambiar
                </button>
              </div>
              <p className="mt-2 text-xs text-blue-600 dark:text-blue-400">
                Completa los datos restantes para crear tu cuenta.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <ACCESO__Input
                label="Nombre"
                type="text"
                placeholder="Juan"
                icon={<User className="w-5 h-5" />}
                value={formData.firstName}
                onChange={(e) => {
                  setFormData({ ...formData, firstName: e.target.value });
                  setErrors({ ...errors, firstName: '' });
                }}
                error={errors.firstName}
              />
              <ACCESO__Input
                label="Apellidos"
                type="text"
                placeholder="García"
                value={formData.lastName}
                onChange={(e) => {
                  setFormData({ ...formData, lastName: e.target.value });
                  setErrors({ ...errors, lastName: '' });
                }}
                error={errors.lastName}
              />
            </div>

            <div className="relative">
              <ACCESO__Input
                label="Email"
                type="email"
                placeholder="tu@email.com"
                icon={<Mail className="w-5 h-5" />}
                value={formData.email}
                onChange={(e) => {
                  if (!isGoogleFlow) {
                    setFormData({ ...formData, email: e.target.value });
                    setErrors({ ...errors, email: '' });
                  }
                }}
                error={errors.email}
                disabled={isGoogleFlow}
              />
              {isGoogleFlow && (
                <div className="absolute right-3 top-8 flex items-center">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                </div>
              )}
            </div>

            {isUserAccount ? (
              <ACCESO__Input
                label="Teléfono (opcional)"
                type="tel"
                placeholder="+34 600 000 000"
                icon={<Phone className="w-5 h-5" />}
                value={formData.phone}
                onChange={(e) => {
                  setFormData({ ...formData, phone: e.target.value });
                  setErrors({ ...errors, phone: '' });
                }}
                error={errors.phone}
              />
            ) : (
              <ACCESO__Input
                label="Teléfono"
                type="tel"
                placeholder="+34 600 000 000"
                icon={<Phone className="w-5 h-5" />}
                value={formData.phone}
                onChange={(e) => {
                  setFormData({ ...formData, phone: e.target.value });
                  setErrors({ ...errors, phone: '' });
                }}
                error={errors.phone}
              />
            )}

            <div className="space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-xs text-gray-500 dark:text-gray-400 leading-snug max-w-[min(100%,20rem)]">
                  Recomendación: al menos 8 caracteres, combinando mayúsculas, minúsculas, números y símbolos.
                </p>
                <button
                  type="button"
                  onClick={applyGeneratedPassword}
                  className="shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-300 transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" aria-hidden />
                  Generar contraseña
                </button>
              </div>
              <ACCESO__Input
                label="Contraseña"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Mínimo 8 caracteres"
                icon={<Lock className="w-5 h-5" />}
                value={formData.password}
                onChange={(e) => {
                  setFormData({ ...formData, password: e.target.value });
                  setErrors({ ...errors, password: '' });
                }}
                helperText="Usa al menos 8 caracteres con letras y números"
                error={errors.password}
                suffix={
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                }
              />
            </div>

            <ACCESO__Input
              label="Repetir contraseña"
              type={showConfirmPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Repite tu contraseña"
              icon={<Lock className="w-5 h-5" />}
              value={formData.confirmPassword}
              onChange={(e) => {
                setFormData({ ...formData, confirmPassword: e.target.value });
                setErrors({ ...errors, confirmPassword: '' });
              }}
              error={errors.confirmPassword}
              suffix={
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={showConfirmPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                >
                  {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              }
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Código de referido (opcional)
              </label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2">
                  <Gift className="w-5 h-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  placeholder="Ej: REF-A7K2N3"
                  value={formData.referralCode}
                  onChange={(e) => {
                    const val = e.target.value.toUpperCase();
                    setFormData({ ...formData, referralCode: val });
                    checkReferralCode(val);
                  }}
                  className="w-full pl-10 pr-10 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm font-mono tracking-wider bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {formData.referralCode.trim() && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {validatingReferral ? (
                      <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                    ) : referralInfo?.valid ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : (
                      <span className="text-xs text-red-500 font-medium">No válido</span>
                    )}
                  </div>
                )}
              </div>
              {referralInfo?.valid && referralInfo.name && (
                <p className="mt-1 text-xs text-green-600 dark:text-green-400">
                  Referido por: {referralInfo.name}
                </p>
              )}
            </div>

            <div>
              <ACCESO__Checkbox
                label="Acepto los términos y condiciones, la política de privacidad y el tratamiento de mis datos según el RGPD"
                checked={formData.acceptTerms}
                onChange={(e) => {
                  setFormData({ ...formData, acceptTerms: e.target.checked });
                  setErrors({ ...errors, acceptTerms: '' });
                }}
              />
              {errors.acceptTerms && (
                <p className="mt-1 text-sm text-red-600">{errors.acceptTerms}</p>
              )}
            </div>

            <ACCESO__Button
              type="submit"
              variant="primary"
              fullWidth
              size="lg"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? 'Registrando...'
                : isGoogleFlow
                  ? 'Crear cuenta con Google'
                  : 'Crear cuenta'}
            </ACCESO__Button>

            {!isGoogleFlow && (
              <>
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200 dark:border-gray-700" />
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-4 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400">o</span>
                  </div>
                </div>

                <div className="flex justify-center w-full">
                  {!googleClientConfigured ? null : !googleReady && !googleTimedOut ? (
                    <div className="min-h-[44px] w-full max-w-sm flex items-center justify-center gap-2 rounded-lg border-2 border-gray-200 dark:border-gray-600 py-3 px-4 text-sm text-gray-500 dark:text-gray-400">
                      <span className="inline-block w-5 h-5 shrink-0 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" aria-hidden />
                      <span>Cargando Google…</span>
                    </div>
                  ) : !googleReady && googleTimedOut ? (
                    <div className="min-h-[44px] w-full max-w-sm flex items-center justify-center rounded-lg border-2 border-amber-200 bg-amber-50 py-3 px-4 text-sm text-amber-800 text-center">
                      Google no cargó a tiempo. Revisa red o bloqueadores; puedes registrarte con email.
                    </div>
                  ) : (
                    <div ref={googleBtnRef} className="min-h-[44px] w-full max-w-sm flex justify-center" />
                  )}
                </div>
                {!googleClientConfigured && (
                  <div className="w-full py-2 px-3 border border-gray-200 dark:border-gray-600 rounded-lg text-xs text-gray-500 dark:text-gray-400 text-center">
                    Google no disponible en este entorno (revisa{' '}
                    <code className="font-mono bg-gray-100 dark:bg-gray-900 px-1 rounded">VITE_GOOGLE_CLIENT_ID</code> al hacer{' '}
                    <strong>build</strong>).
                  </div>
                )}
              </>
            )}
          </form>

          <p className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
            ¿Ya tienes cuenta?{' '}
            <button
              onClick={() => navigate('/auth/login')}
              className="font-medium text-[#0f1419] dark:text-gray-100 hover:underline"
            >
              Iniciar sesión
            </button>
          </p>
        </div>

        <div className="mt-6 text-center">
          <ACCESO__Button
            variant="ghost"
            onClick={() => navigate('/auth/entry')}
          >
            ← Volver
          </ACCESO__Button>
        </div>
      </div>
    </div>
  );
}
