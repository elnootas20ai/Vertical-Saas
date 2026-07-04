import { useModalClose } from '../../../../hooks/useModalClose';
import type { SalaRoomType } from '../../../../lib/salaStudioTypes';
import { SALA_ROOM_TYPE_LABELS } from '../../../../lib/salaStudioTypes';

type Props = {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, roomType: SalaRoomType, tableCount: number, defaultCapacity: number) => void;
};

export function SalaCreateRoomModal({ open, onClose, onCreate }: Props) {
  useModalClose(open, onClose);
  if (!open) return null;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get('name') || '').trim();
    const roomType = String(fd.get('roomType') || 'salon') as SalaRoomType;
    const tableCount = Math.max(1, Number(fd.get('tableCount') || 1));
    const defaultCapacity = Math.max(1, Number(fd.get('defaultCapacity') || 4));
    if (!name) return;
    onCreate(name, roomType, tableCount, defaultCapacity);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-950" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50">Nueva sala</h2>
        <p className="mt-1 text-sm text-gray-500">Las mesas se crearán automáticamente</p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <Field label="Nombre">
            <input name="name" required autoFocus placeholder="Ej. Terraza" className={inputCls} />
          </Field>
          <Field label="Tipo de sala">
            <select name="roomType" className={inputCls}>
              {(Object.keys(SALA_ROOM_TYPE_LABELS) as SalaRoomType[]).map((t) => (
                <option key={t} value={t}>{SALA_ROOM_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Capacidad por mesa">
              <input name="defaultCapacity" type="number" min={1} max={20} defaultValue={4} className={inputCls} />
            </Field>
            <Field label="Número de mesas">
              <input name="tableCount" type="number" min={1} max={99} defaultValue={8} className={inputCls} />
            </Field>
          </div>
          <button type="submit" className="w-full rounded-xl bg-gray-900 py-2.5 text-sm font-semibold text-white hover:bg-black dark:bg-white dark:text-gray-900">
            Crear sala
          </button>
        </form>
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
