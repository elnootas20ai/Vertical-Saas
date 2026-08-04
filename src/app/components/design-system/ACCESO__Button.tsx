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
      primary: 'bg-[var(--v-blue,#2563eb)] text-white hover:bg-[#1d4ed8] focus:ring-blue-500 shadow-sm shadow-blue-600/20',
      secondary: 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700 focus:ring-slate-500',
      ghost: 'text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-950/30 focus:ring-blue-500',
      outline: 'border-2 border-slate-300 text-slate-900 dark:text-slate-100 hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 focus:ring-blue-500'
    };
    
    const sizeStyles = {
      sm: 'px-4 py-2 text-sm',
      md: 'px-6 py-3 text-base',
      lg: 'px-8 py-4 text-lg'
    };
    
    const widthStyles = fullWidth ? 'w-full' : '';
    
    const iconSize = size === 'lg' ? 'w-5 h-5' : 'w-4 h-4';

    return (
      <button
        ref={ref}
        className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${widthStyles} ${className}`}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <Loader2 className={`${iconSize} animate-spin`} />}
        {!loading && icon === 'back' && <ArrowLeft className={iconSize} />}
        {children}
        {!loading && icon === 'next' && <ArrowRight className={iconSize} />}
      </button>
    );
  }
);

ACCESO__Button.displayName = 'ACCESO__Button';
