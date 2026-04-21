import { LucideIcon } from 'lucide-react';

interface QuickAction {
  id: string;
  icon: LucideIcon;
  label: string;
  description: string;
  onClick: () => void;
  color: string;
}

interface QuickActionsGridProps {
  actions: QuickAction[];
}

export function QuickActionsGrid({ actions }: QuickActionsGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <button
            key={action.id}
            onClick={action.onClick}
            className="p-4 border-2 border-gray-200 dark:border-gray-700 rounded-2xl hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-md transition-all text-left group bg-white dark:bg-gray-800"
          >
            <div className="flex items-start gap-3">
              <div
                className={`w-10 h-10 ${action.color} rounded-xl flex items-center justify-center flex-shrink-0`}
              >
                <Icon className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-0.5 group-hover:text-gray-700 transition-colors">
                  {action.label}
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">{action.description}</p>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
