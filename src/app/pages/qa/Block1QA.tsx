import { QAChecklist, QAItem } from '../../components/design-system/QAChecklist';

const items: QAItem[] = [
  // Landing Page
  {
    module: 'WEB__ Landing - Header',
    feature: 'Logo clickeable que vuelve a home',
    status: 'ok'
  },
  {
    module: 'WEB__ Landing - Header',
    feature: 'Navegación: Módulos, Cómo funciona, Planes, FAQ, Contacto (scroll)',
    status: 'ok'
  },
  {
    module: 'WEB__ Landing - Header',
    feature: 'Botones: "Iniciar sesión" → /auth/login',
    status: 'ok'
  },
  {
    module: 'WEB__ Landing - Header',
    feature: 'Botones: "Ver planes" (scroll to planes)',
    status: 'ok'
  },
  {
    module: 'WEB__ Landing - Header',
    feature: 'Botones: "Registrarse" → /auth/entry',
    status: 'ok'
  },
  {
    module: 'WEB__ Landing - Hero',
    feature: 'CTA Principal: "Registrarse" → /auth/entry',
    status: 'ok'
  },
  {
    module: 'WEB__ Landing - Hero',
    feature: 'CTA Secundario: "Hablar con ventas" (scroll to contacto)',
    status: 'ok'
  },
  {
    module: 'WEB__ Landing - Planes',
    feature: 'Botones "Registrarse" en cada plan → /auth/entry',
    status: 'ok'
  },
  {
    module: 'WEB__ Landing - Footer',
    feature: 'Todos los links del footer interactivos',
    status: 'ok',
    notes: 'Links a redes sociales, legal, etc.'
  },
  
  // Auth Flow
  {
    module: 'ACCESO__ Entry',
    feature: 'Card "Iniciar sesión" → /auth/login',
    status: 'ok'
  },
  {
    module: 'ACCESO__ Entry',
    feature: 'Card "Empezar prueba gratis" → /auth/register',
    status: 'ok'
  },
  {
    module: 'ACCESO__ Entry',
    feature: 'Link "Volver a la web" → /',
    status: 'ok'
  },
  {
    module: 'ACCESO__ Login',
    feature: 'Formulario funcional con validación',
    status: 'ok'
  },
  {
    module: 'ACCESO__ Login',
    feature: 'Link "He olvidado mi contraseña" → /auth/recover',
    status: 'ok'
  },
  {
    module: 'ACCESO__ Login',
    feature: 'Botón "Acceder" → /auth/gate',
    status: 'ok'
  },
  {
    module: 'ACCESO__ Login',
    feature: 'Botón "Continuar con Google" → /saas/dashboard (acceso directo)',
    status: 'ok'
  },
  {
    module: 'ACCESO__ Login',
    feature: 'Link "Crear cuenta" → /auth/register',
    status: 'ok'
  },
  {
    module: 'ACCESO__ Login',
    feature: 'Link "Volver" → /auth/entry',
    status: 'ok'
  },
  {
    module: 'ACCESO__ Register',
    feature: 'Formulario completo con validación',
    status: 'ok'
  },
  {
    module: 'ACCESO__ Register',
    feature: 'Validación de contraseñas coincidentes',
    status: 'ok'
  },
  {
    module: 'ACCESO__ Register',
    feature: 'Checkbox términos y condiciones obligatorio',
    status: 'ok'
  },
  {
    module: 'ACCESO__ Register',
    feature: 'Botón "Crear cuenta" → /auth/onboarding/business-type',
    status: 'ok'
  },
  {
    module: 'ACCESO__ Register',
    feature: 'Link "Iniciar sesión" → /auth/login',
    status: 'ok'
  },
  {
    module: 'ACCESO__ Register',
    feature: 'Link "Volver" → /auth/entry',
    status: 'ok'
  },
  {
    module: 'ACCESO__ Recover',
    feature: 'Formulario de recuperación funcional',
    status: 'ok'
  },
  {
    module: 'ACCESO__ Recover',
    feature: 'Estado "Email enviado" con confirmación visual',
    status: 'ok'
  },
  {
    module: 'ACCESO__ Recover',
    feature: 'Link "Volver al inicio de sesión" → /auth/login',
    status: 'ok'
  },
  {
    module: 'ACCESO__ Gate',
    feature: 'Botón principal "Entrar a [empresa]" → /saas/dashboard',
    status: 'ok'
  },
  {
    module: 'ACCESO__ Gate',
    feature: 'Botón "Invitar a un trabajador" (abre modal)',
    status: 'ok'
  },
  {
    module: 'ACCESO__ Gate',
    feature: 'Modal invitación con formulario funcional',
    status: 'ok'
  },
  {
    module: 'ACCESO__ Gate',
    feature: 'Link "Cerrar sesión" → /',
    status: 'ok'
  }
];

export function Block1QA() {
  return (
    <QAChecklist 
      blockName="Bloque 1: Landing + Auth"
      items={items}
      onComplete={() => {
        window.location.href = '/qa/block-2';
      }}
    />
  );
}
