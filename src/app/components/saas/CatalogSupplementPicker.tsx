import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Search, Trash2 } from 'lucide-react';
import {
  parseIngredientsBulkText,
  readStoreIngredientTpvFlags,
  resolveIngredientExtraPrice,
  resolveIngredientRole,
  storeIngredientAppliesToBrands,
  type StoreIngredient,
  type TpvCategoryTemplateKey,
} from '../../lib/catalogCustomization';
import { formatMoneyEs } from '../../lib/formatNumberEs';

export type CatalogSupplementRow = { id: string; name: string; price: string };

const LINE_ORDER = ['pizzas', 'hamburguesas', 'todas'] as const;
type LineGroupKey = (typeof LINE_ORDER)[number];

const LINE_LABELS: Record<LineGroupKey, string> = {
  pizzas: 'Pizzas',
  hamburguesas: 'Hamburguesas',
  todas: 'Todas las líneas',
};

const ROLE_SECTIONS = [
  {
    id: 'extra' as const,
    title: 'Extras de pago',
    hint: 'Ingredientes que ya cobran extra en el TPV',
  },
  {
    id: 'base' as const,
    title: 'Incluidos en productos',
    hint: 'Base TPV — puedes cobrarlos extra solo en este producto',
  },
];

type IngredientOption = {
  id: string;
  name: string;
  price: number;
  roleGroup: 'extra' | 'base';
  lineGroup: LineGroupKey;
};

