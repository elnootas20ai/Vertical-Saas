import React, { useEffect, useMemo, useState } from 'react';
import { Copy, Loader2, QrCode, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useModalClose } from '../../hooks/useModalClose';
import { useInviteWorkCenters } from '../../hooks/useInviteWorkCenters';
import type { Business } from '../../lib/businessApi';
import {
  getFunctionRolesForBusiness,
  getInviteRoleDisplayLabel,
  suggestPositionForInviteRole,
} from '../../lib/inviteFunctionRoles';
import { getDefaultInviteLandingPage } from '../../lib/inviteDefaults';
import { getInvitePermissionsForUser } from '../../lib/roleCatalog';
import { getHrLocationCopy } from '../../lib/retailLocationCopy';
import { listShiftTemplates, type ShiftTemplate } from '../../lib/schedulesApi';
import {
  buildWorkerJoinQrImageUrl,
  createWorkerInviteLinkRequest,
  listWorkerInviteLinksRequest,
  revokeWorkerInviteLinkRequest,
  type WorkerInviteLink,
} from '../../lib/workerInviteLinksApi';

type Props = {
  onClose: () => void;
  business: Business | null;
};

function pickDefaultRole(
  businessType?: string | null,
  opts?: { ownDeliveryEnabled?: boolean },
): string {
  const roles = getFunctionRolesForBusiness(businessType, opts);
  const ids = roles.map((r) => r.id);
  if (ids.includes('Comercial')) return 'Comercial';
  const ops = ids.find((id) => id !== 'Administrador' && id !== 'Gestor');
  return ops || ids[0] || 'Usuario';
}

