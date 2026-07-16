import { ArrowLeft, Loader2 } from 'lucide-react';
import { SALA_ROOM_TYPE_LABELS } from '../../../../lib/salaStudioTypes';
import { draftTotals, toConfirmRooms } from '../state';
import type { OnboardingSpace } from '../types';
import { primaryBtn, secondaryBtn } from '../ui';

type Props = {
  spaces: OnboardingSpace[];
  saving?: boolean;
  onBack: () => void;
  onConfirm: () => void;
};

export function StepSummary({ spaces, saving, onBack, onConfirm }: Props) {
  const rooms = toConfirmRooms(spaces);
  const totals = draftTotals(spaces);

  return (
    <div className="mt-8 space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-neutral-900">Resumen del local</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Revisa y confirma. Luego creamos salas y mesas en Vertial.
        </p>
      </div>

      <div className="rounded-[12px] border border-neutral-200 p-5">
        <p className="text-sm font-medium text-neutral-800">
          {rooms.length} espacios · {totals.tableCount} mesas · aforo {totals.capacity}
        </p>
        <ul className="mt-4 space-y-2">
          {rooms.map((room) => (
            <li
              key={`${room.name}-${room.roomType}`}
              className="flex items-center justify-between rounded-[12px] border border-neutral-100 px-3 py-2.5 text-sm"
            >
              <span className="font-medium text-neutral-900">
                {room.name}
                <span className="ml-2 font-normal text-neutral-500">
                  {SALA_ROOM_TYPE_LABELS[room.roomType] || room.roomType}
                </span>
              </span>
              <span className="text-neutral-600">
                {room.tableCount} mesas ·{' '}
                {room.capacities
                  ? `aforo ${room.capacities.reduce((a, b) => a + b, 0)}`
                  : `${room.defaultCapacity} pax/mesa`}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap justify-between gap-3">
        <button type="button" onClick={onBack} disabled={saving} className={secondaryBtn}>
          <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
          Atrás
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={saving || rooms.length === 0}
          className={primaryBtn}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Confirmar y continuar
        </button>
      </div>
    </div>
  );
}
