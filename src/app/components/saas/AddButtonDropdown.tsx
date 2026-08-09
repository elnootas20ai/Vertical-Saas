import { useState, useRef, useEffect } from 'react';
import { Plus, ChevronDown, Sparkles, Upload, Zap } from 'lucide-react';
import { VERTIAL_BTN_PRIMARY } from '../../lib/vertialUiTokens';

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
  /**
   * Si se omite, la opción "Crear con IA" no se muestra en el desplegable.
   * Útil para módulos en los que el alta IA no aporta valor (p. ej. centros de trabajo).
   */
  onAIAdd?: () => void;
  /**
   * Si se omite, la opción "Importar" no se muestra en el desplegable.
   */
  onImport?: () => void;
  quickAddLabel?: string;
  quickAddDesc?: string;
  aiAddLabel?: string;
  aiAddDesc?: string;
  importAddLabel?: string;
  importAddDesc?: string;
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
  importAddLabel = 'Importar',
  importAddDesc = 'Carga datos desde archivo CSV/Excel',
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
  ];
  if (onAIAdd) {
    options.push({
      id: 'ai',
      label: aiAddLabel,
      description: aiAddDesc,
      icon: <Sparkles className="w-4 h-4 text-violet-500" />,
      action: () => { onAIAdd(); setOpen(false); },
    });
  }
  if (onImport) {
    options.push({
      id: 'import',
      label: importAddLabel,
      description: importAddDesc,
      icon: <Upload className="w-4 h-4 text-blue-500" />,
      action: () => { onImport(); setOpen(false); },
    });
  }

  // Si solo queda la opción de alta rápida (sin IA ni importar), el desplegable
  // sobra: el botón dispara directamente la acción. Evita un menú con un único
  // item, que confunde más de lo que ayuda.
  const onlyQuick = options.length === 1;

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        onClick={() => {
          if (onlyQuick) {
            onQuickAdd();
            return;
          }
          setOpen(v => !v);
        }}
        className={`${VERTIAL_BTN_PRIMARY} !min-h-0 px-3 py-1.5 text-xs gap-1.5`}
      >
        <Plus className="w-4 h-4" />
        <span className="hidden sm:inline">{label}</span>
        {!onlyQuick && (
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        )}
      </button>

      {open && !onlyQuick && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-72 max-w-[min(18rem,calc(100vw-2rem))] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl overflow-hidden z-50">
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
