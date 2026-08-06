import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Capacitor } from '@capacitor/core';
import {
  Building2,
  User,
  ArrowRight,
  Handshake,
  Monitor,
  type LucideIcon,
} from 'lucide-react';
import { VertialLogo } from '../../components/VertialLogo';
import { AccesoSplitLayout } from '../../components/auth/AccesoSplitLayout';
import { AUTH_PATHS, type AuthAccountType } from '../../lib/authEntryPaths';
import { isIosCustomerAccessOnlyApp, shouldHideBusinessOrganizationRegistrationOnIos } from '../../lib/appStoreCompliance';

type AccentKey = 'neutral' | 'blue' | 'violet';

const ACCENT_STYLES: Record<
  AccentKey,
  {
    iconWrap: string;
    icon: string;
    primary: string;
    secondary: string;
    cardHover: string;
  }
> = {
  neutral: {
    iconWrap: 'bg-gray-100 dark:bg-gray-700',
    icon: 'text-gray-700 dark:text-gray-200',
    primary: 'bg-[#0f1419] hover:bg-[#1a2029] text-white',
    secondary:
      'border-gray-200 dark:border-gray-600 text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700/50',
    cardHover: 'lg:hover:border-gray-300 lg:hover:shadow-md',
  },
  blue: {
    iconWrap: 'bg-blue-50 dark:bg-blue-900/30',
    icon: 'text-blue-600 dark:text-blue-400',
    primary: 'bg-blue-600 hover:bg-blue-700 text-white',
    secondary:
      'border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/30',
    cardHover: 'lg:hover:border-blue-200 lg:hover:shadow-md',
  },
  violet: {
    iconWrap: 'bg-violet-50 dark:bg-violet-900/30',
    icon: 'text-violet-600 dark:text-violet-400',
    primary: 'bg-violet-600 hover:bg-violet-700 text-white',
    secondary:
      'border-violet-200 dark:border-violet-700 text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/30',
    cardHover: 'lg:hover:border-violet-200 lg:hover:shadow-md',
  },
};

const BTN_PRIMARY =
  'w-full min-h-[2.75rem] sm:min-h-[3rem] px-4 sm:px-5 py-3 rounded-xl font-semibold text-sm leading-tight transition-colors';
const BTN_SECONDARY =
  'w-full min-h-[2.5rem] px-4 py-2.5 rounded-xl border-2 font-medium text-sm leading-tight transition-colors flex items-center justify-center gap-2 text-center';

function ResponsiveCopy({
  short,
  full,
}: {
  short: string;
  full: string;
}) {
  return (
    <>
      <span className="lg:hidden">{short}</span>
      <span className="hidden lg:inline">{full}</span>
    </>
  );
}

