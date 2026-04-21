import { ReactNode } from 'react';
import { CheckCircle, XCircle, Power } from 'lucide-react';
import { ACCESO__Modal } from '../design-system/ACCESO__Modal';
import { ACCESO__Button } from '../design-system/ACCESO__Button';

interface ModalModuloProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
  icon: ReactNode;
  iconBgColor: string;
  activated: boolean;
  onToggle: () => void;
  stats?: { label: string; value: string | number }[];
  features?: string[];
}

export function ModalModulo({
  isOpen,
  onClose,
  title,
  description,
  icon,
  iconBgColor,
  activated,
  onToggle,
  stats,
  features,
}: ModalModuloProps) {
  return (
    <ACCESO__Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="lg">
      <div className="space-y-6">
        {/* Header con icono y estado */}
        <div className="flex items-start gap-4">
          <div className={`w-14 h-14 ${iconBgColor} rounded-2xl flex items-center justify-center shrink-0`}>
            {icon}
          </div>
          <div className="flex-1">
            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{description}</p>
            <div className="flex items-center gap-2 mt-3">
              {activated ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-sm font-semibold rounded-full border border-emerald-200 dark:border-emerald-700">
                  <CheckCircle className="w-4 h-4" />
                  Activado
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-sm font-semibold rounded-full border border-gray-200 dark:border-gray-600">
                  <XCircle className="w-4 h-4" />
                  Desactivado
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Estadísticas */}
        {stats && stats.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="p-3 bg-gray-50 dark:bg-gray-700 rounded-xl border border-gray-100 dark:border-gray-600 text-center"
              >
                <div className="text-xl font-bold text-gray-900 dark:text-gray-100">{stat.value}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{stat.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Funcionalidades incluidas */}
        {features && features.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Funcionalidades incluidas</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {features.map((feature) => (
                <div
                  key={feature}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-gray-700 border border-gray-100 dark:border-gray-600"
                >
                  <CheckCircle className={`w-4 h-4 shrink-0 ${activated ? 'text-emerald-500' : 'text-gray-300 dark:text-gray-500'}`} />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{feature}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Toggle + cerrar */}
        <div className="flex gap-3 pt-2">
          <ACCESO__Button
            type="button"
            onClick={onClose}
            variant="outline"
            fullWidth
          >
            Cerrar
          </ACCESO__Button>
          <ACCESO__Button
            type="button"
            onClick={onToggle}
            variant="primary"
            fullWidth
          >
            <Power className="w-4 h-4" />
            {activated ? 'Desactivar módulo' : 'Activar módulo'}
          </ACCESO__Button>
        </div>
      </div>
    </ACCESO__Modal>
  );
}
