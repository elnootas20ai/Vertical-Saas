import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Capacitor } from '@capacitor/core';
import {
  Building2,
  User,
  ArrowRight,
  BriefcaseBusiness,
  UserCheck,
  Handshake,
  Monitor,
  type LucideIcon,
} from 'lucide-react';
import { WEB__Button } from '../../components/design-system/WEB__Button';
import { VertialLogo } from '../../components/VertialLogo';
import { AccesoSplitLayout } from '../../components/auth/AccesoSplitLayout';
import { AUTH_PATHS, type AuthAccountType } from '../../lib/authEntryPaths';

type AccentKey = 'neutral' | 'blue' | 'violet';

const ACCENT_STYLES: Record<
  AccentKey,
  {
    iconWrap: string;
    icon: string;
    primary: string;
    secondary: string;
  }
> = {
  neutral: {
    iconWrap: 'bg-gray-100 dark:bg-gray-700',
    icon: 'text-gray-700 dark:text-gray-200',
    primary: 'bg-[#0f1419] hover:bg-[#1a2029] text-white',
    secondary:
      'border-gray-200 dark:border-gray-600 text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700/50',
  },
  blue: {
    iconWrap: 'bg-blue-50 dark:bg-blue-900/30',
    icon: 'text-blue-600 dark:text-blue-400',
    primary: 'bg-blue-600 hover:bg-blue-700 text-white',
    secondary:
      'border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/30',
  },
  violet: {
    iconWrap: 'bg-violet-50 dark:bg-violet-900/30',
    icon: 'text-violet-600 dark:text-violet-400',
    primary: 'bg-violet-600 hover:bg-violet-700 text-white',
    secondary:
      'border-violet-200 dark:border-violet-700 text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/30',
  },
};

const BTN_PRIMARY =
  'w-full min-h-[2.75rem] sm:min-h-[3rem] px-4 sm:px-5 py-3 rounded-xl font-semibold text-sm leading-tight transition-colors';
const BTN_SECONDARY =
  'w-full min-h-[2.75rem] sm:min-h-[3rem] px-4 sm:px-5 py-3 rounded-xl border-2 font-medium text-sm leading-tight transition-colors flex items-center justify-center gap-2 text-center';

function EntryRoleCard({
  accent,
  icon: Icon,
  title,
  description,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  secondaryIcon: SecondaryIcon,
}: {
  accent: AccentKey;
  icon: LucideIcon;
  title: string;
  description: string;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel: string;
  onSecondary: () => void;
  secondaryIcon?: LucideIcon;
}) {
  const styles = ACCENT_STYLES[accent];

  return (
    <div className="flex flex-col h-full p-4 sm:p-6 xl:p-7 bg-white dark:bg-gray-800 border border-gray-200/90 dark:border-gray-700 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3 sm:gap-4 mb-3 sm:mb-4">
        <div
          className={`w-12 h-12 sm:w-14 sm:h-14 rounded-xl flex items-center justify-center shrink-0 ${styles.iconWrap}`}
        >
          <Icon className={`w-6 h-6 sm:w-7 sm:h-7 ${styles.icon}`} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100 leading-tight">{title}</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-gray-600 dark:text-gray-400">{description}</p>
        </div>
      </div>

      <div className="mt-auto space-y-2.5 sm:space-y-3 shrink-0 pt-2">
        <button type="button" onClick={onPrimary} className={`${BTN_PRIMARY} ${styles.primary}`}>
          {primaryLabel}
        </button>
        <button
          type="button"
          onClick={onSecondary}
          className={`${BTN_SECONDARY} ${styles.secondary}`}
        >
          {SecondaryIcon && <SecondaryIcon className="w-4 h-4 shrink-0" />}
          {secondaryLabel}
        </button>
      </div>
    </div>
  );
}

