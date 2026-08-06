import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { Mail, Lock, User, Phone, CheckCircle, Eye, EyeOff, Building2, Gift } from 'lucide-react';
import { validateReferralCode } from '../../lib/affiliatesApi';
import { ACCESO__Button } from '../../components/design-system/ACCESO__Button';
import { ACCESO__Input } from '../../components/design-system/ACCESO__Input';
import { ACCESO__Checkbox } from '../../components/design-system/ACCESO__Checkbox';
import { VertialLogo } from '../../components/VertialLogo';
import { AccesoSplitLayout } from '../../components/auth/AccesoSplitLayout';
import { AUTH_PATHS } from '../../lib/authEntryPaths';
import { useAuth } from '../../context/AuthContext';
import { useGoogleSignIn, googleClientConfigured } from '../../hooks/useGoogleSignIn';
import { shouldHideThirdPartyAuthOnIos, isAppleSignInAvailable, shouldHideBusinessOrganizationRegistrationOnIos } from '../../lib/appStoreCompliance';
import { IosCustomerAccessOnlyScreen } from '../../components/saas/IosCustomerAccessOnlyScreen';
import { signInWithApple } from '../../lib/appleSignIn';
import { AppleSignInButton } from '../../components/auth/AppleSignInButton';
import type { AppleUserProfile, GoogleUserProfile } from '../../lib/authApi';
import { LegalAgreementsModal } from '../../components/legal/LegalAgreementsModal';
import { clearLegacyOnboardingDraft, setPendingVerifyEmail } from '../../lib/onboardingLocalKeys';

type AccountType = 'user' | 'company';

interface LocationState {
  googleUser?: GoogleUserProfile;
  googleCredential?: string;
  appleUser?: AppleUserProfile;
  appleCredential?: string;
  accountType?: AccountType;
}

function destinationAfterSignup(opts: {
  emailVerified?: boolean;
  redirectTo?: string;
  isUserAccount: boolean;
}) {
  if (opts.emailVerified === false) {
    return '/auth/verify-email-pending';
  }
  return opts.redirectTo ?? (opts.isUserAccount ? '/saas/user-dashboard' : '/auth/onboarding/business-type');
}

