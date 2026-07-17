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
  'w-full min-h-[2.5rem] px-4 py-2.5 rounded-xl border-2 font-medium text-sm leading-tight transition-colors flex items-center justify-center gap-2 text-center';

function EntryRoleCard({
  accent,
  icon: Icon,
  title,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  secondaryIcon: SecondaryIcon,
}: {
  accent: AccentKey;
  icon: LucideIcon;
  title: string;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  secondaryIcon?: LucideIcon;
}) {
  const styles = ACCENT_STYLES[accent];

  return (
    <div className="flex flex-col h-full p-4 sm:p-5 bg-white dark:bg-gray-800 border border-gray-200/90 dark:border-gray-700 rounded-2xl shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <div
          className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${styles.iconWrap}`}
        >
          <Icon className={`w-5 h-5 ${styles.icon}`} />
        </div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 leading-tight">
          {title}
        </h2>
      </div>

      <div className="mt-auto space-y-2 shrink-0">
        <button type="button" onClick={onPrimary} className={`${BTN_PRIMARY} ${styles.primary}`}>
          {primaryLabel}
        </button>
        {secondaryLabel && onSecondary ? (
          <button
            type="button"
            onClick={onSecondary}
            className={`${BTN_SECONDARY} ${styles.secondary}`}
          >
            {SecondaryIcon && <SecondaryIcon className="w-4 h-4 shrink-0" />}
            {secondaryLabel}
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

  if (view === 'register') {
    return (
      <AccesoSplitLayout visualKey="register-company">
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

            <WEB__Button variant="ghost" onClick={() => setView('main')}>
              ← Volver
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
      <div className="w-full max-w-3xl mx-auto">
        <div className="text-center mb-6 sm:mb-8">
          <div className="hidden lg:flex items-center justify-center mb-5">
            <VertialLogo size="xl" />
          </div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
            Acceso a Vertial
          </h1>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 items-stretch sm:[&>*:last-child]:col-span-2 sm:[&>*:last-child]:max-w-md sm:[&>*:last-child]:mx-auto">
          <EntryRoleCard
            accent="neutral"
            icon={Building2}
            title="Empresa"
            primaryLabel="Iniciar sesión"
            onPrimary={() => navigate(AUTH_PATHS.companyLogin)}
            secondaryLabel="Crear cuenta"
            onSecondary={() => navigate(AUTH_PATHS.register, { state: { accountType: 'company' as const } })}
          />

          <EntryRoleCard
            accent="blue"
            icon={User}
            title="Trabajador"
            primaryLabel="Iniciar sesión"
            onPrimary={() => navigate(AUTH_PATHS.workerLogin)}
            secondaryLabel="Tablet TPV"
            onSecondary={() => navigate(AUTH_PATHS.tpvTabletLogin)}
            secondaryIcon={Monitor}
          />

          <EntryRoleCard
            accent="violet"
            icon={Handshake}
            title="Afiliado"
            primaryLabel="Iniciar sesión"
            onPrimary={() => navigate(AUTH_PATHS.affiliatePortal)}
            secondaryLabel="Solicitar acceso"
            onSecondary={() => navigate('/affiliados')}
          />
        </div>

        <p className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
          ¿Primera vez?{' '}
          <button
            type="button"
            onClick={() => setView('register')}
            className="font-semibold text-[#0f1419] dark:text-gray-100 hover:underline"
          >
            Crear cuenta
          </button>
        </p>

        {!Capacitor.isNativePlatform() && (
          <div className="mt-4 text-center">
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
