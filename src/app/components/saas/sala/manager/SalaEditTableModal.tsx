import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useModalClose } from '../../../../hooks/useModalClose';
import type { ExtendedDiningTable } from '../../../../lib/salaStudioTypes';
import {
  TABLE_SIZE_PRESETS,
  inferTableSizePreset,
  type TableSizePreset,
} from '../../../../lib/salaTableSize';

type Props = {
  open: boolean;
  table: ExtendedDiningTable | null;
  onClose: () => void;
  onSave: (tableId: string, patch: Partial<ExtendedDiningTable> & { sizePreset?: TableSizePreset }) => void;
  onDelete: (tableId: string) => void;
  onDuplicate: (tableId: string) => void;
};

export function SalaEditTableModal({ open, table, onClose, onSave, onDelete, onDuplicate }: Props) {
  useModalClose(open, onClose);
  const [number, setNumber] = useState(1);
  const [capacity, setCapacity] = useState(4);
  const [sizePreset, setSizePreset] = useState<TableSizePreset>('medium');
  const [active, setActive] = useState(true);
  const [notes, setNotes] = useState('');
  const [qrCode, setQrCode] = useState('');

  useEffect(() => {
    if (!table) return;
    setNumber(table.number);
    setCapacity(table.capacity);
    setSizePreset(table.sizePreset || inferTableSizePreset(table.gridW, table.gridH, table.capacity));
    setActive(table.visible !== false);
    setNotes(table.notes || '');
    setQrCode(table.qrCode || '');
  }, [table]);

  if (!open || !table) return null;

  const handleSizeChange = (preset: TableSizePreset) => {
    setSizePreset(preset);
    const p = TABLE_SIZE_PRESETS[preset];
    setCapacity(p.capacity);
  };

  const handleSave = () => {
    onSave(table._id, {
      number,
      capacity,
      sizePreset,
      visible: active,
      notes,
      qrCode,
      name: `Mesa ${number}`,
    });
    onClose();
  };

  const handleDelete = () => {
    if (window.confirm(`¿Eliminar la mesa ${table.number}?`)) {
      onDelete(table._id);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-950" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50">Editar mesa</h2>
            <p className="mt-0.5 text-xs text-gray-500">Solo configuración — el estado operativo se gestiona en el TPV</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        <div className="space-y-4">
          <Field label="Número">
            <input type="number" min={1} value={number} onChange={(e) => setNumber(Number(e.target.value))} className={inputCls} />
          </Field>

          <Field label="Tamaño de mesa">
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(TABLE_SIZE_PRESETS) as TableSizePreset[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleSizeChange(key)}
                  className={`rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                    sizePreset === key
                      ? 'border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900'
                      : 'border-gray-200 text-gray-700 hover:border-gray-300 dark:border-gray-700 dark:text-gray-300'
                  }`}
                >
                  {TABLE_SIZE_PRESETS[key].label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Aforo (personas)">
            <input type="number" min={1} max={20} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} className={inputCls} />
          </Field>

          <Field label="Activa en TPV">
            <label className="flex cursor-pointer items-center justify-between rounded-xl border border-gray-200 px-3 py-2.5 dark:border-gray-700">
              <span className="text-sm text-gray-700 dark:text-gray-300">
                {active ? 'Visible en el TPV' : 'Oculta — no se usa en el TPV'}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={active}
                onClick={() => setActive((v) => !v)}
                className={`relative h-5 w-9 shrink-0 rounded-full transition ${
                  active ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${
                    active ? 'left-[18px]' : 'left-0.5'
                  }`}
                />
              </button>
            </label>
          </Field>

          <Field label="Código QR (opcional)">
            <input value={qrCode} onChange={(e) => setQrCode(e.target.value)} placeholder="mesa-1-salon" className={inputCls} />
          </Field>

          <Field label="Notas (opcional)">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={`${inputCls} resize-none`} placeholder="Ej. Junto a ventana" />
          </Field>
        </div>

        <div className="mt-6 flex flex-col gap-3">
          <button type="button" onClick={handleSave} className="w-full rounded-xl bg-gray-900 py-2.5 text-sm font-semibold text-white dark:bg-white dark:text-gray-900">
            Guardar cambios
          </button>
          <button
            type="button"
            onClick={() => { onDuplicate(table._id); onClose(); }}
            className="w-full rounded-xl border border-gray-200 py-2 text-sm font-medium dark:border-gray-700"
          >
            Duplicar mesa
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="w-full rounded-xl border border-red-200 bg-red-50/50 py-2 text-sm font-medium text-red-600 dark:border-red-900 dark:bg-red-950/20 dark:text-red-400"
          >
            Eliminar mesa
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
      {children}
    </div>
  );
}

const inputCls =
  'w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100';
