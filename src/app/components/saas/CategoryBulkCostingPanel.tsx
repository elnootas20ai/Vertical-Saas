import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ChevronDown, ChevronUp, Loader2, Sparkles, X } from 'lucide-react';
import type { CatalogItem } from '../../lib/deliveryApi';
import { updateCatalogItemRequest } from '../../lib/deliveryApi';
import {
  applyFixedCostToProduct,
  buildCategoryCostingSummaries,
  categoryKindLabel,
  DRINK_COST_PRESETS,
  filterProductsForBulkApply,
  type BulkCostApplyMode,
  type CategoryCostingSummary,
} from '../../lib/catalogCategoryCosting';
import { SaasTabPrimaryButton } from './SaasTabWorkspace';

function formatMoney(value: number): string {
  return `${value.toFixed(2)}€`;
}

function parseCostInput(raw: string): number | null {
  const text = raw.trim().replace(',', '.');
  if (!text) return null;
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function kindBadgeClass(kind: CategoryCostingSummary['kind']): string {
  if (kind === 'drinks') return 'bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300';
  if (kind === 'desserts') return 'bg-pink-100 text-pink-800 dark:bg-pink-950/40 dark:text-pink-300';
  if (kind === 'food') return 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300';
  return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
}

function CategoryCostRow({
  summary,
  costInput,
  onCostInputChange,
  applyMode,
  userId,
  onApplied,
  expanded,
  onToggle,
}: {
  summary: CategoryCostingSummary;
  costInput: string;
  onCostInputChange: (value: string) => void;
  applyMode: BulkCostApplyMode;
  userId: string;
  onApplied: (items: CatalogItem[]) => void;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [applying, setApplying] = useState(false);
  const targets = useMemo(
    () => filterProductsForBulkApply(summary.products, applyMode),
    [summary.products, applyMode],
  );

  const apply = async () => {
    const cost = parseCostInput(costInput);
    if (cost == null) {
      toast.error(`Indica un coste válido para «${summary.category}»`);
      return;
    }
    if (targets.length === 0) {
      toast.info(`Ningún producto de «${summary.category}» coincide con el modo de aplicación.`);
      return;
    }
    if (
      applyMode === 'all' &&
      summary.recipeCount > 0 &&
      !confirm(
        `«${summary.category}» tiene ${summary.recipeCount} producto(s) con escandallo. ¿Sustituirlos por coste fijo de ${formatMoney(cost)}?`,
      )
    ) {
      return;
    }

    setApplying(true);
    const saved: CatalogItem[] = [];
    let failed = 0;
    try {
      for (const product of targets) {
        try {
          const next = applyFixedCostToProduct(product, cost);
          const result = await updateCatalogItemRequest(userId, next);
          saved.push(result);
        } catch {
          failed += 1;
        }
      }
      if (saved.length > 0) onApplied(saved);
      if (failed > 0) {
        toast.error(`${failed} producto(s) no se pudieron guardar en «${summary.category}».`);
      } else if (saved.length > 0) {
        toast.success(
          `${saved.length} producto(s) de «${summary.category}» con coste fijo ${formatMoney(cost)}.`,
        );
      }
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="border-b border-gray-100 dark:border-gray-800 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-3 py-2.5 flex items-start gap-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-bold text-gray-900 dark:text-gray-100 truncate">{summary.category}</span>
            <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${kindBadgeClass(summary.kind)}`}>
              {categoryKindLabel(summary.kind)}
            </span>
          </div>
          <p className="text-[10px] text-gray-500 mt-0.5">
            {summary.total} prod. · {summary.unconfigured} pendientes
          </p>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
        )}
      </button>

      {expanded ? (
        <div className="px-3 pb-3 space-y-2.5 bg-gray-50/60 dark:bg-gray-900/30">
          {summary.suggestedCost != null ? (
            <p className="text-[11px] text-gray-600 dark:text-gray-400">
              Referencia Vertial: <strong className="tabular-nums">{formatMoney(summary.suggestedCost)}</strong>
            </p>
          ) : (
            <p className="text-[11px] text-gray-500">Coste fijo para todos los productos de esta categoría.</p>
          )}

          {summary.kind === 'drinks' ? (
            <div className="flex flex-wrap gap-1">
              {DRINK_COST_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onCostInputChange(String(preset.cost))}
                  className="px-2 py-1 rounded-md text-[10px] font-semibold border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300"
                  title={`${formatMoney(preset.cost)} por unidad`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            <input
              type="text"
              inputMode="decimal"
              value={costInput}
              onChange={(e) => onCostInputChange(e.target.value)}
              placeholder="0,00"
              className="flex-1 min-w-0 px-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-900 tabular-nums"
            />
            <span className="text-[11px] text-gray-500 shrink-0">€</span>
            {summary.suggestedCost != null ? (
              <button
                type="button"
                onClick={() => onCostInputChange(String(summary.suggestedCost))}
                className="p-1.5 rounded-lg text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-950/30 shrink-0"
                title="Usar referencia Vertial"
              >
                <Sparkles className="w-3.5 h-3.5" />
              </button>
            ) : null}
          </div>

          <p className="text-[10px] text-gray-500">
            Afecta a <strong>{targets.length}</strong> de {summary.total} productos.
          </p>

          <SaasTabPrimaryButton
            className="w-full justify-center"
            disabled={applying || targets.length === 0}
            onClick={() => void apply()}
          >
            {applying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Aplicar a {summary.category}
          </SaasTabPrimaryButton>
        </div>
      ) : null}
    </div>
  );
}

export function CategoryBulkCostingPanel({
  catalogItems,
  userId,
  onApplied,
  onClose,
}: {
  catalogItems: CatalogItem[];
  userId: string;
  onApplied: (items: CatalogItem[]) => void;
  onClose?: () => void;
}) {
  const summaries = useMemo(() => buildCategoryCostingSummaries(catalogItems), [catalogItems]);
  const [applyMode, setApplyMode] = useState<BulkCostApplyMode>('unconfigured');
  const [costInputs, setCostInputs] = useState<Record<string, string>>({});
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  useEffect(() => {
    setCostInputs((prev) => {
      const next = { ...prev };
      for (const summary of summaries) {
        if (next[summary.category] != null && next[summary.category] !== '') continue;
        if (summary.suggestedCost != null) {
          next[summary.category] = String(summary.suggestedCost);
        }
      }
      return next;
    });
  }, [summaries]);

  useEffect(() => {
    if (summaries.length === 0) {
      setExpandedCategory(null);
      return;
    }
    setExpandedCategory((current) => {
      if (current && summaries.some((s) => s.category === current)) return current;
      const drinks = summaries.find((s) => s.kind === 'drinks');
      return drinks?.category ?? summaries[0].category;
    });
  }, [summaries]);

  if (summaries.length === 0) return null;

  return (
    <div className="flex flex-col h-full min-h-0 bg-gray-50/50 dark:bg-gray-900/20">
      <div className="shrink-0 px-3 py-2.5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-bold text-gray-900 dark:text-gray-100">Costes por categoría</p>
            <p className="text-[10px] text-gray-500 mt-0.5 leading-snug">
              Predefine costes fijos por grupo (p. ej. latas ~0,65 €).
            </p>
          </div>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 shrink-0"
              aria-label="Cerrar panel"
            >
              <X className="w-4 h-4" />
            </button>
          ) : null}
        </div>
        <label className="mt-2 flex items-center gap-1.5 text-[11px] text-gray-500">
          <span className="shrink-0">Aplicar a</span>
          <select
            value={applyMode}
            onChange={(e) => setApplyMode(e.target.value as BulkCostApplyMode)}
            className="flex-1 min-w-0 px-2 py-1 border border-gray-200 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-900"
          >
            <option value="unconfigured">Solo sin configurar</option>
            <option value="fixed_only">Sin configurar + coste fijo</option>
            <option value="all">Todos (incl. escandallos)</option>
          </select>
        </label>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {summaries.map((summary) => (
          <CategoryCostRow
            key={summary.category}
            summary={summary}
            costInput={costInputs[summary.category] ?? ''}
            onCostInputChange={(value) =>
              setCostInputs((prev) => ({ ...prev, [summary.category]: value }))
            }
            applyMode={applyMode}
            userId={userId}
            onApplied={onApplied}
            expanded={expandedCategory === summary.category}
            onToggle={() =>
              setExpandedCategory((current) =>
                current === summary.category ? null : summary.category,
              )
            }
          />
        ))}
      </div>
    </div>
  );
}