function foldName(s: string): string {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function lineGroupForParts(parts?: TpvCategoryTemplateKey[]): LineGroupKey {
  if (!parts?.length) return 'todas';
  if (parts.length === 1 && parts[0] === 'pizzas') return 'pizzas';
  if (parts.length === 1 && parts[0] === 'hamburguesas') return 'hamburguesas';
  return 'todas';
}

function isTpvSelectableIngredient(ing: StoreIngredient): boolean {
  if (resolveIngredientRole(ing) === 'escandallo') return false;
  const flags = readStoreIngredientTpvFlags(ing);
  return flags.chargeExtra || flags.allowRemove;
}

type CatalogSupplementPickerProps = {
  rows: CatalogSupplementRow[];
  onChange: (next: CatalogSupplementRow[]) => void;
  storeIngredients: StoreIngredient[];
  brandIds?: string[];
  defaultExtraPrice?: number;
  loading?: boolean;
  inputClass?: string;
};

export function CatalogSupplementPicker({
  rows,
  onChange,
  storeIngredients,
  brandIds = [],
  defaultExtraPrice,
  loading = false,
  inputClass = 'px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100',
}: CatalogSupplementPickerProps) {
  const [search, setSearch] = useState('');
  const [collapsedRoles, setCollapsedRoles] = useState<Set<string>>(() => new Set(['base']));
  const [collapsedLines, setCollapsedLines] = useState<Set<string>>(() => new Set());
  const [manualOpen, setManualOpen] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualPrice, setManualPrice] = useState('');

  const ingredientOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: IngredientOption[] = [];
    const wantedBrandIds = brandIds.filter(Boolean);

    for (const ing of storeIngredients) {
      if (!isTpvSelectableIngredient(ing)) continue;
      if (
        wantedBrandIds.length > 0 &&
        normalizeBrandIds(ing.brandIds).length > 0 &&
        !storeIngredientAppliesToBrands(ing, wantedBrandIds)
      ) {
        continue;
      }

      const flags = readStoreIngredientTpvFlags(ing);
      const roleGroup = flags.chargeExtra ? 'extra' : 'base';
      const price = flags.chargeExtra
        ? resolveIngredientExtraPrice(ing, wantedBrandIds, defaultExtraPrice)
        : resolveIngredientExtraPrice(ing, wantedBrandIds, defaultExtraPrice) ||
          (defaultExtraPrice ?? 0);
      const lineGroup = lineGroupForParts(ing.productParts);
      const labels = parseIngredientsBulkText(ing.name);
      const names =
        labels.length > 0 ? labels : [String(ing.name || '').trim()].filter(Boolean);

      for (const label of names) {
        const key = foldName(label);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push({
          id: names.length === 1 ? ing.id : `${ing.id}::${key.replace(/\s+/g, '-')}`,
          name: label,
          price,
          roleGroup,
          lineGroup,
        });
      }
    }

    return out.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [storeIngredients, brandIds, defaultExtraPrice]);

  const selectedKeys = useMemo(
    () => new Set(rows.map((r) => foldName(r.name)).filter(Boolean)),
    [rows],
  );

  const filteredTree = useMemo(() => {
    const q = foldName(search);
    return ROLE_SECTIONS.map((role) => {
      const roleItems = ingredientOptions.filter((o) => o.roleGroup === role.id);
      const lines = LINE_ORDER.map((lineKey) => ({
        key: lineKey,
        label: LINE_LABELS[lineKey],
        items: roleItems.filter(
          (o) => o.lineGroup === lineKey && (!q || foldName(o.name).includes(q)),
        ),
      })).filter((line) => line.items.length > 0);
      return { ...role, lines, total: lines.reduce((n, l) => n + l.items.length, 0) };
    }).filter((role) => role.total > 0);
  }, [ingredientOptions, search]);

  const toggleOption = (opt: IngredientOption) => {
    const key = foldName(opt.name);
    if (selectedKeys.has(key)) {
      onChange(rows.filter((r) => foldName(r.name) !== key));
      return;
    }
    onChange([
      ...rows,
      { id: opt.id, name: opt.name, price: opt.price > 0 ? String(opt.price) : '' },
    ]);
  };

  const updateRow = (idx: number, patch: Partial<CatalogSupplementRow>) => {
    onChange(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const removeRow = (idx: number) => {
    onChange(rows.filter((_, i) => i !== idx));
  };

  const commitManualExtra = () => {
    const name = manualName.trim().replace(/\s+/g, ' ');
    if (!name) return;
    const key = foldName(name);
    if (selectedKeys.has(key)) {
      setManualName('');
      setManualPrice('');
      setManualOpen(false);
      return;
    }
    onChange([
      ...rows,
      {
        id: `sup-${Date.now()}`,
        name,
        price: manualPrice.trim(),
      },
    ]);
    setManualName('');
    setManualPrice('');
    setManualOpen(false);
  };

  const toggleRole = (id: string) => {
    setCollapsedRoles((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleLine = (key: string) => {
    setCollapsedLines((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar ingrediente…"
          className={`${inputClass} w-full pl-9 text-sm`}
        />
      </div>

      {loading ? (
        <p className="text-xs text-gray-500 dark:text-gray-400 py-2">Cargando ingredientes del TPV…</p>
      ) : ingredientOptions.length === 0 ? (
        <p className="text-xs text-amber-800 dark:text-amber-300 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30 px-3 py-2">
          No hay ingredientes en Catálogo → Ingredientes. Créalos ahí o añade un extra manual abajo.
        </p>
      ) : filteredTree.length === 0 ? (
        <p className="text-xs text-gray-500 text-center py-2">Sin resultados</p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto pr-0.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/40 p-2">
          {filteredTree.map((role) => {
            const roleCollapsed = collapsedRoles.has(role.id);
            return (
              <div key={role.id} className="rounded-lg bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => toggleRole(role.id)}
                  className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
                >
                  {roleCollapsed ? (
                    <ChevronRight className="w-4 h-4 shrink-0 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 shrink-0 text-gray-400" />
                  )}
                  <span className="text-xs font-bold text-gray-900 dark:text-gray-100">{role.title}</span>
                  <span className="text-[10px] tabular-nums text-gray-400">{role.total}</span>
                  <span className="ml-auto text-[10px] text-gray-400 hidden sm:inline">{role.hint}</span>
                </button>
                {!roleCollapsed ? (
                  <div className="px-2 pb-2 space-y-2">
                    {role.lines.map((line) => {
                      const lineKey = `${role.id}:${line.key}`;
                      const lineCollapsed = collapsedLines.has(lineKey);
                      return (
                        <div key={lineKey}>
                          <button
                            type="button"
                            onClick={() => toggleLine(lineKey)}
                            className="flex w-full items-center gap-1.5 py-1 text-left"
                          >
                            {lineCollapsed ? (
                              <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                            )}
                            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                              {line.label}
                            </span>
                            <span className="text-[10px] tabular-nums text-gray-400">{line.items.length}</span>
                          </button>
                          {!lineCollapsed ? (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pl-1">
                              {line.items.map((opt) => {
                                const on = selectedKeys.has(foldName(opt.name));
                                return (
                                  <button
                                    key={opt.id}
                                    type="button"
                                    onClick={() => toggleOption(opt)}
                                    className={`flex flex-col items-start gap-0.5 px-2 py-1.5 rounded-lg border text-left text-[11px] font-semibold transition-colors ${
                                      on
                                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-950 dark:text-indigo-100'
                                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:border-indigo-300'
                                    }`}
                                  >
                                    <span className="inline-flex items-center gap-1 min-w-0 w-full">
                                      <Plus
                                        className={`w-3 h-3 shrink-0 ${on ? 'rotate-45 text-indigo-600' : 'text-emerald-600'}`}
                                      />
                                      <span className="truncate">{opt.name}</span>
                                    </span>
                                    <span className="pl-4 text-[10px] font-medium tabular-nums text-stone-500">
                                      {opt.price > 0 ? formatMoneyEs(opt.price) : 'Sin precio'}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {rows.length > 0 ? (
        <div className="space-y-2 pt-1 border-t border-gray-200 dark:border-gray-700">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            Extras en este producto
            <span className="ml-1.5 tabular-nums">{rows.length}</span>
          </p>
          {rows.map((row, idx) => (
            <div
              key={row.id || idx}
              className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_6rem_2rem] gap-2 items-center"
            >
              <input
                className={`${inputClass} w-full text-sm py-1.5`}
                placeholder="Nombre"
                value={row.name}
                onChange={(e) => updateRow(idx, { name: e.target.value })}
              />
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                className={`${inputClass} w-full tabular-nums text-right text-sm py-1.5`}
                placeholder="0,00"
                value={row.price}
                onChange={(e) => updateRow(idx, { price: e.target.value })}
              />
              <button
                type="button"
                onClick={() => removeRow(idx)}
                className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 justify-self-end"
                aria-label="Quitar"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="border-t border-gray-200 dark:border-gray-700 pt-2">
        <button
          type="button"
          onClick={() => setManualOpen((v) => !v)}
          className="text-[11px] font-semibold text-gray-600 dark:text-gray-300 hover:underline inline-flex items-center gap-1"
        >
          <Plus className="w-3 h-3" />
          {manualOpen ? 'Ocultar extra manual' : 'Extra manual (nombre libre)'}
        </button>
        {manualOpen ? (
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_6rem_auto] gap-2 items-end">
            <input
              className={`${inputClass} text-sm py-1.5`}
              placeholder="Ej. Extra queso"
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitManualExtra();
                }
              }}
            />
            <input
              type="number"
              min="0"
              step="0.01"
              className={`${inputClass} text-sm py-1.5 tabular-nums text-right`}
              placeholder="0,00"
              value={manualPrice}
              onChange={(e) => setManualPrice(e.target.value)}
            />
            <button
              type="button"
              onClick={commitManualExtra}
              disabled={!manualName.trim()}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-gray-900 text-white disabled:opacity-50"
            >
              Añadir
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function normalizeBrandIds(raw?: string[]): string[] {
  return Array.isArray(raw) ? raw.map((id) => String(id || '').trim()).filter(Boolean) : [];
}
