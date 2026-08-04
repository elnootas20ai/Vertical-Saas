import { useNavigate } from 'react-router';
import { AlertTriangle, CreditCard, HelpCircle, Mail } from 'lucide-react';
import { isIosCustomerAccessOnlyApp } from '../../lib/appStoreCompliance';
import { IosCustomerAccessOnlyScreen } from '../../components/saas/IosCustomerAccessOnlyScreen';
import { useAuth } from '../../context/AuthContext';

export function Suspended() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  if (isIosCustomerAccessOnlyApp()) {
    return (
      <IosCustomerAccessOnlyScreen
        title="Cuenta sin acceso activo"
        onLogout={() => void logout()}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center p-6">
      <div className="max-w-2xl w-full">
        <div className="bg-white dark:bg-gray-800 border-2 border-red-200 rounded-2xl p-8 mb-6 text-center">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertTriangle className="w-10 h-10 text-red-600" />
          </div>

          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-3">
            Suscripción pendiente de pago
          </h1>
          <p className="text-lg text-gray-700 dark:text-gray-300 mb-6">
            Para seguir usando Vertial como empresa, completa el pago o avisa una transferencia.
            Tus datos están seguros.
          </p>

          <div className="p-4 bg-amber-50 border-2 border-amber-200 rounded-xl mb-8">
            <p className="text-sm text-amber-950">
              <strong>No es un bloqueo de seguridad.</strong>
              <br />
              Solo hace falta reactivar la suscripción. Los trabajadores de tu equipo no se ven afectados por este aviso.
            </p>
          </div>

          <button
            onClick={() => navigate('/saas/subscription')}
            className="w-full px-8 py-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-colors mb-4 flex items-center justify-center gap-2"
          >
            <CreditCard className="w-5 h-5" />
            Ir a pagar / avisar transferencia
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={() => navigate('/saas/help#contacto')}
            className="p-6 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 rounded-xl transition-all text-left"
          >
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-4">
              <Mail className="w-6 h-6 text-blue-600" />
            </div>
            <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-2">Contactar soporte</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              ¿Necesitas ayuda? Escríbenos a soporte@vertialapp.com
            </p>
          </button>

          <button
            onClick={() => navigate('/saas/help#facturacion')}
            className="p-6 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 rounded-xl transition-all text-left"
          >
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mb-4">
              <HelpCircle className="w-6 h-6 text-green-600" />
            </div>
            <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-2">Centro de ayuda</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Consulta preguntas frecuentes sobre facturación
            </p>
          </button>
        </div>
      </div>
    </div>
  );
}