function EntryRoleCard({
  accent,
  icon: Icon,
  titleShort,
  titleFull,
  descriptionShort,
  descriptionFull,
  primaryShort,
  primaryFull,
  onPrimary,
  secondaryShort,
  secondaryFull,
  onSecondary,
  secondaryIcon: SecondaryIcon,
}: {
  accent: AccentKey;
  icon: LucideIcon;
  titleShort: string;
  titleFull: string;
  descriptionShort: string;
  descriptionFull: string;
  primaryShort: string;
  primaryFull: string;
  onPrimary: () => void;
  secondaryShort?: string;
  secondaryFull?: string;
  onSecondary?: () => void;
  secondaryIcon?: LucideIcon;
}) {
  const styles = ACCENT_STYLES[accent];

  return (
    <div
      className={`flex flex-col h-full p-4 sm:p-5 lg:p-6 bg-white dark:bg-gray-800 border border-gray-200/90 dark:border-gray-700 rounded-2xl shadow-sm transition-shadow ${styles.cardHover}`}
    >
      <div className="flex items-start gap-3 mb-4 lg:mb-5">
        <div
          className={`w-11 h-11 lg:w-12 lg:h-12 rounded-xl flex items-center justify-center shrink-0 ${styles.iconWrap}`}
        >
          <Icon className={`w-5 h-5 lg:w-6 lg:h-6 ${styles.icon}`} />
        </div>
        <div className="min-w-0 pt-0.5 lg:hidden">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 leading-tight">
            {titleShort}
          </h2>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400 leading-snug">
            {descriptionShort}
          </p>
        </div>
        <div className="hidden lg:block min-w-0 pt-0.5 flex-1">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 leading-tight">
            {titleFull}
          </h2>
        </div>
      </div>

      <p className="hidden lg:block mb-5 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
        {descriptionFull}
      </p>

      <div className="mt-auto space-y-2 shrink-0">
        <button type="button" onClick={onPrimary} className={`${BTN_PRIMARY} ${styles.primary}`}>
          <ResponsiveCopy short={primaryShort} full={primaryFull} />
        </button>
        {secondaryShort && secondaryFull && onSecondary ? (
          <button
            type="button"
            onClick={onSecondary}
            className={`${BTN_SECONDARY} ${styles.secondary}`}
          >
            {SecondaryIcon && <SecondaryIcon className="w-4 h-4 shrink-0" />}
            <ResponsiveCopy short={secondaryShort} full={secondaryFull} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function Entry() {
  const navigate = useNavigate();
  const [view, setView] = useState<'main' | 'register'>('main');
  const [selectedType, setSelectedType] = useState<AuthAccountType | null>(null);
  const iosCustomersOnly = isIosCustomerAccessOnlyApp();
  const hideOrgRegistration = shouldHideBusinessOrganizationRegistrationOnIos();

  // iOS: nunca mostrar flujo de alta Empresa/organización (Apple 3.1.1).
  if (view === 'register' && hideOrgRegistration) {
    return (
      <AccesoSplitLayout visualKey="entry" onBack={() => setView('main')}>
        <div className="flex flex-1 flex-col items-center justify-center px-4 py-8">
          <div className="w-full max-w-md rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-6 space-y-4 text-center">
            <h1 className="text-lg font-bold text-amber-950 dark:text-amber-100">
              Solo inicio de sesión
            </h1>
            <p className="text-sm text-amber-900/90 dark:text-amber-200/90 leading-relaxed">
              En la app iOS no se crean cuentas de empresa ni de organización.
              Si ya tienes cuenta activa, vuelve e inicia sesión.
            </p>
            <button
              type="button"
              onClick={() => setView('main')}
              className="w-full min-h-[2.75rem] px-4 py-3 rounded-xl font-semibold text-sm bg-[#0f1419] text-white"
            >
              Volver al acceso
            </button>
          </div>
        </div>
      </AccesoSplitLayout>
    );
  }

  if (view === 'register') {
    return (
      <AccesoSplitLayout visualKey="register-company" onBack={() => setView('main')}>
        <div className="flex flex-1 flex-col items-center px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-8 lg:px-10 lg:py-10">
        <div className="w-full max-w-xl">
          <div className="text-center mb-6 sm:mb-8">
            <div className="hidden lg:flex items-center justify-center mb-5">
              <VertialLogo size="xl" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
              Crear cuenta
            </h1>
          </div>

          {iosCustomersOnly ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-5 mb-6 space-y-3">
              <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">
                Alta de empresa en la web
              </p>
              <p className="text-sm text-amber-900/90 dark:text-amber-200/90 leading-relaxed">
                En la app iOS solo pueden entrar clientes y trabajadores con cuenta ya activa.
                Crea la empresa y la suscripción en vertialapp.com desde un ordenador; después inicia sesión aquí.
              </p>
              <button
                type="button"
                onClick={() => setView('main')}
                className="w-full min-h-[2.75rem] px-4 py-3 rounded-xl font-semibold text-sm bg-[#0f1419] text-white"
              >
                Volver e iniciar sesión
              </button>
            </div>
          ) : (
          <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-6">
            <button
              type="button"
              onClick={() => setSelectedType('company')}
              className={`flex items-center gap-3 p-4 bg-white dark:bg-gray-800 border rounded-2xl text-left transition-all ${
                selectedType === 'company'
                  ? 'border-[#0f1419] ring-2 ring-gray-200 dark:ring-gray-700'
                  : 'border-gray-200/90 dark:border-gray-700'
              }`}
            >
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                selectedType === 'company' ? 'bg-[#0f1419]' : 'bg-gray-100 dark:bg-gray-700'
              }`}>
                <Building2 className={`w-5 h-5 ${selectedType === 'company' ? 'text-white' : 'text-gray-600 dark:text-gray-400'}`} />
              </div>
              <span className="text-base font-semibold text-gray-900 dark:text-gray-100">Empresa</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedType('user')}
              className={`flex items-center gap-3 p-4 bg-white dark:bg-gray-800 border rounded-2xl text-left transition-all ${
                selectedType === 'user'
                  ? 'border-blue-600 ring-2 ring-blue-100 dark:ring-blue-900/50'
                  : 'border-gray-200/90 dark:border-gray-700'
              }`}
            >
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                selectedType === 'user' ? 'bg-blue-600' : 'bg-blue-50 dark:bg-blue-900/30'
              }`}>
                <User className={`w-5 h-5 ${selectedType === 'user' ? 'text-white' : 'text-blue-600 dark:text-blue-400'}`} />
              </div>
              <span className="text-base font-semibold text-gray-900 dark:text-gray-100">Trabajador</span>
            </button>
          </div>

          <div className="flex flex-col items-center gap-4">
            <button
              type="button"
              onClick={() => {
                if (selectedType) {
                  navigate(AUTH_PATHS.register, { state: { accountType: selectedType } });
                }
              }}
              disabled={!selectedType}
              className={`w-full max-w-md flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-semibold text-base transition-all ${
                selectedType
                  ? 'bg-[#0f1419] text-white hover:bg-[#1a2029] cursor-pointer'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
              }`}
            >
              Continuar
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
          </>
          )}
        </div>
        </div>
      </AccesoSplitLayout>
    );
  }

  return (
    <AccesoSplitLayout
      visualKey="entry"
      onBack={!Capacitor.isNativePlatform() ? () => navigate('/') : undefined}
      backLabel="Volver"
    >
      <div className="flex flex-1 flex-col justify-center px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <div className="w-full max-w-3xl mx-auto">
        <div className="text-center mb-6 sm:mb-8 lg:mb-10">
          <div className="hidden lg:flex items-center justify-center mb-5">
            <VertialLogo size="xl" />
          </div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
            <span className="lg:hidden">Acceso a Vertial</span>
            <span className="hidden lg:inline">¿Cómo entras en Vertial?</span>
          </h1>
          <p className="mt-2 text-sm sm:text-base text-gray-500 dark:text-gray-400 max-w-xl mx-auto leading-relaxed">
            <span className="lg:hidden">Elige cómo quieres entrar.</span>
            <span className="hidden lg:inline">
              {hideOrgRegistration
                ? 'Inicia sesión con tu cuenta de empresa, trabajador o afiliado ya activa.'
                : 'Tres accesos distintos: empresa, trabajador o panel de afiliado. Elige el tuyo.'}
            </span>
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 lg:gap-5 items-stretch sm:[&>*:last-child]:col-span-2 sm:[&>*:last-child]:max-w-md sm:[&>*:last-child]:mx-auto lg:[&>*:last-child]:max-w-lg">
          <EntryRoleCard
            accent="neutral"
            icon={Building2}
            titleShort="Empresa"
            titleFull="Empresa / Gerente"
            descriptionShort="Dueños y gerentes."
            descriptionFull="Propietarios, administradores y responsables de gestión. Dashboard, CRM, facturación y equipo."
            primaryShort="Iniciar sesión"
            primaryFull="Iniciar sesión — Empresa"
            onPrimary={() => navigate(AUTH_PATHS.companyLogin)}
            {...(hideOrgRegistration
              ? {}
              : {
                  secondaryShort: 'Crear cuenta',
                  secondaryFull: 'Crear cuenta de empresa',
                  onSecondary: () =>
                    navigate(AUTH_PATHS.register, { state: { accountType: 'company' as const } }),
                })}
          />

          <EntryRoleCard
            accent="blue"
            icon={User}
            titleShort="Trabajador"
            titleFull="Trabajador / Empleado"
            descriptionShort="Equipo en tienda y TPV."
            descriptionFull="Operativa en tienda: fichajes, tareas y módulos asignados. También puedes activar la tablet con el código del local."
            primaryShort="Iniciar sesión"
            primaryFull="Iniciar sesión — Trabajador"
            onPrimary={() => navigate(AUTH_PATHS.workerLogin)}
            secondaryShort="Tablet TPV"
            secondaryFull="Tablet TPV — código de tienda"
            onSecondary={() => navigate(AUTH_PATHS.tpvTabletLogin)}
            secondaryIcon={Monitor}
          />

          <EntryRoleCard
            accent="violet"
            icon={Handshake}
            titleShort="Afiliado"
            titleFull="Afiliado / Partner"
            descriptionShort="Partners y comisiones."
            descriptionFull="Programa de partners: clientes referidos, comisiones y seguimiento de tu red comercial."
            primaryShort="Iniciar sesión"
            primaryFull="Iniciar sesión — Afiliado"
            onPrimary={() => navigate(AUTH_PATHS.affiliatePortal)}
            {...(hideOrgRegistration
              ? {}
              : {
                  secondaryShort: 'Solicitar acceso',
                  secondaryFull: 'Solicitar ser afiliado',
                  onSecondary: () => navigate('/affiliados'),
                })}
          />
        </div>

        {hideOrgRegistration ? (
          <p className="mt-6 lg:mt-8 text-center text-sm text-gray-600 dark:text-gray-400 leading-relaxed px-2">
            Esta app es para iniciar sesión con una cuenta ya activa.
            Soporte: soporte@vertialapp.com
          </p>
        ) : (
        <p className="mt-6 lg:mt-8 text-center text-sm text-gray-600 dark:text-gray-400">
          <span className="lg:hidden">¿Primera vez? </span>
          <span className="hidden lg:inline">¿Primera vez y no tienes invitación? </span>
          <button
            type="button"
            onClick={() => setView('register')}
            className="font-semibold text-[#0f1419] dark:text-gray-100 hover:underline"
          >
            Crear cuenta
          </button>
        </p>
        )}

        {!Capacitor.isNativePlatform() ? (
          <p className="mt-4 text-center text-xs text-gray-500 dark:text-gray-400">
            Vertial · acceso
          </p>
        ) : null}
      </div>
      </div>
    </AccesoSplitLayout>
  );
}
