import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, ChevronDown, Sparkles, Upload, Zap, ClipboardList } from 'lucide-react';
import { VERTIAL_BTN_PRIMARY } from '../../lib/vertialUiTokens';

export interface AddButtonOption {
  id: 'quick' | 'ai' | 'import' | 'purchase';
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
  /** Última opción: lista de la compra / pedido a proveedor. */
  onPurchaseList?: () => void;
  quickAddLabel?: string;
  quickAddDesc?: string;
  aiAddLabel?: string;
  aiAddDesc?: string;
  importAddLabel?: string;
  importAddDesc?: string;
  purchaseListLabel?: string;
  purchaseListDesc?: string;
}

const MENU_WIDTH = 288;

export function AddButtonDropdown({
  label = 'Añadir',
  onQuickAdd,
  onAIAdd,
  onImport,
  onPurchaseList,
  quickAddLabel = 'Alta rápida',
  quickAddDesc = 'Formulario del módulo',
  aiAddLabel = 'Crear con IA',
  aiAddDesc = 'Describe en texto libre y la IA lo organiza',
  importAddLabel = 'Importar',
  importAddDesc = 'Carga datos desde archivo CSV/Excel',
  purchaseListLabel = 'Lista de la compra',
  purchaseListDesc = 'Pedido a proveedor con lo que te venden',
}: AddButtonDropdownProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuBox, setMenuBox] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);

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
  if (onPurchaseList) {
    options.push({
      id: 'purchase',
      label: purchaseListLabel,
      description: purchaseListDesc,
      icon: <ClipboardList className="w-4 h-4 text-emerald-600" />,
      action: () => { onPurchaseList(); setOpen(false); },
    });
  }

  // Si solo queda la opción de alta rápida (sin IA ni importar), el desplegable
  // sobra: el botón dispara directamente la acción. Evita un menú con un único
  // item, que confunde más de lo que ayuda.
  const onlyQuick = options.length === 1;

  useLayoutEffect(() => {
    if (!open || onlyQuick) {
      setMenuBox(null);
      return;
    }
    const place = () => {
      const btn = btnRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const width = Math.min(MENU_WIDTH, window.innerWidth - 16);
      let left = r.right - width;
      if (left < 8) left = 8;
      if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);
      const gap = 8;
      const spaceBelow = window.innerHeight - r.bottom - gap - 8;
      const spaceAbove = r.top - gap - 8;
      const openBelow = spaceBelow >= 160 || spaceBelow >= spaceAbove;
      const maxHeight = Math.max(120, openBelow ? spaceBelow : spaceAbove);
      setMenuBox(
        openBelow
          ? { top: r.bottom + gap, left, width, maxHeight }
          : { bottom: window.innerHeight - r.top + gap, left, width, maxHeight },
      );
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, onlyQuick]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={wrapRef} className="relative flex-shrink-0">
      <button
        ref={btnRef}
        type="button"
        onClick={() => {
          if (onlyQuick) {
            onQuickAdd();
            return;
          }
          setOpen((v) => !v);
        }}
        className={`${VERTIAL_BTN_PRIMARY} !min-h-0 px-3 py-1.5 text-xs gap-1.5`}
      >
        <Plus className="w-4 h-4" />
        <span className="hidden sm:inline">{label}</span>
        {!onlyQuick && (
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        )}
      </button>

      {open && !onlyQuick && typeof document !== 'undefined' && menuBox && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[200] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl overflow-y-auto"
          style={{
            top: menuBox.top,
            bottom: menuBox.bottom,
            left: menuBox.left,
            width: menuBox.width,
            maxHeight: menuBox.maxHeight,
          }}
        >
          {options.map((opt, i) => (
            <div key={opt.id}>
              <button
                type="button"
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
        </div>,
        document.body,
      )}
    </div>
  );
}
