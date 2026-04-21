import { ReactNode } from 'react';
import { Check } from 'lucide-react';

interface SelectableCardProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

export function SelectableCard({
  icon,
  title,
  description,
  selected = false,
  disabled = false,
  onClick
}: SelectableCardProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative w-full p-6 rounded-xl border-2 transition-all text-left ${
        disabled
          ? 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 opacity-60 cursor-not-allowed'
          : selected
          ? 'border-[#0f1419] bg-gray-50 dark:bg-gray-800'
          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800'
      }`}
    >
      {selected && !disabled && (
        <div className="absolute top-4 right-4 w-6 h-6 bg-[#0f1419] rounded-full flex items-center justify-center">
          <Check className="w-4 h-4 text-white" />
        </div>
      )}
      
      {icon && <div className="mb-3">{icon}</div>}
      
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">{title}</h3>
      
      {description && (
        <p className="text-sm text-gray-600 dark:text-gray-400">{description}</p>
      )}
      
      {disabled && (
        <span className="inline-block mt-2 text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
          Próximamente
        </span>
      )}
    </button>
  );
}
