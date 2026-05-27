import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Building2, User, ArrowRight, Users, BriefcaseBusiness, ClipboardList, UserCheck } from 'lucide-react';
import { WEB__Button } from '../../components/design-system/WEB__Button';
import { VertialLogo } from '../../components/VertialLogo';

type AccountType = 'user' | 'company';

export function Entry() {
  const navigate = useNavigate();
  const [view, setView] = useState<'main' | 'register'>('main');
  const [selectedType, setSelectedType] = useState<AccountType | null>(null);

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
              ¿Cómo quieres usar Vertial?
            </h1>
            <p className="text-lg text-gray-600 dark:text-gray-400">
              Elige el tipo de acceso según tus funciones
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <button
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
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Usuario / Empleado
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Acceso personal para formar parte de una empresa existente.
              </p>
              <div className="rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40 p-3 mb-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300 mb-2">
                  Funciones principales
                </p>
                <ul className="space-y-1.5 text-sm text-blue-700 dark:text-blue-300">
                  {roleHighlights.employee.map((item) => (
                    <li key={item} className="flex items-center gap-2">
                      <UserCheck className="w-3.5 h-3.5 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <ul className="space-y-1.5 text-sm text-gray-500 dark:text-gray-400">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-blue-400 rounded-full shrink-0" />
                  Alta rápida con datos personales
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-blue-400 rounded-full shrink-0" />
                  Te unes por invitación o código de empresa
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-blue-400 rounded-full shrink-0" />
                  No requiere datos fiscales
                </li>
              </ul>
            </button>

            <button
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
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Empresa
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Perfil de gestión con control completo del negocio.
              </p>
              <div className="rounded-xl bg-gray-100 dark:bg-gray-700/60 border border-gray-200 dark:border-gray-600 p-3 mb-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-200 mb-2">
                  Funciones principales
                </p>
                <ul className="space-y-1.5 text-sm text-gray-700 dark:text-gray-200">
                  {roleHighlights.manager.map((item) => (
                    <li key={item} className="flex items-center gap-2">
                      <BriefcaseBusiness className="w-3.5 h-3.5 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <ul className="space-y-1.5 text-sm text-gray-500 dark:text-gray-400">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full shrink-0" />
                  Dashboard ejecutivo, CRM y reportes
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full shrink-0" />
                  TPV, catálogo y facturación
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full shrink-0" />
                  Gestión de equipo y permisos
                </li>
              </ul>
            </button>
          </div>

          <div className="flex flex-col items-center gap-4">
            <button
              onClick={() => {
                if (selectedType) {
                  navigate('/auth/register', { state: { accountType: selectedType } });
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
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-800 flex items-center justify-center p-6">
      <div className="w-full max-w-5xl">
        <div className="text-center mb-12">
          <div className="flex items-center justify-center mb-6">
            <VertialLogo size="xl" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            Bienvenido a Vertial
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400">
            14 días gratis. Sin tarjeta. Sin permanencia.
          </p>
          <div className="mt-5 inline-flex flex-wrap items-center justify-center gap-2 text-xs text-gray-600 dark:text-gray-300">
            <span className="px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600">Empresa/Gerente = gestión completa</span>
            <span className="px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40 text-blue-700 dark:text-blue-300">Empleado = operación diaria</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <button
            onClick={() => navigate('/auth/login')}
            className="group p-8 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl hover:border-[#0f1419] transition-all text-left"
          >
            <div className="w-14 h-14 bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center mb-4 group-hover:bg-[#0f1419] transition-colors">
              <Building2 className="w-7 h-7 text-gray-600 dark:text-gray-400 group-hover:text-white transition-colors" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Empresa / Gerente
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Para propietarios y responsables de gestión.
            </p>
            <ul className="space-y-1.5 text-xs text-gray-500 dark:text-gray-400">
              <li className="flex items-center gap-2">
                <ClipboardList className="w-3.5 h-3.5 shrink-0" />
                Configuración, ventas y seguimiento global
              </li>
              <li className="flex items-center gap-2">
                <ClipboardList className="w-3.5 h-3.5 shrink-0" />
                Gestión de personal y permisos
              </li>
            </ul>
          </button>

          <button
            onClick={() => navigate('/auth/worker-login')}
            className="group p-8 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl hover:border-blue-600 transition-all text-left"
          >
            <div className="w-14 h-14 bg-blue-50 dark:bg-blue-900/30 rounded-xl flex items-center justify-center mb-4 group-hover:bg-blue-600 transition-colors">
              <Users className="w-7 h-7 text-blue-600 dark:text-blue-400 group-hover:text-white transition-colors" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Trabajador / Empleado
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Para personal operativo del día a día.
            </p>
            <ul className="space-y-1.5 text-xs text-gray-500 dark:text-gray-400">
              <li className="flex items-center gap-2">
                <ClipboardList className="w-3.5 h-3.5 shrink-0" />
                Inicio con correo y contraseña
              </li>
              <li className="flex items-center gap-2">
                <ClipboardList className="w-3.5 h-3.5 shrink-0" />
                Acceso directo a tu panel de trabajador
              </li>
              <li className="flex items-center gap-2">
                <ClipboardList className="w-3.5 h-3.5 shrink-0" />
                TPV, fichajes y tareas asignadas
              </li>
            </ul>
          </button>

          <button
            onClick={() => setView('register')}
            className="group p-8 bg-white dark:bg-gray-800 border-2 border-[#0f1419] rounded-2xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-all text-left"
          >
            <div className="w-14 h-14 bg-[#0f1419] rounded-xl flex items-center justify-center mb-4">
              <ArrowRight className="w-7 h-7 text-white" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Crear cuenta
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Si aun no tienes acceso, crea tu cuenta en 1 minuto.
            </p>
            <ul className="space-y-1.5 text-xs text-gray-500 dark:text-gray-400">
              <li className="flex items-center gap-2">
                <ClipboardList className="w-3.5 h-3.5 shrink-0" />
                Elige entre cuenta Empresa o Empleado
              </li>
              <li className="flex items-center gap-2">
                <ClipboardList className="w-3.5 h-3.5 shrink-0" />
                Onboarding guiado tras el registro
              </li>
            </ul>
          </button>
        </div>

        <div className="mt-8 text-center">
          <WEB__Button 
            variant="ghost"
            onClick={() => navigate('/')}
          >
            ← Volver a la web
          </WEB__Button>
        </div>
      </div>
    </div>
  );
}