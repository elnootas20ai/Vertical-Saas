import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { SalaRoomType } from '../../lib/salaStudioTypes';
import { SALA_ROOM_TYPE_LABELS } from '../../lib/salaStudioTypes';
import {
  defaultCapacityForRoomType,
  defaultTableCountForRoomType,
} from './restaurantSalaLiveEdit';

/** Tipos habituales en un bar/restaurante con sala. */
const ZONE_TYPES: SalaRoomType[] = ['salon', 'terraza', 'barra', 'patio', 'vip', 'privado'];

const ZONE_HINTS: Record<SalaRoomType, string> = {
  salon: 'Comedor interior · mesas de 2–6',
  terraza: 'Exterior · mesas estándar',
  patio: 'Patio / jardín',
  barra: 'Taburetes · servicio rápido (1–2 pax)',
  vip: 'Zona VIP · mesas más grandes',
  privado: 'Sala privada / reservados',
};

type Props = {
  open: boolean;
  onClose: () => void;
  busy?: boolean;
  onCreate: (input: {
    name: string;
    roomType: SalaRoomType;
    tableCount: number;
    defaultCapacity: number;
  }) => void;
};

export function RestaurantAddZoneModal({ open, onClose, busy, onCreate }: Props) {
  const [roomType, setRoomType] = useState<SalaRoomType>('salon');
  const [name, setName] = useState('Salón Principal');
  const [tableCount, setTableCount] = useState(4);
  const [capacity, setCapacity] = useState(4);

  useEffect(() => {
    if (!open) return;
    setRoomType('terraza');
    setName(SALA_ROOM_TYPE_LABELS.terraza);
    setTableCount(defaultTableCountForRoomType('terraza'));
    setCapacity(defaultCapacityForRoomType('terraza'));
  }, [open]);

  if (!open) return null;

  const applyType = (next: SalaRoomType) => {
    setRoomType(next);
    setName(SALA_ROOM_TYPE_LABELS[next]);
    setTableCount(defaultTableCountForRoomType(next));
    setCapacity(defaultCapacityForRoomType(next));
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-[12px] border border-neutral-200 bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-neutral-900">Nueva zona</h2>
            <p className="mt-0.5 text-sm text-neutral-500">
              Salón, terraza, barra… sin tocar el resto del mapa.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg p-1 text-neutral-500 hover:bg-neutral-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2">
          {ZONE_TYPES.map((t) => {
            const selected = roomType === t;
            return (
              <button
                key={t}
                type="button"
                disabled={busy}
                onClick={() => applyType(t)}
                className={`rounded-[10px] border px-2 py-2 text-center text-xs font-semibold transition-colors ${
                  selected
                    ? 'border-neutral-900 bg-neutral-900 text-white'
                    : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300'
                }`}
              >
                {SALA_ROOM_TYPE_LABELS[t]}
              </button>
            );
          })}
        </div>
        <p className="mb-4 text-xs text-neutral-500">{ZONE_HINTS[roomType]}</p>

        <label className="mb-1.5 block text-sm font-medium text-neutral-700">Nombre</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={busy}
          autoFocus
          placeholder="Ej. Terraza"
          className="mb-4 w-full rounded-[10px] border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:border-neutral-400"
        />

        <div className="mb-5 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-neutral-700">
              Mesas al crear
            </label>
            <input
              type="number"
              min={0}
              max={40}
              value={tableCount}
              disabled={busy}
              onChange={(e) => setTableCount(Number(e.target.value))}
              className="w-full rounded-[10px] border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:border-neutral-400"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-neutral-700">
              Pax por mesa
            </label>
            <input
              type="number"
              min={1}
              max={20}
              value={capacity}
              disabled={busy}
              onChange={(e) => setCapacity(Number(e.target.value))}
              className="w-full rounded-[10px] border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:border-neutral-400"
            />
          </div>
        </div>

        <button
          type="button"
          disabled={busy || !name.trim()}
          onClick={() =>
            onCreate({
              name: name.trim(),
              roomType,
              tableCount,
              defaultCapacity: capacity,
            })
          }
          className="w-full rounded-[12px] bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Creando…' : 'Crear zona'}
        </button>
      </div>
    </div>
  );
}
