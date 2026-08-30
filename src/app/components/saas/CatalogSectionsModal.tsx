import { useEffect, useMemo, useState } from 'react';
import { Edit3, Loader2, Plus, Trash2, X } from 'lucide-react';
import { useModalClose } from '../../hooks/useModalClose';
import { VERTIAL_BTN_PRIMARY, VERTIAL_BTN_SECONDARY, VERTIAL_FOCUS_RING } from '../../lib/vertialUiTokens';

export type CatalogSectionRow = {
  name: string;
  count: number;
};

type Props = {
  open: boolean;
  sections: CatalogSectionRow[];
  busy?: boolean;
  /** Etiqueta UI: «sección» (restaurante) o «categoría» (delivery). */
  entityLabel?: string;
  onClose: () => void;
  onAdd: (name: string) => Promise<void> | void;
  onRename: (from: string, to: string) => Promise<void> | void;
  onDelete: (name: string, count: number) => Promise<void> | void;
};

/**
 * Gestionar secciones/categorías de la carta desde la barra de Catálogo.
 * Añadir, renombrar o eliminar (vacía o con productos vía confirmación del padre).
 */
export function CatalogSectionsModal({
  open,
  sections,
  busy = false,
  entityLabel = 'sección',
  onClose,
  onAdd,
  onRename,
  onDelete,
}: Props) {
  const [draft, setDraft] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  useModalClose(open && !busy && !rowBusy, onClose);

  useEffect(() => {
    if (!open) {
      setDraft('');
      setRenaming(null);
      setRenameDraft('');
      setRowBusy(null);
    }
  }, [open]);

  const sorted = useMemo(
    () => [...sections].sort((a, b) => a.name.localeCompare(b.name, 'es')),
    [sections],
  );

  if (!open) return null;

  const labelCap = entityLabel.charAt(0).toUpperCase() + entityLabel.slice(1);

  const handleAdd = async () => {
    const name = draft.trim().replace(/\s+/g, ' ');
    if (!name) return;
    setRowBusy('__add__');
    try {
      await onAdd(name);
      setDraft('');
    } finally {
      setRowBusy(null);
    }
  };

  const handleRename = async (from: string) => {
    const to = renameDraft.trim().replace(/\s+/g, ' ');
    if (!to || to.toLowerCase() === from.toLowerCase()) {
      setRenaming(null);
      return;
    }
    setRowBusy(from);
    try {
      await onRename(from, to);
      setRenaming(null);
      setRenameDraft('');
    } finally {
      setRowBusy(null);
    }
  };

  const handleDelete = async (name: string, count: number) => {
    setRowBusy(name);
    try {
      await onDelete(name, count);
    } finally {
      setRowBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl dark:border-stone-700 dark:bg-stone-900">
        <div className="flex items-center justify-between gap-3 border-b border-stone-100 px-5 py-4 dark:border-stone-800">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-lg font-bold text-stone-900 dark:text-stone-100">
              <Edit3 className="h-5 w-5 text-[var(--v-blue,#2563eb)]" />
              Editar {entityLabel}es
            </h2>
            <p className="mt-0.5 text-xs text-stone-500">
              Añade, renombra o quita {entityLabel}es de la carta
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={Boolean(rowBusy) || busy}
            className="rounded-lg p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700 disabled:opacity-50 dark:hover:bg-stone-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 overflow-y-auto px-5 py-4">
          <div className="flex flex-wrap gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleAdd();
                }
              }}
              placeholder={`Nueva ${entityLabel}…`}
              disabled={Boolean(rowBusy) || busy}
              className={`min-w-0 flex-1 rounded-xl border-2 border-stone-200 bg-white px-3 py-2.5 text-sm dark:border-stone-600 dark:bg-stone-950 ${VERTIAL_FOCUS_RING}`}
            />
            <button
              type="button"
              onClick={() => void handleAdd()}
              disabled={!draft.trim() || Boolean(rowBusy) || busy}
              className={`${VERTIAL_BTN_PRIMARY} !min-h-0 gap-1.5 px-3 py-2.5 text-xs disabled:opacity-50`}
            >
              {rowBusy === '__add__' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              Añadir
            </button>
          </div>

          {sorted.length === 0 ? (
            <p className="rounded-xl border border-dashed border-stone-200 px-3 py-6 text-center text-sm text-stone-500 dark:border-stone-700">
              Aún no hay {entityLabel}es. Añade la primera arriba.
            </p>
          ) : (
            <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 dark:divide-stone-800 dark:border-stone-700">
              {sorted.map((row) => {
                const isRenaming = renaming === row.name;
                const isBusy = rowBusy === row.name;
                return (
                  <li key={row.name} className="flex flex-col gap-2 bg-white px-3 py-2.5 dark:bg-stone-900 sm:flex-row sm:items-center">
                    {isRenaming ? (
                      <div className="flex min-w-0 flex-1 flex-wrap gap-2">
                        <input
                          value={renameDraft}
                          autoFocus
                          onChange={(e) => setRenameDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              void handleRename(row.name);
                            }
                            if (e.key === 'Escape') setRenaming(null);
                          }}
                          disabled={isBusy}
                          className={`min-w-0 flex-1 rounded-lg border border-stone-200 px-2.5 py-1.5 text-sm dark:border-stone-600 dark:bg-stone-950 ${VERTIAL_FOCUS_RING}`}
                        />
                        <button
                          type="button"
                          onClick={() => void handleRename(row.name)}
                          disabled={isBusy}
                          className={`${VERTIAL_BTN_PRIMARY} !min-h-0 px-2.5 py-1.5 text-[11px]`}
                        >
                          Guardar
                        </button>
                        <button
                          type="button"
                          onClick={() => setRenaming(null)}
                          disabled={isBusy}
                          className={`${VERTIAL_BTN_SECONDARY} !min-h-0 px-2.5 py-1.5 text-[11px]`}
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-stone-900 dark:text-stone-100">
                            {row.name}
                          </p>
                          <p className="text-[11px] text-stone-500 tabular-nums">
                            {row.count} producto{row.count === 1 ? '' : 's'}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            title={`Renombrar ${entityLabel}`}
                            disabled={Boolean(rowBusy) || busy}
                            onClick={() => {
                              setRenaming(row.name);
                              setRenameDraft(row.name);
                            }}
                            className="rounded-lg p-2 text-stone-500 hover:bg-blue-50 hover:text-[var(--v-blue,#2563eb)] disabled:opacity-50 dark:hover:bg-blue-950/40"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            title={
                              row.count > 0
                                ? `Eliminar ${entityLabel} y sus productos`
                                : `Quitar ${entityLabel} vacía`
                            }
                            disabled={Boolean(rowBusy) || busy}
                            onClick={() => void handleDelete(row.name, row.count)}
                            className="rounded-lg p-2 text-stone-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950/30"
                          >
                            {isBusy ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-stone-100 px-5 py-3 dark:border-stone-800">
          <button
            type="button"
            onClick={onClose}
            disabled={Boolean(rowBusy) || busy}
            className={`${VERTIAL_BTN_SECONDARY} w-full sm:w-auto`}
          >
            Listo
          </button>
          <p className="mt-2 text-[11px] text-stone-400">
            {labelCap} nueva vacía: crea un producto y asígnalo para que aparezca en la rejilla.
          </p>
        </div>
      </div>
    </div>
  );
}
