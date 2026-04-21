import { Check } from 'lucide-react';
import { ReactNode } from 'react';

export interface ACCESO__SelectableCardProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

export function ACCESO__SelectableCard({ 
  icon, 
  title, 
  description, 
  selected = false, 
  disabled = false,
  onClick 
}: ACCESO__SelectableCardProps) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`
        relative p-6 rounded-xl border-2 transition-all text-left w-full
        ${selected 
          ? 'border-amber-500 bg-amber-50 shadow-md' 
          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm'
        }
        ${disabled 
          ? 'opacity-50 cursor-not-allowed' 
          : 'cursor-pointer'
        }
      `}
    >
      {selected && (
        <div className="absolute top-3 right-3 w-6 h-6 bg-amber-500 rounded-full flex items-center justify-center">
          <Check className="w-4 h-4 text-white" />
        </div>
      )}
      {disabled && (
        <div className="absolute top-3 right-3 px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs font-medium text-gray-600 dark:text-gray-400">
          Próximamente
        </div>
      )}
      {icon && (
        <div className="mb-3">
          {icon}
        </div>
      )}
      <h3 className={`font-semibold mb-1 ${selected ? 'text-gray-900 dark:text-gray-100' : 'text-gray-800 dark:text-gray-200'}`}>
        {title}
      </h3>
      {description && (
        <p className={`text-sm ${selected ? 'text-gray-700 dark:text-gray-300' : 'text-gray-600 dark:text-gray-400'}`}>
          {description}
        </p>
      )}
    </button>
  );
}
