interface Pill {
  id: string;
  label: string;
  count?: number;
}

interface PillsProps {
  pills: Pill[];
  activePill: string;
  onChange: (pillId: string) => void;
}

export function Pills({ pills, activePill, onChange }: PillsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {pills.map((pill) => (
        <button
          key={pill.id}
          onClick={() => onChange(pill.id)}
          className={`px-4 py-2 rounded-full font-medium transition-colors ${
            activePill === pill.id
              ? 'bg-[#0f1419] text-white'
              : 'bg-white dark:bg-gray-800 border border-gray-300 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
          }`}
        >
          {pill.label}
          {pill.count !== undefined && (
            <span className="ml-2">{pill.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