export function Entry() {
  const navigate = useNavigate();
  const [view, setView] = useState<'main' | 'register'>('main');
  const [selectedType, setSelectedType] = useState<AuthAccountType | null>(null);

  const roleHighlights = {
    manager: ['Configura negocio y sedes', 'Gestiona equipo y permisos', 'Controla ventas, CRM y facturas'],
    employee: ['Registra tareas y fichajes', 'Opera módulos asignados y TPV', 'Reporta actividad diaria'],
  };

  if (view === 'register') {
    return (
      <AccesoSplitLayout visualKey="register-company">
        <div className="flex flex-1 flex-col items-center px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-8 lg:px-10 lg:py-10">
        <div className="w-full max-w-3xl">
          <div className="text-center mb-6 sm:mb-8 2xl:mb-10">
            <div className="hidden 2xl:flex items-center justify-center mb-5">
              <VertialLogo size="xl" />
            </div>
            <h1 className="text-xl sm:text-2xl 2xl:text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              Crear cuenta
            </h1>
            <p className="text-sm sm:text-base 2xl:text-lg text-gray-600 dark:text-gray-400">
              Elige si gestionas la empresa o te unes como empleado
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5 lg:gap-6 mb-6 sm:mb-8 items-stretch">
            <button
              type="button"
              onClick={() => setSelectedType('company')}
              className={`group relative flex flex-col h-full p-5 sm:p-6 2xl:p-8 bg-white dark:bg-gray-800 border rounded-2xl shadow-sm hover:shadow-md transition-all text-left ${
                selectedType === 'company'
                  ? 'border-[#0f1419] ring-2 ring-gray-200 dark:ring-gray-700'
                  : 'border-gray-200/90 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500'
              }`}
            >
              {selectedType === 'company' && (
                <div className="absolute top-4 right-4 w-6 h-6 bg-[#0f1419] rounded-full flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
              <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-4 transition-colors ${
                selectedType === 'company' ? 'bg-[#0f1419]' : 'bg-gray-100 dark:bg-gray-700 group-hover:bg-gray-200 dark:group-hover:bg-gray-600'
              }`}>
                <Building2 className={`w-7 h-7 transition-colors ${selectedType === 'company' ? 'text-white' : 'text-gray-600 dark:text-gray-400'}`} />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Empresa</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Registro con datos fiscales y onboarding de negocio.
              </p>
              <ul className="space-y-1.5 text-sm text-gray-500 dark:text-gray-400 mt-auto">
                {roleHighlights.manager.map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <BriefcaseBusiness className="w-3.5 h-3.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </button>

            <button
              type="button"
              onClick={() => setSelectedType('user')}
              className={`group relative flex flex-col h-full p-5 sm:p-6 2xl:p-8 bg-white dark:bg-gray-800 border rounded-2xl shadow-sm hover:shadow-md transition-all text-left ${
                selectedType === 'user'
                  ? 'border-blue-600 ring-2 ring-blue-100 dark:ring-blue-900/50'
                  : 'border-gray-200/90 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500'
              }`}
            >
              {selectedType === 'user' && (
                <div className="absolute top-4 right-4 w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
              <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-4 transition-colors ${
                selectedType === 'user' ? 'bg-blue-600' : 'bg-blue-50 dark:bg-blue-900/30 group-hover:bg-blue-100 dark:group-hover:bg-blue-900/50'
              }`}>
                <User className={`w-7 h-7 transition-colors ${selectedType === 'user' ? 'text-white' : 'text-blue-600 dark:text-blue-400'}`} />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Trabajador</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Alta personal; te unes por invitación de tu empresa.
              </p>
              <ul className="space-y-1.5 text-sm text-gray-500 dark:text-gray-400 mt-auto">
                {roleHighlights.employee.map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <UserCheck className="w-3.5 h-3.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
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
              Continuar con el registro
              <ArrowRight className="w-5 h-5" />
            </button>

            <WEB__Button variant="ghost" onClick={() => setView('main')}>
              ← Volver al acceso
            </WEB__Button>
          </div>
        </div>
        </div>
      </AccesoSplitLayout>
    );
  }

  return (
    <AccesoSplitLayout visualKey="entry">
      <div className="flex flex-1 flex-col px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <div className="w-full max-w-6xl mx-auto">
        <div className="text-center mb-5 sm:mb-8 2xl:mb-10">
          <div className="hidden 2xl:flex items-center justify-center mb-5">
            <VertialLogo size="xl" />
          </div>
          <h1 className="text-xl sm:text-2xl 2xl:text-4xl font-bold text-gray-900 dark:text-gray-100 mb-2 sm:mb-3 tracking-tight">
            ¿Cómo entras en Vertial?
          </h1>
          <p className="text-sm sm:text-base 2xl:text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto leading-relaxed px-1">
            Tres accesos distintos: empresa, trabajador o panel de afiliado. Elige el tuyo.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-2 gap-3 sm:gap-5 lg:gap-6 items-stretch [&>*:last-child]:md:col-span-2 [&>*:last-child]:md:max-w-lg [&>*:last-child]:md:mx-auto [&>*:last-child]:xl:col-span-1 [&>*:last-child]:xl:max-w-none [&>*:last-child]:xl:mx-0 [&>*:last-child]:2xl:col-span-2 [&>*:last-child]:2xl:max-w-xl [&>*:last-child]:2xl:mx-auto">
          <EntryRoleCard
            accent="neutral"
            icon={Building2}
            title="Empresa / Gerente"
            description="Propietarios, administradores y responsables de gestión. Dashboard, CRM, facturación y equipo."
            primaryLabel="Iniciar sesión — Empresa"
            onPrimary={() => navigate(AUTH_PATHS.companyLogin)}
            secondaryLabel="Crear cuenta de empresa"
            onSecondary={() => navigate(AUTH_PATHS.register, { state: { accountType: 'company' as const } })}
          />

          <EntryRoleCard
            accent="blue"
            icon={User}
            title="Trabajador / Empleado"
            description="Operativa en tienda: fichajes, tareas y módulos asignados. También puedes activar la tablet con el código del local."
            primaryLabel="Iniciar sesión — Trabajador"
            onPrimary={() => navigate(AUTH_PATHS.workerLogin)}
            secondaryLabel="Tablet TPV — código de tienda"
            onSecondary={() => navigate(AUTH_PATHS.tpvTabletLogin)}
            secondaryIcon={Monitor}
          />

          <EntryRoleCard
            accent="violet"
            icon={Handshake}
            title="Afiliado / Partner"
            description="Programa de partners: clientes referidos, comisiones y seguimiento de tu red comercial."
            primaryLabel="Iniciar sesión — Afiliado"
            onPrimary={() => navigate(AUTH_PATHS.affiliatePortal)}
            secondaryLabel="Solicitar ser afiliado"
            onSecondary={() => navigate('/affiliados')}
          />
        </div>

        <p className="mt-6 sm:mt-8 text-center text-sm text-gray-600 dark:text-gray-400">
          ¿Primera vez y no tienes invitación?{' '}
          <button
            type="button"
            onClick={() => setView('register')}
            className="font-semibold text-[#0f1419] dark:text-gray-100 hover:underline"
          >
            Crear cuenta
          </button>
        </p>

        {/* En la app nativa no hay landing web a la que volver */}
        {!Capacitor.isNativePlatform() && (
          <div className="mt-6 text-center">
            <WEB__Button variant="ghost" onClick={() => navigate('/')}>
              ← Volver a la web
            </WEB__Button>
          </div>
        )}
      </div>
      </div>
    </AccesoSplitLayout>
  );
}
