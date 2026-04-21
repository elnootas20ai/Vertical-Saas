interface Tab {
  id: string;
  label: string;
  count?: number;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (tabId: string) => void;
}

export function Tabs({ tabs, activeTab, onChange }: TabsProps) {
  return (
    <div
      className="flex bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-x-auto [&::-webkit-scrollbar]:hidden"
      style={{ scrollbarWidth: 'none' }}
    >
      {tabs.map((tab, i) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`relative flex-shrink-0 flex items-center gap-2 px-5 py-3.5 text-sm font-semibold transition-colors whitespace-nowrap ${
              isActive ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600'
            } ${i !== 0 ? 'border-l border-gray-100 dark:border-gray-800' : ''}`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                isActive ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
              }`}>
                {tab.count}
              </span>
            )}
            {isActive && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500 rounded-t-full" />
            )}
          </button>
        );
      })}
    </div>
  );
}