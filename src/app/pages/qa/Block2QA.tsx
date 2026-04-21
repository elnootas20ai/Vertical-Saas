import { QAChecklist, QAItem } from '../../components/design-system/QAChecklist';

const items: QAItem[] = [
  // Onboarding Flow
  {
    module: 'ACCESO__ Onboarding - BusinessType',
    feature: 'Stepper visible con paso actual',
    status: 'ok'
  },
  {
    module: 'ACCESO__ Onboarding - BusinessType',
    feature: 'Cards seleccionables: Compraventa (habilitada)',
    status: 'ok'
  },
  {
    module: 'ACCESO__ Onboarding - BusinessType',
    feature: 'Cards deshabilitadas: Taller, Otro (estado disabled)',
    status: 'ok'
  },
  {
    module: 'ACCESO__ Onboarding - BusinessType',
    feature: 'Botón "Continuar" → /auth/onboarding/company',
    status: 'ok'
  },
  {
    module: 'ACCESO__ Onboarding - Company',
    feature: 'Stepper paso 2 activo',
    status: 'ok'
  },
  {
    module: 'ACCESO__ Onboarding - Company',
    feature: 'Formulario: nombre, CIF, dirección, teléfono, email',
    status: 'ok'
  },
  {
    module: 'ACCESO__ Onboarding - Company',
    feature: 'Botones: "Atrás" → /auth/onboarding/business-type',
    status: 'ok'
  },
  {
    module: 'ACCESO__ Onboarding - Company',
    feature: 'Botones: "Continuar" → /auth/onboarding/structure',
    status: 'ok'
  },
  {
    module: 'ACCESO__ Onboarding - Structure',
    feature: 'Stepper paso 3 activo',
    status: 'ok'
  },
  {
    module: 'ACCESO__ Onboarding - Structure',
    feature: 'Campos numéricos: ubicaciones, empleados, vehículos mensuales',
    status: 'ok'
  },
  {
    module: 'ACCESO__ Onboarding - Structure',
    feature: 'Botones: "Atrás" → /auth/onboarding/company',
    status: 'ok'
  },
  {
    module: 'ACCESO__ Onboarding - Structure',
    feature: 'Botones: "Continuar" → /auth/onboarding/needs',
    status: 'ok'
  },
  {
    module: 'ACCESO__ Onboarding - Needs',
    feature: 'Stepper paso 4 activo',
    status: 'ok'
  },
  {
    module: 'ACCESO__ Onboarding - Needs',
    feature: 'Checkboxes múltiples seleccionables',
    status: 'ok'
  },
  {
    module: 'ACCESO__ Onboarding - Needs',
    feature: 'Botones: "Atrás" → /auth/onboarding/structure',
    status: 'ok'
  },
  {
    module: 'ACCESO__ Onboarding - Needs',
    feature: 'Botones: "Continuar" → /auth/onboarding/recommendation',
    status: 'ok'
  },
  {
    module: 'ACCESO__ Onboarding - Recommendation',
    feature: 'Muestra plan recomendado basado en estructura',
    status: 'ok'
  },
  {
    module: 'ACCESO__ Onboarding - Recommendation',
    feature: 'Cards de planes con features visibles',
    status: 'ok'
  },
  {
    module: 'ACCESO__ Onboarding - Recommendation',
    feature: 'Toggle anual/mensual funcional',
    status: 'ok'
  },
  {
    module: 'ACCESO__ Onboarding - Recommendation',
    feature: 'Botones: "Atrás" → /auth/onboarding/needs',
    status: 'ok'
  },
  {
    module: 'ACCESO__ Onboarding - Recommendation',
    feature: 'Botón "Empezar con [plan]" → /auth/onboarding/confirmation',
    status: 'ok'
  },
  {
    module: 'ACCESO__ Onboarding - Confirmation',
    feature: 'Animación de progreso con pasos',
    status: 'ok'
  },
  {
    module: 'ACCESO__ Onboarding - Confirmation',
    feature: 'Estados visuales: pendiente → activo → completado',
    status: 'ok'
  },
  {
    module: 'ACCESO__ Onboarding - Confirmation',
    feature: 'Redirección automática a /auth/gate después de 2.8s',
    status: 'ok'
  },
  {
    module: 'ACCESO__ Onboarding - Confirmation',
    feature: 'Botón manual "Ir al panel" → /auth/gate (cuando completo)',
    status: 'ok'
  }
];

export function Block2QA() {
  return (
    <QAChecklist 
      blockName="Bloque 2: Onboarding"
      items={items}
      onComplete={() => {
        window.location.href = '/qa/block-3';
      }}
    />
  );
}
