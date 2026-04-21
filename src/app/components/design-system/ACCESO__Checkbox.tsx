import { InputHTMLAttributes } from 'react';
import { Check } from 'lucide-react';

export interface ACCESO__CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
}

export function ACCESO__Checkbox({ label, className = '', ...props }: ACCESO__CheckboxProps) {
  return (
    <label className={`flex items-start gap-2 cursor-pointer group ${className}`}>
      <div className="relative flex items-center justify-center mt-0.5">
        <input
          type="checkbox"
          className="peer sr-only"
          {...props}
        />
        <div className="w-5 h-5 border-2 border-gray-300 rounded peer-checked:border-amber-500 peer-checked:bg-amber-500 transition-all peer-focus:ring-2 peer-focus:ring-amber-200">
          <Check className="w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100" />
        </div>
      </div>
      {label && (
        <span className="text-sm text-gray-700 dark:text-gray-300 select-none group-hover:text-gray-900">
          {label}
        </span>
      )}
    </label>
  );
}
