import { X, HelpCircle, MessageCircle, Mail, FileText, ExternalLink, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useRestartTour } from '../saas/OnboardingTour';
import { useActivationChecklist } from '../../context/ActivationChecklistContext';
import { useModalClose } from '../../hooks/useModalClose';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function SAAS__HelpModal({ isOpen, onClose }: Props) {
  const navigate = useNavigate();
  const restartTour = useRestartTour();
  const { restore: restoreActivationGuide, completionPct, totalSteps } = useActivationChecklist();

  useModalClose(isOpen, onClose);

  if (!isOpen) return null;

  const helpOptions = [
    {
      icon: FileText,
      label: 'Centro de ayuda y FAQ',
      description: 'Encuentra respuestas a preguntas frecuentes',
      link: '/saas/help#faq',
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
    {
      icon: MessageCircle,
      label: 'Chat de soporte',
      description: 'Habla con nuestro equipo en tiempo real',
      link: '/saas/help#soporte',
      color: 'text-green-600',
      bgColor: 'bg-green-100',
    },
    {
      icon: Mail,
      label: 'Contacto por email',
      description: 'soporte@vertialapp.com',
      link: '/saas/help#contacto',
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
    },
  ];

  const quickLinks = [
    { label: 'Primeros pasos', link: '/saas/help#primeros-pasos' },
    { label: 'Gestión de vehículos', link: '/saas/help#vehiculos' },
    { label: 'Crear una operación', link: '/saas/help#operaciones' },
    { label: 'Documentos y plantillas', link: '/saas/help#documentos' },
    { label: 'Integración ANCOVE', link: '/saas/help#ancove' },
    { label: 'Facturación', link: '/saas/help#facturacion' },
  ];

  const handleNavigate = (link: string) => {
    onClose();
    navigate(link);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Centro de ayuda</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Welcome Message */}
          <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl">
            <h3 className="font-bold text-blue-900 mb-2">¿Necesitas ayuda?</h3>
            <p className="text-sm text-blue-800">
              Estamos aquí para ayudarte. Elige la opción que mejor se adapte a tus necesidades.
            </p>
          </div>

          {/* Help Options */}
          <div>
            <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-4">Opciones de soporte</h3>
            <div className="space-y-3">
              {helpOptions.map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.label}
                    type="button"
                    onClick={() => handleNavigate(option.link)}
                    className="flex items-start gap-4 p-4 border-2 border-gray-200 dark:border-gray-700 hover:border-blue-500 hover:bg-blue-50 rounded-xl transition-all group"
                  >
                    <div className={`w-12 h-12 ${option.bgColor} rounded-xl flex items-center justify-center flex-shrink-0`}>
                      <Icon className={`w-6 h-6 ${option.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900 dark:text-gray-100 mb-1 group-hover:text-blue-600 transition-colors flex items-center gap-2">
                        {option.label}
                        <ExternalLink className="w-4 h-4 text-gray-400 dark:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        {option.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-4">Guías rápidas</h3>
            <div className="grid grid-cols-2 gap-3">
              {quickLinks.map((link) => (
                <button
                  key={link.label}
                  type="button"
                  onClick={() => handleNavigate(link.link)}
                  className="px-4 py-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 transition-all text-center"
                >
                  {link.label}
                </button>
              ))}
            </div>
          </div>

          {/* Extra tools */}
          <div>
            <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-3">Herramientas</h3>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  if (restartTour()) {
                    toast.success('Tour abierto — paso 1 de 7');
                  } else {
                    toast.error(
                      'No se pudo abrir el tour. Comprueba que tienes una empresa seleccionada arriba.',
                    );
                  }
                }}
                className="flex items-center gap-3 w-full px-4 py-3 bg-violet-50 dark:bg-violet-950/30 hover:bg-violet-100 dark:hover:bg-violet-900/30 border border-violet-200 dark:border-violet-800/50 hover:border-violet-300 dark:hover:border-violet-700/50 rounded-xl transition-all"
              >
                <div className="w-9 h-9 bg-violet-500 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-semibold text-violet-900 dark:text-violet-200">Tour interactivo</p>
                  <p className="text-xs text-violet-600 dark:text-violet-400">
                    Ventanas paso a paso (tienda, marca, catálogo…). Distinto del «Alta delivery» del menú.
                  </p>
                </div>
              </button>
              {totalSteps > 0 && completionPct >= 100 && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    restoreActivationGuide();
                    toast.message('Checklist «Alta delivery» visible en el menú lateral');
                  }}
                  className="flex items-center gap-3 w-full px-4 py-3 bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-900/30 border border-amber-200 dark:border-amber-800/50 rounded-xl transition-all"
                >
                  <div className="w-9 h-9 bg-amber-500 rounded-xl flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Ver checklist del alta</p>
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      Ya tienes {totalSteps}/{totalSteps} pasos hechos — repaso en el menú lateral.
                    </p>
                  </div>
                </button>
              )}
            </div>
          </div>

          {/* Version Info */}
          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
              <div>Vertial v1.0.0</div>
              <div>© {new Date().getFullYear()} Vertial</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
