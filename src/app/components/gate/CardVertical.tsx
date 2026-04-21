import { ArrowRight, Lock } from 'lucide-react';

interface CardVerticalProps {
  icon: string;
  name: string;
  description: string;
  status: 'available' | 'coming-soon';
  onEnter?: () => void;
  onComingSoon?: () => void;
}

export function CardVertical({ icon, name, description, status, onEnter, onComingSoon }: CardVerticalProps) {
  const isAvailable = status === 'available';

  return (
    <div
      className={`p-6 border-2 rounded-2xl transition-all ${
        isAvailable
          ? 'border-gray-200 dark:border-gray-700 hover:border-emerald-500 hover:shadow-md bg-white dark:bg-gray-800'
          : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800'
      }`}
    >
      <div className="flex items-start gap-4">
        <div
          className={`text-4xl flex-shrink-0 ${
            isAvailable ? 'opacity-100' : 'opacity-40 grayscale'
          }`}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 mb-2">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{name}</h3>
            {isAvailable ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full flex-shrink-0">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                Disponible
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-xs font-medium rounded-full flex-shrink-0">
                <Lock className="w-3 h-3" />
                Próximamente
              </span>
            )}
          </div>
          <p className={`text-sm mb-4 ${isAvailable ? 'text-gray-600 dark:text-gray-400' : 'text-gray-500'}`}>
            {description}
          </p>
          {isAvailable ? (
            <button
              onClick={onEnter}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl transition-colors font-medium"
            >
              Entrar
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={onComingSoon}
              className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 rounded-xl hover:border-gray-300 dark:hover:border-gray-600 transition-colors font-medium cursor-pointer"
            >
              Próximamente
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