export function WorkerInviteQrModal({ onClose, business }: Props) {
  useModalClose(true, onClose);
  const businessType = business?.businessType;
  const hrCopy = getHrLocationCopy(businessType);
  const roleOptions = useMemo(
    () => getFunctionRolesForBusiness(businessType, {
      ownDeliveryEnabled: Boolean(business?.ownDeliveryEnabled),
    }),
    [businessType, business?.ownDeliveryEnabled],
  );

  const { options: storeOptions, loading: storesLoading } = useInviteWorkCenters(business, true);

  const [workCenterId, setWorkCenterId] = useState<string>('');
  const [role, setRole] = useState<string>(() =>
    pickDefaultRole(businessType, { ownDeliveryEnabled: Boolean(business?.ownDeliveryEnabled) }),
  );
  const [scheduleTemplateId, setScheduleTemplateId] = useState('');
  const [shiftTemplates, setShiftTemplates] = useState<ShiftTemplate[]>([]);
  const [creating, setCreating] = useState(false);
  const [links, setLinks] = useState<WorkerInviteLink[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(false);
  const [activeJoinUrl, setActiveJoinUrl] = useState('');
  const [activeTokenMeta, setActiveTokenMeta] = useState<{ role: string; workCenterName: string } | null>(null);

  useEffect(() => {
    setRole(pickDefaultRole(businessType, { ownDeliveryEnabled: Boolean(business?.ownDeliveryEnabled) }));
  }, [businessType, business?.ownDeliveryEnabled]);

  useEffect(() => {
    if (!workCenterId && storeOptions.length === 1) {
      setWorkCenterId(storeOptions[0].id);
    }
  }, [storeOptions, workCenterId]);

  useEffect(() => {
    const businessId = business?.business_id || '';
    if (!businessId) {
      setShiftTemplates([]);
      return;
    }
    let cancelled = false;
    listShiftTemplates(businessId)
      .then((list) => {
        if (!cancelled) setShiftTemplates(list);
      })
      .catch(() => {
        if (!cancelled) setShiftTemplates([]);
      });
    return () => {
      cancelled = true;
    };
  }, [business?.business_id]);

  const refreshLinks = async () => {
    const businessId = business?.business_id || '';
    if (!businessId) return;
    setLoadingLinks(true);
    try {
      const res = await listWorkerInviteLinksRequest(businessId);
      setLinks(res.inviteLinks || []);
    } catch {
      setLinks([]);
    } finally {
      setLoadingLinks(false);
    }
  };

  useEffect(() => {
    void refreshLinks();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir / cambiar negocio
  }, [business?.business_id]);

  const handleCreate = async () => {
    const businessId = business?.business_id || '';
    if (!businessId) {
      toast.error('No hay empresa seleccionada');
      return;
    }
    if (!workCenterId) {
      toast.error(hrCopy.inviteWorkCenterPlaceholder || 'Selecciona un centro');
      return;
    }
    if (!role) {
      toast.error('Selecciona una función');
      return;
    }

    setCreating(true);
    try {
      const permissions = getInvitePermissionsForUser(role, roleOptions);
      const landingPage = getDefaultInviteLandingPage(businessType, role);
      const position = suggestPositionForInviteRole(role, businessType);
      const res = await createWorkerInviteLinkRequest({
        businessId,
        workCenterId,
        role,
        permissions,
        landingPage,
        scheduleTemplateId: scheduleTemplateId || undefined,
        position: position || undefined,
        expiresInDays: 90,
      });
      if (!res.ok || !res.joinUrl) {
        toast.error(res.error || 'No se pudo crear el enlace');
        return;
      }
      setActiveJoinUrl(res.joinUrl);
      setActiveTokenMeta({
        role,
        workCenterName:
          storeOptions.find((s) => s.id === workCenterId)?.label
          || res.inviteLink?.workCenterName
          || '',
      });
      toast.success('QR listo — compártelo con el equipo');
      await refreshLinks();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo crear el enlace');
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async () => {
    if (!activeJoinUrl) return;
    try {
      await navigator.clipboard.writeText(activeJoinUrl);
      toast.success('Enlace copiado');
    } catch {
      toast.error('No se pudo copiar');
    }
  };

  const handleRevoke = async (linkId: string) => {
    if (!window.confirm('¿Revocar este QR? Dejará de funcionar al instante.')) return;
    try {
      await revokeWorkerInviteLinkRequest(linkId);
      toast.success('Enlace revocado');
      if (activeJoinUrl) setActiveJoinUrl('');
      await refreshLinks();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo revocar');
    }
  };

  const qrSrc = activeJoinUrl ? buildWorkerJoinQrImageUrl(activeJoinUrl, 260) : '';

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800 sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">QR de invitación</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Por centro: el trabajador se registra y entra solo
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
              {hrCopy.inviteWorkCenterLabel} <span className="text-red-400">*</span>
            </label>
            <select
              value={workCenterId}
              onChange={(e) => setWorkCenterId(e.target.value)}
              disabled={storesLoading}
              className="w-full rounded-xl border-2 border-gray-200 bg-white px-3 py-2.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            >
              <option value="">
                {storesLoading ? hrCopy.inviteWorkCentersLoading : hrCopy.inviteWorkCenterPlaceholder}
              </option>
              {storeOptions.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
              Función <span className="text-red-400">*</span>
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full rounded-xl border-2 border-gray-200 bg-white px-3 py-2.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            >
              {roleOptions.map((r) => (
                <option key={r.id} value={r.id}>
                  {getInviteRoleDisplayLabel(r.id, businessType)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
              Horario (opcional)
            </label>
            <select
              value={scheduleTemplateId}
              onChange={(e) => setScheduleTemplateId(e.target.value)}
              className="w-full rounded-xl border-2 border-gray-200 bg-white px-3 py-2.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            >
              <option value="">Sin horario por ahora</option>
              {shiftTemplates.map((t) => (
                <option key={t._id} value={t._id}>{t.name}</option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={creating || !workCenterId}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
            Generar QR
          </button>

          {activeJoinUrl ? (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-4 dark:border-indigo-900 dark:bg-indigo-950/30">
              <p className="text-xs font-semibold text-indigo-800 dark:text-indigo-200 mb-3 text-center">
                {activeTokenMeta?.workCenterName || 'Centro'} · {activeTokenMeta?.role || role}
              </p>
              <div className="flex justify-center mb-3">
                <img
                  src={qrSrc}
                  alt="Código QR de invitación"
                  className="h-[260px] w-[260px] rounded-lg bg-white p-2"
                />
              </div>
              <button
                type="button"
                onClick={() => void handleCopy()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-white px-3 py-2 text-sm font-semibold text-indigo-800 hover:bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-100"
              >
                <Copy className="w-4 h-4" />
                Copiar enlace
              </button>
              <p className="mt-2 text-[11px] text-center text-indigo-700/80 dark:text-indigo-300/80 break-all">
                {activeJoinUrl}
              </p>
            </div>
          ) : null}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Enlaces activos</p>
              {loadingLinks ? <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" /> : null}
            </div>
            {links.length === 0 ? (
              <p className="text-sm text-gray-500">Aún no hay QR activos.</p>
            ) : (
              <ul className="space-y-2">
                {links.map((link) => (
                  <li
                    key={link.link_id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-gray-200 px-3 py-2 dark:border-gray-700"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {link.workCenterName || 'Centro'} · {link.role}
                      </p>
                      <p className="text-[11px] text-gray-400">
                        Usos: {link.useCount}
                        {link.maxUses != null ? ` / ${link.maxUses}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleRevoke(link.link_id)}
                      className="rounded-lg p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
                      title="Revocar"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