export function Register() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { resolvedTheme } = useTheme();
  const { register, googleLogin, appleLogin } = useAuth();

  const locationState = (location.state || {}) as LocationState;
  const incomingGoogle = locationState.googleUser || null;
  const incomingApple = locationState.appleUser || null;
  const incomingCredential = locationState.googleCredential || '';
  const incomingAppleCredential = locationState.appleCredential || '';
  const accountType: AccountType = locationState.accountType || 'company';
  const isUserAccount = accountType === 'user';

  const [googleCredential, setGoogleCredential] = useState(incomingCredential);
  const [appleCredential, setAppleCredential] = useState(incomingAppleCredential);
  const [googleAvatar, setGoogleAvatar] = useState(incomingGoogle?.avatar || '');

  const initialReferral = searchParams.get('ref') || '';

  const [formData, setFormData] = useState({
    firstName: incomingGoogle?.firstName || incomingApple?.firstName || '',
    lastName: incomingGoogle?.lastName || incomingApple?.lastName || '',
    email: incomingGoogle?.email || incomingApple?.email || '',
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
  const [legalModalOpen, setLegalModalOpen] = useState(false);
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

  /** Mismo PC: no reutilizar borrador de empresa/tarjeta de otro registro. */
  useEffect(() => {
    clearLegacyOnboardingDraft();
  }, []);

  const isGoogleFlow = Boolean(googleCredential);
  const isAppleFlow = Boolean(appleCredential);
  const isSocialFlow = isGoogleFlow || isAppleFlow;

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
  }, [googleLogin, navigate, isUserAccount]);

  const handleAppleSignIn = useCallback(async () => {
    setIsSubmitting(true);
    setErrors({});
    try {
      const apple = await signInWithApple();
      const result = await appleLogin(apple.identityToken, {
        givenName: apple.givenName || undefined,
        familyName: apple.familyName || undefined,
      });

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

      if (result.code === 'APPLE_ACCOUNT_NOT_FOUND' && result.appleUser) {
        setAppleCredential(apple.identityToken);
        setGoogleCredential('');
        setGoogleAvatar('');
        setFormData((prev) => ({
          ...prev,
          firstName: result.appleUser!.firstName || apple.givenName || prev.firstName,
          lastName: result.appleUser!.lastName || apple.familyName || prev.lastName,
          email: result.appleUser!.email || apple.email || prev.email,
        }));
        return;
      }

      setErrors({ email: result.error || 'Error al registrarse con Apple' });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error al registrarse con Apple';
      if (!msg.toLowerCase().includes('cancel')) {
        setErrors({ email: msg });
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [appleLogin, navigate, isUserAccount]);

  const hideGoogleOnIos = shouldHideThirdPartyAuthOnIos();
  const showAppleAuth = isAppleSignInAvailable();
  const showGoogleAuth = googleClientConfigured && !hideGoogleOnIos;
  const { ready: googleReady, renderButton } = useGoogleSignIn(handleGoogleCredential);
  const googleBtnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showGoogleAuth || !googleReady || !googleBtnRef.current || isGoogleFlow) return;
    const theme = resolvedTheme === 'dark' ? 'filled_black' : 'filled_blue';
    renderButton(googleBtnRef.current, { theme, size: 'large', text: 'signup_with' });
  }, [showGoogleAuth, googleReady, renderButton, isGoogleFlow, resolvedTheme]);

  useEffect(() => {
    if (!showGoogleAuth || googleReady || isGoogleFlow) {
      setGoogleTimedOut(false);
      return;
    }
    const t = window.setTimeout(() => setGoogleTimedOut(true), 8000);
    return () => window.clearTimeout(t);
  }, [showGoogleAuth, googleReady, isGoogleFlow]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: Record<string, string> = {};
    if (!formData.firstName) newErrors.firstName = 'El nombre es requerido';
    if (!formData.lastName) newErrors.lastName = 'Los apellidos son requeridos';
    if (!formData.email) newErrors.email = 'El email es requerido';
    if (!isUserAccount && !formData.phone) newErrors.phone = 'El teléfono es requerido';
    if (!isSocialFlow) {
      if (!formData.password) newErrors.password = 'La contraseña es requerida';
      if (formData.password.length < 8) newErrors.password = 'Mínimo 8 caracteres';
      if (formData.password !== formData.confirmPassword) {
        newErrors.confirmPassword = 'Las contraseñas no coinciden';
      }
    }
    if (!formData.acceptTerms) {
      newErrors.acceptTerms = 'Debes aceptar los acuerdos legales';
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
      ...(isSocialFlow ? {} : { password: formData.password }),
      accountType,
      ...(googleCredential ? { googleCredential } : {}),
      ...(appleCredential ? { appleCredential } : {}),
      ...(formData.referralCode.trim() ? { referralCode: formData.referralCode.trim().toUpperCase() } : {}),
    });
    setIsSubmitting(false);

    if (result.success) {
      const path = destinationAfterSignup({
        emailVerified: result.emailVerified,
        redirectTo: result.redirectTo,
        isUserAccount,
      });
      if (path === '/auth/verify-email-pending') {
        setPendingVerifyEmail(formData.email);
      }
      navigate(path, {
        replace: true,
        state:
          path === '/auth/verify-email-pending'
            ? {
                email: formData.email.trim(),
                verificationEmailSent: result.verificationEmailSent,
              }
            : undefined,
      });
    } else {
      setErrors({ email: result.error || 'Error al crear la cuenta' });
    }
  };

  const handleCancelSocial = () => {
    setGoogleCredential('');
    setAppleCredential('');
    setGoogleAvatar('');
    setFormData((prev) => ({ ...prev, firstName: '', lastName: '', email: '' }));
  };

  if (shouldHideBusinessOrganizationRegistrationOnIos() && !isUserAccount) {
    return (
      <IosCustomerAccessOnlyScreen
        title="Alta de empresa no disponible en iOS"
        onLogout={() => navigate('/auth/login')}
      />
    );
  }

  return (
    <AccesoSplitLayout
      visualKey={isUserAccount ? 'register-user' : 'register-company'}
      scrollable
      onBack={() => navigate(AUTH_PATHS.entry)}
    >
      <div className="flex min-h-dvh flex-col items-center justify-center p-4 sm:p-6 lg:min-h-0 lg:flex-1 lg:px-8">
      <div className="w-full max-w-lg shrink-0">
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 sm:p-6 shadow-sm">
          <div className="text-center mb-4">
            <div className="flex items-center justify-center mb-3">
              <VertialLogo size="md" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">
              {isUserAccount ? 'Crear cuenta de trabajador' : 'Crear cuenta de empresa'}
            </h1>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
              {isUserAccount
                ? 'Alta personal — podrás unirte a tu empresa cuando te inviten'
                : 'Crea tu espacio de trabajo en minutos'}
            </p>
            <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
              {isUserAccount ? (
                <><User className="w-3 h-3" /> Cuenta de trabajador</>
              ) : (
                <><Building2 className="w-3 h-3" /> Cuenta de empresa</>
              )}
            </div>
          </div>

          {(isGoogleFlow || isAppleFlow) && (
            <div className="mb-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3">
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
                    {isAppleFlow ? 'Apple ID verificado' : 'Cuenta de Google verificada'}
                  </p>
                  <p className="text-xs text-blue-600 dark:text-blue-400 truncate">
                    {formData.email}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCancelSocial}
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

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
              <ACCESO__Input
                label="Nombre"
                type="text"
                placeholder="Juan"
                icon={<User className="w-4 h-4" />}
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

            <div className="relative min-w-0">
              <ACCESO__Input
                label="Email"
                type="email"
                placeholder="tu@email.com"
                icon={<Mail className="w-4 h-4" />}
                value={formData.email}
                onChange={(e) => {
                  if (!isSocialFlow) {
                    setFormData({ ...formData, email: e.target.value });
                    setErrors({ ...errors, email: '' });
                  }
                }}
                error={errors.email}
                disabled={isSocialFlow}
                className={isSocialFlow ? '!pr-10' : ''}
              />
              {isSocialFlow && (
                <div className="pointer-events-none absolute right-3 top-8 flex items-center">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                </div>
              )}
            </div>

            <ACCESO__Input
              label={isUserAccount ? 'Teléfono (opc.)' : 'Teléfono'}
              type="tel"
              placeholder="+34 600 000 000"
              icon={<Phone className="w-4 h-4" />}
              value={formData.phone}
              onChange={(e) => {
                setFormData({ ...formData, phone: e.target.value });
                setErrors({ ...errors, phone: '' });
              }}
              error={errors.phone}
            />

            {!isSocialFlow && (
            <div className="space-y-3 min-w-0">
              <ACCESO__Input
                label="Contraseña"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="8 caracteres mínimo"
                icon={<Lock className="w-4 h-4" />}
                value={formData.password}
                onChange={(e) => {
                  setFormData({ ...formData, password: e.target.value });
                  setErrors({ ...errors, password: '' });
                }}
                error={errors.password}
                suffix={
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500"
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                }
              />

              <ACCESO__Input
                label="Repetir contraseña"
                type={showConfirmPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Confirma tu contraseña"
                icon={<Lock className="w-4 h-4" />}
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
                    className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                }
              />
            </div>
            )}

            <details className="group rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2">
              <summary className="cursor-pointer list-none text-xs font-medium text-gray-600 dark:text-gray-400 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5">
                  <Gift className="w-3.5 h-3.5" />
                  Código de referido (opcional)
                </span>
                <span className="text-[10px] text-gray-400 group-open:hidden">Mostrar</span>
              </summary>
              <div className="relative mt-2">
                <input
                  type="text"
                  placeholder="Ej: REF-A7K2N3"
                  value={formData.referralCode}
                  onChange={(e) => {
                    const val = e.target.value.toUpperCase();
                    setFormData({ ...formData, referralCode: val });
                    checkReferralCode(val);
                  }}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm font-mono tracking-wider bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {formData.referralCode.trim() && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {validatingReferral ? (
                      <div className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                    ) : referralInfo?.valid ? (
                      <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                    ) : (
                      <span className="text-[10px] text-red-500 font-medium">No válido</span>
                    )}
                  </div>
                )}
              </div>
              {referralInfo?.valid && referralInfo.name ? (
                <p className="mt-1 text-[11px] text-green-600 dark:text-green-400">
                  Referido por: {referralInfo.name}
                </p>
              ) : null}
            </details>

            <div>
              <div className="flex items-start gap-2">
                <ACCESO__Checkbox
                  checked={formData.acceptTerms}
                  onChange={(e) => {
                    setFormData({ ...formData, acceptTerms: e.target.checked });
                    setErrors({ ...errors, acceptTerms: '' });
                  }}
                  aria-label="He leído y acepto los acuerdos legales"
                />
                <p className="text-xs leading-snug text-gray-700 dark:text-gray-300">
                  Acepto los{' '}
                  <button
                    type="button"
                    onClick={() => setLegalModalOpen(true)}
                    className="font-semibold text-blue-600 hover:underline dark:text-blue-400"
                  >
                    acuerdos legales
                  </button>
                </p>
              </div>
              {errors.acceptTerms ? (
                <p className="mt-1 text-xs text-red-600">{errors.acceptTerms}</p>
              ) : null}
            </div>

            <LegalAgreementsModal isOpen={legalModalOpen} onClose={() => setLegalModalOpen(false)} />

            <ACCESO__Button
              type="submit"
              variant="primary"
              fullWidth
              size="lg"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? 'Registrando...'
                : isAppleFlow
                  ? 'Crear cuenta con Apple'
                  : isGoogleFlow
                    ? 'Crear cuenta con Google'
                    : 'Crear cuenta'}
            </ACCESO__Button>

            {!isSocialFlow && !hideGoogleOnIos && (
              <>
                <div className="relative my-2">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200 dark:border-gray-700" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="px-3 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400">o</span>
                  </div>
                </div>

                <div className="flex flex-col items-center gap-2.5 w-full">
                  {!showGoogleAuth ? null : !googleReady && !googleTimedOut ? (
                    <div className="min-h-[40px] w-full max-w-sm flex items-center justify-center gap-2 rounded-lg border border-gray-200 dark:border-gray-600 py-2 px-3 text-xs text-gray-500 dark:text-gray-400">
                      <span className="inline-block w-4 h-4 shrink-0 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" aria-hidden />
                      <span>Cargando Google…</span>
                    </div>
                  ) : !googleReady && googleTimedOut ? null : (
                    <div ref={googleBtnRef} className="min-h-[40px] w-full max-w-sm flex justify-center" />
                  )}
                  {showAppleAuth ? (
                    <div className="w-full max-w-sm">
                      <AppleSignInButton label="Registrarse con Apple" disabled={isSubmitting} onPress={handleAppleSignIn} />
                    </div>
                  ) : null}
                </div>
              </>
            )}

            {!isSocialFlow && hideGoogleOnIos && showAppleAuth && (
              <>
                <div className="relative my-2">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200 dark:border-gray-700" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="px-3 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400">o</span>
                  </div>
                </div>
                <AppleSignInButton label="Registrarse con Apple" disabled={isSubmitting} onPress={handleAppleSignIn} />
              </>
            )}
          </form>

          <div className="mt-3 flex flex-wrap items-center justify-end gap-2 text-xs text-gray-600 dark:text-gray-400">
            <p>
              ¿Ya tienes cuenta?{' '}
              <button
                type="button"
                onClick={() => navigate('/auth/login')}
                className="font-semibold text-[#0f1419] dark:text-gray-100 hover:underline"
              >
                Iniciar sesión
              </button>
            </p>
          </div>
        </div>
      </div>
      </div>
    </AccesoSplitLayout>
  );
}
