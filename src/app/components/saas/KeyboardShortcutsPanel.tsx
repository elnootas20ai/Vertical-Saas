import { useEffect } from 'react';
import { X, Keyboard, Command } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

interface Shortcut {
  keys: string[];
  description: string;
}

interface ShortcutGroup {
  title: string;
  shortcuts: Shortcut[];
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? '⌘' : 'Ctrl';

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Búsqueda y navegación',
    shortcuts: [
      { keys: [mod, 'K'], description: 'Búsqueda global' },
      { keys: ['?'], description: 'Panel de atajos de teclado' },
      { keys: ['G', 'D'], description: 'Ir a Dashboard' },
      { keys: ['G', 'V'], description: 'Ir a Vehículos' },
      { keys: ['G', 'C'], description: 'Ir a Clientes' },
      { keys: ['G', 'S'], description: 'Ir a Ventas' },
      { keys: ['G', 'P'], description: 'Ir a Pipeline' },
      { keys: ['G', 'F'], description: 'Ir a Finanzas' },
      { keys: ['G', 'R'], description: 'Ir a Informes' },
    ],
  },
  {
    title: 'Creación rápida',
    shortcuts: [
      { keys: ['N', 'V'], description: 'Nuevo vehículo' },
      { keys: ['N', 'L'], description: 'Nuevo lead' },
      { keys: ['N', 'C'], description: 'Nuevo cliente' },
      { keys: ['N', 'S'], description: 'Nueva venta' },
    ],
  },
  {
    title: 'General',
    shortcuts: [
      { keys: ['Esc'], description: 'Cerrar modal / panel' },
      { keys: [mod, '/'], description: 'Mostrar atajos' },
    ],
  },
];

export function KeyboardShortcutsPanel({ isOpen, onClose }: Props) {
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gray-900 dark:bg-gray-100 rounded-lg flex items-center justify-center">
              <Keyboard className="w-4 h-4 text-white dark:text-gray-900" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Atajos de teclado</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">Acciones rápidas desde cualquier pantalla</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Shortcut groups */}
        <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3">
                {group.title}
              </p>
              <div className="space-y-1">
                {group.shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.description}
                    className="flex items-center justify-between py-2 px-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <span className="text-sm text-gray-700 dark:text-gray-300">{shortcut.description}</span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, idx) => (
                        <span key={idx} className="flex items-center gap-1">
                          <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-mono font-semibold text-gray-700 dark:text-gray-300 leading-none">
                            {key}
                          </kbd>
                          {idx < shortcut.keys.length - 1 && (
                            <span className="text-[10px] text-gray-400 dark:text-gray-500 font-mono">+</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 dark:border-gray-800 px-6 py-3 bg-gray-50 dark:bg-gray-950">
          <p className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1.5">
            <Command className="w-3 h-3" />
            Pulsa <kbd className="px-1.5 py-0.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-[10px] font-mono">?</kbd> en cualquier pantalla para mostrar este panel
          </p>
        </div>
      </div>
    </div>
  );
}
