import { ReactNode } from 'react';
import { Button } from '../ui/button';

interface SAAS__PageHeaderProps {
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: ReactNode;
  };
  breadcrumb?: {
    label: string;
    href?: string;
  }[];
}

export function SAAS__PageHeader({ title, description, action, breadcrumb }: SAAS__PageHeaderProps) {
  return (
    <div className="mb-8">
      {breadcrumb && breadcrumb.length > 0 && (
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-3">
          {breadcrumb.map((item, index) => (
            <div key={index} className="flex items-center gap-2">
              {item.href ? (
                <a href={item.href} className="hover:text-gray-900 transition-colors">
                  {item.label}
                </a>
              ) : (
                <span className={index === breadcrumb.length - 1 ? 'text-gray-900 dark:text-gray-100 font-medium' : ''}>
                  {item.label}
                </span>
              )}
              {index < breadcrumb.length - 1 && <span className="text-gray-400 dark:text-gray-500">/</span>}
            </div>
          ))}
        </div>
      )}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{title}</h1>
          {description && (
            <p className="mt-2 text-gray-600 dark:text-gray-400">{description}</p>
          )}
        </div>
        {action && (
          <Button onClick={action.onClick} className="bg-amber-600 hover:bg-amber-700">
            {action.icon}
            {action.label}
          </Button>
        )}
      </div>
    </div>
  );
}
