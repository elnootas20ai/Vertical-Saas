import { ReactNode } from 'react';

interface ModuleCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  features: string;
}

export function ModuleCard({ icon, title, description, features }: ModuleCardProps) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 hover:shadow-md transition-shadow">
      <div className="w-12 h-12 bg-[#0f1419] rounded-lg flex items-center justify-center mb-4">
        {icon}
      </div>
      <h3 className="text-xl font-semibold mb-2">{title}</h3>
      <p className="text-gray-600 dark:text-gray-400 mb-3">{description}</p>
      <p className="text-sm text-gray-500 dark:text-gray-400">{features}</p>
    </div>
  );
}
