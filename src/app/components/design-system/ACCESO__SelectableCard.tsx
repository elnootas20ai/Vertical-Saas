import { Check } from 'lucide-react';
import { ReactNode } from 'react';

export interface ACCESO__SelectableCardProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  selected?: boolean;
  disabled?: boolean;
  compact?: boolean;
  onClick?: () => void;
}

export function ACCESO__SelectableCard({
  icon,
  title,
  description,
  selected = false,
  disabled = false,
  compact = false,
  onClick,
}: ACCESO__SelectableCardProps) {
  const pad = compact ? 'p-3' : 'p-6';
  const radius = compact ? 'rounded-lg' : 'rounded-xl';
  const checkPos = compact ? 'top-2 right-2 w-5 h-5' : 'top-3 right-3 w-6 h-6';
  const checkIcon = compact ? 'w-3 h-3' : 'w-4 h-4';

  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`
        relative ${pad} ${radius} border-2 transition-all text-left w-full h-full min-h-0
        ${selected
          ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/40 shadow-md'
          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      {selected && (
        <div
          className={`absolute ${checkPos} bg-amber-500 rounded-full flex items-center justify-center`}
        >
          <Check className={`${checkIcon} text-white`} />
        </div>
      )}
      {disabled && (
        <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-[10px] font-medium text-gray-600 dark:text-gray-400">
          Próximamente
        </div>
      )}
      {icon && <div className={compact ? 'mb-1.5' : 'mb-3'}>{icon}</div>}
      <h3
        className={`font-semibold leading-tight ${compact ? 'text-sm mb-0.5' : 'text-base mb-1'} ${
          selected ? 'text-gray-900 dark:text-gray-100' : 'text-gray-800 dark:text-gray-200'
        }`}
      >
        {title}
      </h3>
      {description && (
        <p
          className={`leading-snug ${compact ? 'text-xs' : 'text-sm'} ${
            selected ? 'text-gray-700 dark:text-gray-300' : 'text-gray-600 dark:text-gray-400'
          }`}
        >
          {description}
        </p>
      )}
    </button>
  );
}
