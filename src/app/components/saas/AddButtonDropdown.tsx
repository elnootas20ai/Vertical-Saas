import { useState, useRef, useEffect } from 'react';
import { Plus, ChevronDown, Sparkles, Upload, Zap } from 'lucide-react';

export interface AddButtonOption {
  id: 'quick' | 'ai' | 'import';
  label: string;
  description: string;
  icon: React.ReactNode;
  action: () => void;
}

interface AddButtonDropdownProps {
  label?: string;
  onQuickAdd: () => void;
  onAIAdd: () => void;
  onImport: () => void;
  quickAddLabel?: string;
  quickAddDesc?: string;
  aiAddLabel?: string;
  aiAddDesc?: string;
}

export function AddButtonDropdown({
  label = 'Añadir',
  onQuickAdd,
  onAIAdd,
  onImport,
  quickAddLabel = 'Alta rápida',
  quickAddDesc = 'Formulario del módulo',
  aiAddLabel = 'Crear con IA',
  aiAddDesc = 'Describe en texto libre y la IA lo organiza',
}: AddButtonDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const options: AddButtonOption[] = [
    {
      id: 'quick',
      label: quickAddLabel,
      description: quickAddDesc,
      icon: <Zap className="w-4 h-4 text-amber-500" />,
      action: () => { onQuickAdd(); setOpen(false); },
    },
    {
      id: 'ai',
      label: aiAddLabel,
      description: aiAddDesc,
      icon: <Sparkles className="w-4 h-4 text-violet-500" />,
      action: () => { onAIAdd(); setOpen(false); },
    },
    {
      id: 'import',
      label: 'Importar',
      description: 'Carga datos desde archivo CSV/Excel',
      icon: <Upload className="w-4 h-4 text-blue-500" />,
      action: () => { onImport(); setOpen(false); },
    },
  ];

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 px-4 py-2.5 bg-gray-900 hover:bg-black dark:bg-gray-100 dark:hover:bg-white dark:text-gray-900 text-white rounded-xl text-sm font-medium transition-colors"
      >
        <Plus className="w-4 h-4" />
        <span className="hidden sm:inline">{label}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl overflow-hidden z-20">
            {options.map((opt, i) => (
              <div key={opt.id}>
                <button
                  onClick={opt.action}
                  className="w-full px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800 text-left transition-colors flex items-start gap-3"
                >
                  <div className="mt-0.5 flex-shrink-0">{opt.icon}</div>
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{opt.label}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{opt.description}</p>
                  </div>
                </button>
                {i < options.length - 1 && <div className="border-t border-gray-100 dark:border-gray-800" />}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
