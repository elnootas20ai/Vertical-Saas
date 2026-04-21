import { LayoutGrid, List } from 'lucide-react';

type ViewMode = 'cards' | 'table';

interface Props {
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
}

export function ViewToggle({ view, onViewChange }: Props) {
  return (
    <div className="inline-flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
      <button
        onClick={() => onViewChange('cards')}
        type="button"
        className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
          view === 'cards'
            ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
        }`}
      >
        <LayoutGrid className="w-4 h-4" />
        <span className="hidden md:inline">Tarjetas</span>
      </button>
      <button
        onClick={() => onViewChange('table')}
        type="button"
        className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
          view === 'table'
            ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
        }`}
      >
        <List className="w-4 h-4" />
        <span className="hidden md:inline">Tabla</span>
      </button>
    </div>
  );
}