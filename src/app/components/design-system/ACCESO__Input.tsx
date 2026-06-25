import { InputHTMLAttributes, forwardRef } from 'react';
import { AlertCircle } from 'lucide-react';

export interface ACCESO__InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  icon?: React.ReactNode;
  /** Contenido a la derecha del campo (p. ej. botón mostrar contraseña). Añade padding al input. */
  suffix?: React.ReactNode;
}

export const ACCESO__Input = forwardRef<HTMLInputElement, ACCESO__InputProps>(
  ({ label, error, helperText, icon, suffix, className = '', ...props }, ref) => {
    const hasSuffix = Boolean(suffix);
    return (
      <div className="w-full min-w-0">
        {label && (
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            {label}
          </label>
        )}
        <div className="relative min-w-0">
          {icon && (
            <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            className={`
              w-full min-w-0 box-border py-2.5 text-sm rounded-lg transition-all
              bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100
              placeholder:text-gray-400 dark:placeholder:text-gray-500
              ${icon ? 'pl-9 pr-3' : 'px-3.5'}
              ${hasSuffix ? '!pr-10' : ''}
              ${error 
                ? 'border-red-300 focus:border-red-500 focus:ring-red-500' 
                : 'border-gray-300 dark:border-gray-600 focus:border-amber-500 focus:ring-amber-500'
              }
              border focus:outline-none focus:ring-2 focus:ring-offset-0
              disabled:bg-gray-50 disabled:cursor-not-allowed dark:disabled:bg-gray-800
              ${className}
            `}
            {...props}
          />
          {hasSuffix && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center text-gray-400 dark:text-gray-500">
              {suffix}
            </div>
          )}
          {error && !hasSuffix && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-red-500">
              <AlertCircle className="w-5 h-5" />
            </div>
          )}
        </div>
        {error && (
          <p className="mt-1.5 text-sm text-red-600">{error}</p>
        )}
        {helperText && !error && (
          <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">{helperText}</p>
        )}
      </div>
    );
  }
);

ACCESO__Input.displayName = 'ACCESO__Input';
