import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, Loader2, Monitor, ShieldBan, ShieldOff, X } from 'lucide-react';
import {
  approvePdvTpvDeviceRequest,
  listPdvTpvDevicesRequest,
  rejectPdvTpvDeviceRequest,
  revokePdvTpvDeviceRequest,
  unblockPdvTpvDeviceRequest,
  type TpvTabletDevice,
} from '../../../lib/deliveryApi';
import { formatAddonPriceShort } from '../../../lib/planAddonCatalog';

const STATUS_LABEL: Record<string, string> = {
  pending: 'Esperando',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  revoked: 'Revocado',
  blocked: 'Bloqueado',
};

type Props = {
  userId: string;
  pdvId: string;
  onNeedAddon?: () => void;
};

export function TpvDevicesPanel({ userId, pdvId, onNeedAddon }: Props) {
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [devices, setDevices] = useState<TpvTabletDevice[]>([]);
  const [slotLimit, setSlotLimit] = useState(2);
  const [approvedCount, setApprovedCount] = useState(0);
  const [includedSlots, setIncludedSlots] = useState(2);

  const load = useCallback(async () => {
    if (!userId || !pdvId) return;
    setLoading(true);
    try {
      const data = await listPdvTpvDevicesRequest(userId, pdvId);
      setDevices(data.devices);
      setSlotLimit(data.slotLimit);
      setApprovedCount(data.approvedCount);
      setIncludedSlots(data.includedSlots);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudieron cargar los dispositivos');
    } finally {
      setLoading(false);
    }
  }, [userId, pdvId]);

  useEffect(() => {
    void load();
  }, [load]);

  const runAction = async (
    action: 'approve' | 'reject' | 'revoke' | 'unblock',
    deviceId: string,
  ) => {
    setBusyId(deviceId);
    try {
      const fn =
        action === 'approve'
          ? approvePdvTpvDeviceRequest
          : action === 'reject'
            ? rejectPdvTpvDeviceRequest
            : action === 'revoke'
              ? revokePdvTpvDeviceRequest
              : unblockPdvTpvDeviceRequest;
      const result = await fn(userId, pdvId, deviceId);
      if (result.code === 'TABLET_SLOT_LIMIT') {
        toast.error(result.error || 'Límite de tablets alcanzado');
        onNeedAddon?.();
        return;
      }
      if (result.error && !result.devices.length) {
        toast.error(result.error);
        return;
      }
      setDevices(result.devices);
      await load();
      toast.success(
        action === 'approve'
          ? 'Dispositivo aprobado'
          : action === 'reject'
            ? 'Dispositivo rechazado'
            : action === 'revoke'
              ? 'Dispositivo revocado'
              : 'Dispositivo desbloqueado',
      );
    } finally {
      setBusyId('');
    }
  };

  const pending = devices.filter((d) => d.status === 'pending');
  const addonPrice = formatAddonPriceShort('extra_tpv_tablet');

  return (
    <div className="rounded-xl border border-indigo-200 dark:border-indigo-800/60 bg-white/80 dark:bg-gray-900/50 px-3 py-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5">
            <Monitor className="w-3.5 h-3.5" />
            Dispositivos TPV
          </p>
          <p className="text-sm text-gray-700 dark:text-gray-200 mt-1">
            {approvedCount}/{slotLimit} tablets
            {slotLimit <= includedSlots
              ? ` (${includedSlots} incluidas)`
              : ` (${includedSlots} incluidas + extras)`}
          </p>
        </div>
        {approvedCount >= slotLimit ? (
          <p className="text-[11px] text-right text-amber-800 dark:text-amber-200 max-w-[12rem] leading-snug">
            Siguiente tablet: SVA {addonPrice}
          </p>
        ) : null}
      </div>

      {pending.length > 0 ? (
        <p className="text-xs font-medium text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 rounded-lg px-2.5 py-2">
          {pending.length} dispositivo{pending.length !== 1 ? 's' : ''} esperando aprobación
        </p>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
        </div>
      ) : devices.length === 0 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400 py-1">
          Aún no hay dispositivos. Cuando activen el código en una tablet, aparecerán aquí.
        </p>
      ) : (
        <ul className="space-y-2">
          {devices.map((d) => (
            <li
              key={d.deviceId}
              className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/60 px-3 py-2.5"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {d.label || 'Dispositivo'}
                  </p>
                  <p className="text-[11px] text-gray-500">
                    {STATUS_LABEL[d.status] || d.status}
                    {d.rejectCount ? ` · rechazos: ${d.rejectCount}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {d.status === 'pending' || d.status === 'rejected' ? (
                    <>
                      <button
                        type="button"
                        disabled={busyId === d.deviceId}
                        onClick={(e) => {
                          e.stopPropagation();
                          void runAction('approve', d.deviceId);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold disabled:opacity-50"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Aprobar
                      </button>
                      <button
                        type="button"
                        disabled={busyId === d.deviceId}
                        onClick={(e) => {
                          e.stopPropagation();
                          void runAction('reject', d.deviceId);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-200 text-red-700 text-xs font-semibold dark:border-red-800 dark:text-red-300 disabled:opacity-50"
                      >
                        <X className="w-3.5 h-3.5" />
                        Rechazar
                      </button>
                    </>
                  ) : null}
                  {d.status === 'approved' ? (
                    <button
                      type="button"
                      disabled={busyId === d.deviceId}
                      onClick={(e) => {
                        e.stopPropagation();
                        void runAction('revoke', d.deviceId);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-300 text-gray-700 text-xs font-semibold dark:border-gray-600 dark:text-gray-200 disabled:opacity-50"
                    >
                      <ShieldOff className="w-3.5 h-3.5" />
                      Revocar
                    </button>
                  ) : null}
                  {d.status === 'blocked' || d.status === 'revoked' ? (
                    <button
                      type="button"
                      disabled={busyId === d.deviceId}
                      onClick={(e) => {
                        e.stopPropagation();
                        void runAction('unblock', d.deviceId);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-amber-300 text-amber-800 text-xs font-semibold dark:border-amber-700 dark:text-amber-200 disabled:opacity-50"
                    >
                      <ShieldBan className="w-3.5 h-3.5" />
                      Desbloquear
                    </button>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
