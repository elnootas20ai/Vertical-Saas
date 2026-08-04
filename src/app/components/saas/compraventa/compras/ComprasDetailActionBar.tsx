import { FileUp, Calculator, CheckCircle2, Pencil, Plus, Receipt, ScanLine, XCircle } from 'lucide-react';
import { VERTIAL_BTN_PRIMARY } from '../../../../lib/vertialUiTokens';

const ACTIONS = [
  { id: 'fiscal', label: 'Simulación fiscal', icon: Calculator },
  { id: 'edit', label: 'Editar', icon: Pencil },
  { id: 'ocr', label: 'Escanear OCR', icon: ScanLine },
  { id: 'approve', label: 'Aprobar', icon: CheckCircle2 },
  { id: 'expense', label: 'Añadir gasto', icon: Receipt },
  { id: 'document', label: 'Adjuntar documento', icon: FileUp },
  { id: 'cancel', label: 'Cancelar compra', icon: XCircle, danger: true },
] as const;

export type CompraActionId = (typeof ACTIONS)[number]['id'];

type ComprasDetailActionBarProps = {
  showActions?: boolean;
  disabled?: boolean;
  hiddenActions?: CompraActionId[];
  onAction?: (actionId: CompraActionId) => void;
};

export function ComprasDetailActionBar({
  showActions = false,
  disabled = false,
  hiddenActions = [],
  onAction,
}: ComprasDetailActionBarProps) {
  if (!showActions) return null;

  const visible = ACTIONS.filter((action) => !hiddenActions.includes(action.id));

  return (
    <div className="shrink-0 border-b border-slate-200/80 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {visible.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.id}
              type="button"
              disabled={disabled}
              onClick={() => onAction?.(action.id)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                action.danger
                  ? 'border border-[rgba(225,29,72,0.2)] bg-[rgba(225,29,72,0.06)] text-[var(--v-rose,#e11d48)] hover:bg-[rgba(225,29,72,0.12)]'
                  : 'border border-slate-200/90 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50/60 hover:text-[var(--v-blue,#2563eb)] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-blue-950/40'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {action.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

type ComprasNewPurchaseButtonProps = {
  disabled?: boolean;
  onClick?: () => void;
};

export function ComprasNewPurchaseButton({ disabled = false, onClick }: ComprasNewPurchaseButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={VERTIAL_BTN_PRIMARY}
    >
      <Plus className="h-4 w-4" />
      Nueva compra
    </button>
  );
}
