import { ReactNode } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface KPICardProps {
  title: string;
  value: string | number;
  icon?: ReactNode;
  trend?: {
    value: string;
    isPositive: boolean;
  };
  subtitle?: string;
  color?: 'blue' | 'green' | 'red' | 'amber' | 'gray';
  onClick?: () => void;
}

export function KPICard({ title, value, icon, trend, subtitle, color = 'blue', onClick }: KPICardProps) {
  const colorClasses = {
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
    red: 'bg-red-100 text-red-600',
    amber: 'bg-amber-100 text-amber-600',
    gray: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
  };

  const Component = onClick ? 'button' : 'div';

  return (
    <Component
      onClick={onClick}
      className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 md:p-6 text-left w-full ${
        onClick ? 'hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm transition-all cursor-pointer' : ''
      }`}
    >
      <div className="flex items-start justify-between mb-3 md:mb-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">{title}</p>
        {icon && (
          <div className={`w-8 h-8 md:w-10 md:h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${colorClasses[color]}`}>
            {icon}
          </div>
        )}
      </div>
      <p className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100 mb-1 md:mb-2">{value}</p>
      {trend && (
        <div className="flex items-center gap-1">
          {trend.isPositive ? (
            <TrendingUp className="w-4 h-4 text-green-600" />
          ) : (
            <TrendingDown className="w-4 h-4 text-red-600" />
          )}
          <span className={`text-sm font-medium ${trend.isPositive ? 'text-green-600' : 'text-red-600'}`}>
            {trend.value}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:inline">vs mes anterior</span>
        </div>
      )}
      {subtitle && !trend && (
        <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
      )}
    </Component>
  );
}