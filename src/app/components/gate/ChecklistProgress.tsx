import { Check, ChevronRight } from 'lucide-react';

interface ChecklistItem {
  id: string;
  label: string;
  completed: boolean;
  onClick: () => void;
}

interface ChecklistProgressProps {
  items: ChecklistItem[];
}

export function ChecklistProgress({ items }: ChecklistProgressProps) {
  const completedCount = items.filter((item) => item.completed).length;
  const totalCount = items.length;
  const progressPercentage = (completedCount / totalCount) * 100;

  return (
    <div className="p-6 border-2 border-gray-200 dark:border-gray-700 rounded-2xl bg-white dark:bg-gray-800">
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Empieza en 5 minutos</h3>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {completedCount} de {totalCount}
          </span>
        </div>
        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 transition-all duration-300"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={item.onClick}
            className="w-full flex items-center gap-3 p-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all text-left group"
          >
            <div
              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                item.completed
                  ? 'bg-emerald-500 border-emerald-500'
                  : 'border-gray-300 group-hover:border-gray-400'
              }`}
            >
              {item.completed && <Check className="w-3 h-3 text-white" />}
            </div>
            <span
              className={`flex-1 text-sm ${
                item.completed ? 'text-gray-500 dark:text-gray-400 line-through' : 'text-gray-700 dark:text-gray-300 font-medium'
              }`}
            >
              {item.label}
            </span>
            <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500 group-hover:text-gray-600 transition-colors flex-shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}
