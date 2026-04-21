import { LayoutGrid, Table } from 'lucide-react';

interface Props {
  view: 'cards' | 'table';
  onViewChange: (view: 'cards' | 'table') => void;
}

export function SAAS__ViewToggle({ view, onViewChange }: Props) {
  return (
    <div className="inline-flex rounded-lg border-2 border-gray-200 dark:border-gray-700 p-1 bg-white dark:bg-gray-800">
      <button
        onClick={() => onViewChange('cards')}
        className={`
          px-3 py-1.5 rounded-md flex items-center gap-2 text-sm font-medium transition-all
          ${view === 'cards' 
            ? 'bg-gray-900 text-white' 
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
          }
        `}
      >
        <LayoutGrid className="w-4 h-4" />
        Tarjetas
      </button>
      <button
        onClick={() => onViewChange('table')}
        className={`
          px-3 py-1.5 rounded-md flex items-center gap-2 text-sm font-medium transition-all
          ${view === 'table' 
            ? 'bg-gray-900 text-white' 
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
          }
        `}
      >
        <Table className="w-4 h-4" />
        Tabla
      </button>
    </div>
  );
}
