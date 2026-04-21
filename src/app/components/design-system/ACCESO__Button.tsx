import { ButtonHTMLAttributes, forwardRef } from 'react';
import { Loader2, ArrowRight, ArrowLeft } from 'lucide-react';

export interface ACCESO__ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  fullWidth?: boolean;
  icon?: 'next' | 'back' | 'none';
}

export const ACCESO__Button = forwardRef<HTMLButtonElement, ACCESO__ButtonProps>(
  ({ 
    variant = 'primary', 
    size = 'md', 
    loading = false, 
    fullWidth = false,
    icon = 'none',
    className = '', 
    children, 
    disabled,
    ...props 
  }, ref) => {
    const baseStyles = 'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';
    
    const variantStyles = {
      primary: 'bg-[#0f1419] text-white hover:bg-[#1a1f26] focus:ring-gray-900',
      secondary: 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-200 focus:ring-gray-500',
      ghost: 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 focus:ring-gray-500',
      outline: 'border-2 border-gray-300 text-gray-900 dark:text-gray-100 hover:border-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 focus:ring-gray-500'
    };
    
    const sizeStyles = {
      sm: 'px-4 py-2 text-sm',
      md: 'px-6 py-3 text-base',
      lg: 'px-8 py-4 text-lg'
    };
    
    const widthStyles = fullWidth ? 'w-full' : '';
    
    return (
      <button
        ref={ref}
        className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${widthStyles} ${className}`}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        {!loading && icon === 'back' && <ArrowLeft className="w-4 h-4" />}
        {children}
        {!loading && icon === 'next' && <ArrowRight className="w-4 h-4" />}
      </button>
    );
  }
);

ACCESO__Button.displayName = 'ACCESO__Button';
