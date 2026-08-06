import { Clock, AlertTriangle, XCircle } from 'lucide-react';

export interface ACCESO__TrialBannerProps {
  status: 'trial_activo' | 'trial_casi_fin' | 'trial_expirado';
  daysRemaining: number;
  onChoosePlan?: () => void;
}

export function ACCESO__TrialBanner({ status, daysRemaining, onChoosePlan }: ACCESO__TrialBannerProps) {
  const configs = {
    trial_activo: {
      icon: Clock,
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      iconColor: 'text-blue-600',
      textColor: 'text-blue-900',
      message: `Te quedan ${daysRemaining} días de activación`,
      showCta: false
    },
    trial_casi_fin: {
      icon: AlertTriangle,
      bgColor: 'bg-amber-50',
      borderColor: 'border-amber-300',
      iconColor: 'text-amber-600',
      textColor: 'text-amber-900',
      message: `¡Solo te quedan ${daysRemaining} días de activación!`,
      showCta: true,
      ctaText: 'Elegir plan'
    },
    trial_expirado: {
      icon: XCircle,
      bgColor: 'bg-red-50',
      borderColor: 'border-red-300',
      iconColor: 'text-red-600',
      textColor: 'text-red-900',
      message: 'Tu periodo de activación ha finalizado',
      showCta: true,
      ctaText: 'Activar plan'
    }
  };

  const config = configs[status];
  const Icon = config.icon;

  return (
    <div className={`${config.bgColor} border ${config.borderColor} rounded-lg p-4 flex items-center gap-3`}>
      <div className={`flex-shrink-0 ${config.iconColor}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div className="flex-1">
        <p className={`font-medium ${config.textColor}`}>
          {config.message}
        </p>
      </div>
      {config.showCta && onChoosePlan && (
        <button
          onClick={onChoosePlan}
          className={`
            px-4 py-2 rounded-lg font-medium transition-colors
            ${status === 'trial_expirado' 
              ? 'bg-red-600 text-white hover:bg-red-700' 
              : 'bg-amber-600 text-white hover:bg-amber-700'
            }
          `}
        >
          {config.ctaText}
        </button>
      )}
    </div>
  );
}
