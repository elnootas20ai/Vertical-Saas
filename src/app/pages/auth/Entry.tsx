import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Building2,
  User,
  ArrowRight,
  Users,
  BriefcaseBusiness,
  UserCheck,
  KeyRound,
  Handshake,
} from 'lucide-react';
import { WEB__Button } from '../../components/design-system/WEB__Button';
import { VertialLogo } from '../../components/VertialLogo';
import { AUTH_PATHS, type AuthAccountType } from '../../lib/authEntryPaths';

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
      <div className="min-h-screen bg-gray-50 dark:bg-gray-800 flex items-center justify-center p-6">
        <div className="w-full max-w-3xl">
          <div className="text-center mb-10">
            <div className="flex items-center justify-center mb-6">
              <VertialLogo size="xl" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              Crear cuenta
            </h1>
            <p className="text-lg text-gray-600 dark:text-gray-400">
              Elige si gestionas la empresa o te unes como empleado
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <button
              type="button"
              onClick={() => setSelectedType('company')}
              className={`group relative p-8 bg-white dark:bg-gray-800 border-2 rounded-2xl transition-all text-left ${
                selectedType === 'company'
                  ? 'border-[#0f1419] ring-2 ring-gray-200 dark:ring-gray-700'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500'
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
              <ul className="space-y-1.5 text-sm text-gray-500 dark:text-gray-400">
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
              className={`group relative p-8 bg-white dark:bg-gray-800 border-2 rounded-2xl transition-all text-left ${
                selectedType === 'user'
                  ? 'border-blue-600 ring-2 ring-blue-100 dark:ring-blue-900/50'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500'
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
                selectedType === 'user' ? 'bg-blue-600' : 'bg-blue-100 dark:bg-blue-900/40 group-hover:bg-blue-200 dark:group-hover:bg-blue-900/60'
              }`}>
                <User className={`w-7 h-7 transition-colors ${selectedType === 'user' ? 'text-white' : 'text-blue-600 dark:text-blue-400'}`} />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Trabajador</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Alta personal; te unes por invitación o código de empresa.
              </p>
              <ul className="space-y-1.5 text-sm text-gray-500 dark:text-gray-400">
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
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-800 flex items-center justify-center p-6">
      <div className="w-full max-w-6xl">
        <div className="text-center mb-10">
          <div className="flex items-center justify-center mb-6">
            <VertialLogo size="xl" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-gray-100 mb-3">
            ¿Cómo entras en Vertial?
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Tres accesos distintos: empresa, trabajador o panel de afiliado. Elige el tuyo.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {/* Empresa */}
          <div className="flex flex-col p-6 lg:p-7 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl">
            <div className="w-14 h-14 bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center mb-4">
              <Building2 className="w-7 h-7 text-gray-700 dark:text-gray-200" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Empresa / Gerente
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 flex-1">
              Propietarios, administradores y responsables de gestión. Dashboard, CRM, facturación y equipo.
            </p>
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => navigate(AUTH_PATHS.companyLogin)}
                className="w-full px-5 py-3.5 bg-[#0f1419] text-white rounded-xl font-semibold hover:bg-[#1a2029] transition-colors"
              >
                Iniciar sesión — Empresa
              </button>
              <button
                type="button"
                onClick={() => navigate(AUTH_PATHS.register, { state: { accountType: 'company' as const } })}
                className="w-full px-5 py-3 border-2 border-gray-200 dark:border-gray-600 text-gray-800 dark:text-gray-100 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                Crear cuenta de empresa
              </button>
            </div>
          </div>

          {/* Trabajador */}
          <div className="flex flex-col p-6 lg:p-7 bg-white dark:bg-gray-800 border-2 border-blue-200 dark:border-blue-800/60 rounded-2xl">
            <div className="w-14 h-14 bg-blue-50 dark:bg-blue-900/30 rounded-xl flex items-center justify-center mb-4">
              <Users className="w-7 h-7 text-blue-600 dark:text-blue-400" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Trabajador / Empleado
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 flex-1">
              Personal operativo: TPV, fichajes, tareas y módulos asignados por tu empresa.
            </p>
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => navigate(AUTH_PATHS.workerLogin)}
                className="w-full px-5 py-3.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors"
              >
                Iniciar sesión — Trabajador
              </button>
              <button
                type="button"
                onClick={() => navigate(AUTH_PATHS.teamLogin)}
                className="w-full px-5 py-3 border-2 border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300 rounded-xl font-medium hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors flex items-center justify-center gap-2"
              >
                <KeyRound className="w-4 h-4" />
                Entrar con código de empresa
              </button>
            </div>
          </div>

          {/* Afiliado */}
          <div className="flex flex-col p-6 lg:p-7 bg-white dark:bg-gray-800 border-2 border-violet-200 dark:border-violet-800/60 rounded-2xl md:col-span-2 lg:col-span-1">
            <div className="w-14 h-14 bg-violet-50 dark:bg-violet-900/30 rounded-xl flex items-center justify-center mb-4">
              <Handshake className="w-7 h-7 text-violet-600 dark:text-violet-400" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Afiliado / Partner
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 flex-1">
              Programa de partners: clientes referidos, comisiones y seguimiento de tu red comercial.
            </p>
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => navigate(AUTH_PATHS.affiliatePortal)}
                className="w-full px-5 py-3.5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-xl font-semibold hover:from-violet-700 hover:to-indigo-700 transition-colors"
              >
                Iniciar sesión — Afiliado
              </button>
              <button
                type="button"
                onClick={() => navigate('/affiliados')}
                className="w-full px-5 py-3 border-2 border-violet-200 dark:border-violet-700 text-violet-700 dark:text-violet-300 rounded-xl font-medium hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-colors"
              >
                Solicitar ser afiliado
              </button>
            </div>
          </div>
        </div>

        <p className="mt-8 text-center text-sm text-gray-600 dark:text-gray-400">
          ¿Primera vez y no tienes invitación?{' '}
          <button
            type="button"
            onClick={() => setView('register')}
            className="font-semibold text-[#0f1419] dark:text-gray-100 hover:underline"
          >
            Crear cuenta
          </button>
        </p>

        <div className="mt-6 text-center">
          <WEB__Button variant="ghost" onClick={() => navigate('/')}>
            ← Volver a la web
          </WEB__Button>
        </div>
      </div>
    </div>
  );
}
