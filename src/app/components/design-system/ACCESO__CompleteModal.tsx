import { useState } from 'react';
import { CheckCircle } from 'lucide-react';
import { ACCESO__Modal } from './ACCESO__Modal';
import { ACCESO__Button } from './ACCESO__Button';

export interface ACCESO__CompleteModalProps {
  onComplete?: () => void;
}

export function ACCESO__CompleteModal({ onComplete }: ACCESO__CompleteModalProps) {
  const [isOpen, setIsOpen] = useState(true);

  const handleClose = () => {
    setIsOpen(false);
    if (onComplete) {
      onComplete();
    }
  };

  return (
    <ACCESO__Modal
      isOpen={isOpen}
      onClose={handleClose}
      showCloseButton={false}
    >
      <div className="text-center py-6">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-10 h-10 text-green-600" />
        </div>
        <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-3">
          ✅ Bloque Acceso completado
        </h2>
        <p className="text-lg text-gray-600 dark:text-gray-400 mb-6">
          El flujo completo de autenticación, registro y onboarding está listo y navegable
        </p>
        
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6 mb-6 text-left">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Pantallas incluidas:</h3>
          <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>✓ ACCESO__00 - Entry (punto de entrada)</li>
            <li>✓ ACCESO__01 - Login (con validaciones)</li>
            <li>✓ ACCESO__02 - Recover (recuperación de contraseña)</li>
            <li>✓ ACCESO__03 - Registro (con validaciones UI)</li>
            <li>✓ ACCESO__04 - Onboarding Tipo de negocio</li>
            <li>✓ ACCESO__05 - Onboarding Empresa (+ ANCOVE toggle)</li>
            <li>✓ ACCESO__06 - Onboarding Estructura (+ invitar usuarios)</li>
            <li>✓ ACCESO__07 - Onboarding Necesidades</li>
            <li>✓ ACCESO__08 - Plan recomendado (con lógica MVP)</li>
            <li>✓ ACCESO__09 - Creando espacio (progreso animado)</li>
            <li>✓ ACCESO__10 - Gate interno (bienvenida)</li>
          </ul>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-left">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Funcionalidades implementadas:</h3>
          <ul className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
            <li>• Navegación completa entre todas las pantallas</li>
            <li>• Validaciones UI en formularios</li>
            <li>• Lógica de recomendación de plan basada en criterios</li>
            <li>• Estados visuales de trial (activo, casi fin, expirado)</li>
            <li>• Modales de invitación y confirmación</li>
            <li>• Integración con OnboardingContext</li>
            <li>• Design system completo (ACCESO__)</li>
          </ul>
        </div>

        <ACCESO__Button
          onClick={handleClose}
          variant="primary"
          size="lg"
          fullWidth
        >
          OK - Continuar
        </ACCESO__Button>
      </div>
    </ACCESO__Modal>
  );
}
