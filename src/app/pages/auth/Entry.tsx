import { useState } from 'react';
import { useNavigate } from 'react-router';
import { LogIn, Building2, User, ArrowRight, Users } from 'lucide-react';
import { WEB__Button } from '../../components/design-system/WEB__Button';
import { UdarLogo } from '../../components/UdarLogo';

type AccountType = 'user' | 'company';

export function Entry() {
  const navigate = useNavigate();
  const [view, setView] = useState<'main' | 'register'>('main');
  const [selectedType, setSelectedType] = useState<AccountType | null>(null);

  if (view === 'register') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-800 flex items-center justify-center p-6">
        <div className="w-full max-w-3xl">
          <div className="text-center mb-10">
            <div className="flex items-center justify-center mb-6">
              <UdarLogo size="xl" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              ¿Cómo quieres usar Udar Edge?
            </h1>
            <p className="text-lg text-gray-600 dark:text-gray-400">
              Elige tu tipo de cuenta para personalizar tu experiencia
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
                Usuario
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Registro rápido y sin fricción. Ideal si vas a trabajar para una empresa existente.
              </p>
              <ul className="space-y-1.5 text-sm text-gray-500 dark:text-gray-400">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-blue-400 rounded-full shrink-0" />
                  Solo datos personales
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-blue-400 rounded-full shrink-0" />
                  Únete a empresas por invitación
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-blue-400 rounded-full shrink-0" />
                  Sin datos fiscales ni de negocio
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
                Acceso completo a todas las funcionalidades. 14 días gratis.
              </p>
              <ul className="space-y-1.5 text-sm text-gray-500 dark:text-gray-400">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full shrink-0" />
                  Dashboard completo y CRM
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full shrink-0" />
                  TPV, catálogo y facturación
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full shrink-0" />
                  Invita y gestiona tu equipo
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
            <UdarLogo size="xl" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            Bienvenido a Udar Edge
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400">
            14 días gratis. Sin tarjeta. Sin permanencia.
          </p>
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
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Accede con tu email y contraseña como propietario o administrador
            </p>
          </button>

          <button
            onClick={() => navigate('/auth/team-login')}
            className="group p-8 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl hover:border-blue-600 transition-all text-left"
          >
            <div className="w-14 h-14 bg-blue-50 dark:bg-blue-900/30 rounded-xl flex items-center justify-center mb-4 group-hover:bg-blue-600 transition-colors">
              <Users className="w-7 h-7 text-blue-600 dark:text-blue-400 group-hover:text-white transition-colors" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Equipo / Empleado
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Entra con el código de tu empresa, tu usuario y contraseña
            </p>
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
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Regístrate como usuario o empresa. 14 días gratis.
            </p>
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