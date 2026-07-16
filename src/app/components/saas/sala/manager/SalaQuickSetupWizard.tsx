import { useMemo, useState } from 'react';
import { ArrowRight, LayoutGrid, Loader2, Sparkles } from 'lucide-react';
import type { SalaRoomType } from '../../../../lib/salaStudioTypes';
import { SALA_ROOM_TYPE_LABELS } from '../../../../lib/salaStudioTypes';
import {
  defaultRoomDrafts,
  type SalaQuickSetupRoomDraft,
} from '../../../../lib/salaQuickSetup';

type Props = {
  storeLabel?: string;
  saving?: boolean;
  onSubmit: (rooms: SalaQuickSetupRoomDraft[]) => void;
};

export function SalaQuickSetupWizard({ storeLabel, saving, onSubmit }: Props) {
  const [roomCount, setRoomCount] = useState(2);
  const [drafts, setDrafts] = useState<SalaQuickSetupRoomDraft[]>(() => defaultRoomDrafts(2));

  const totalTables = useMemo(
    () => drafts.reduce((sum, r) => sum + Math.max(0, r.tableCount), 0),
    [drafts],
  );

  const syncCount = (count: number) => {
    const next = Math.max(1, Math.min(8, count));
    setRoomCount(next);
    setDrafts((prev) => {
      if (prev.length === next) return prev;
      if (prev.length > next) return prev.slice(0, next);
      return [...prev, ...defaultRoomDrafts(next).slice(prev.length)];
    });
  };

  const updateDraft = (index: number, patch: Partial<SalaQuickSetupRoomDraft>) => {
    setDrafts((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = drafts
      .map((row, index) => ({
        name: String(row.name || `Sala ${index + 1}`).trim(),
        roomType: row.roomType || 'salon',
        tableCount: Math.max(1, Number(row.tableCount) || 1),
        defaultCapacity: Math.max(1, Number(row.defaultCapacity) || 4),
      }))
      .filter((row) => row.name);
    if (cleaned.length === 0) return;
    onSubmit(cleaned);
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-gray-50/80 p-6 dark:bg-gray-950">
      <div className="w-full max-w-2xl rounded-3xl border border-gray-200/80 bg-white p-8 shadow-xl dark:border-gray-800 dark:bg-gray-950">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-gray-900 p-3 text-white dark:bg-white dark:text-gray-900">
            <Sparkles className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-50">
              Asistente rápido de sala
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {storeLabel
                ? `PDV «${storeLabel}» nuevo. Indica cuántas zonas tienes y cuántas mesas hay en cada una.`
                : 'Indica cuántas zonas tienes (salón, terraza, terraza 2…) y cuántas mesas en cada una.'}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-800 dark:bg-gray-900/40">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              ¿Cuántas zonas / salas tienes?
            </label>
            <div className="mt-3 flex items-center gap-3">
              <input
                type="number"
                min={1}
                max={8}
                value={roomCount}
                onChange={(e) => syncCount(Number(e.target.value))}
                className={inputCls}
              />
              <span className="text-xs text-gray-500">Salón principal, terraza, terraza 2, barra…</span>
            </div>
          </div>

          <div className="space-y-3">
            {drafts.map((row, index) => (
              <div
                key={index}
                className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800"
              >
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                  <LayoutGrid className="h-4 w-4 text-gray-400" />
                  Zona {index + 1}
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="Nombre">
                    <input
                      value={row.name}
                      onChange={(e) => updateDraft(index, { name: e.target.value })}
                      placeholder="Ej. Terraza"
                      className={inputCls}
                      required
                    />
                  </Field>
                  <Field label="Tipo">
                    <select
                      value={row.roomType}
                      onChange={(e) => updateDraft(index, { roomType: e.target.value as SalaRoomType })}
                      className={inputCls}
                    >
                      {(Object.keys(SALA_ROOM_TYPE_LABELS) as SalaRoomType[]).map((t) => (
                        <option key={t} value={t}>{SALA_ROOM_TYPE_LABELS[t]}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Mesas">
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={row.tableCount}
                      onChange={(e) => updateDraft(index, { tableCount: Number(e.target.value) })}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Capacidad">
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={row.defaultCapacity}
                      onChange={(e) => updateDraft(index, { defaultCapacity: Number(e.target.value) })}
                      className={inputCls}
                    />
                  </Field>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-gray-50 px-4 py-3 dark:bg-gray-900/50">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              <strong className="text-gray-900 dark:text-gray-100">{drafts.length}</strong> zonas ·{' '}
              <strong className="text-gray-900 dark:text-gray-100">{totalTables}</strong> mesas
            </p>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-gray-900"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              Crear mapa de sala
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-gray-500">{label}</label>
      {children}
    </div>
  );
}

const inputCls =
  'w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100';
