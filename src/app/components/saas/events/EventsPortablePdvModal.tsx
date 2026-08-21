/**
 * Alta simple de PDV portátil (eventos): nombre + dirección → crear → mostrar código TPV.
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, Copy, Loader2, X } from 'lucide-react';
import { useModalClose } from '../../../hooks/useModalClose';
import { createWorkCenter, type EventsPdvKind } from '../../../lib/workCentersApi';
import {
  ensureDeliveryPdvForWorkCenter,
  ensureTabletCodesForPointsOfSale,
  type PointOfSale,
} from '../../../lib/deliveryApi';
import {
  notifyDeliveryWorkCentersChanged,
  resolveBusinessScopeId,
} from '../../../lib/deliverySetup';
import {
  VERTIAL_BTN_PRIMARY,
  VERTIAL_BTN_SECONDARY,
  VERTIAL_FOCUS_RING,
  VERTIAL_SURFACE,
} from '../../../lib/vertialUiTokens';

const inputClass =
  `w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 ${VERTIAL_FOCUS_RING}`;

type Props = {
  open: boolean;
  userId: string;
  business: { business_id?: string; id?: string; name?: string } | null;
  onClose: () => void;
  onCreated?: (pdv: PointOfSale) => void;
  /** Prefill: fijo o temporal. */
  defaultKind?: EventsPdvKind;
};

export function EventsPortablePdvModal({
  open,
  userId,
  business,
  onClose,
  onCreated,
  defaultKind = 'fixed',
}: Props) {
  useModalClose(open, onClose);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [kind, setKind] = useState<EventsPdvKind>(defaultKind);
  const [saving, setSaving] = useState(false);
  const [createdCode, setCreatedCode] = useState('');
  const [createdName, setCreatedName] = useState('');

  useEffect(() => {
    if (!open) return;
    setName('');
    setAddress('');
    setCity('');
    setPostalCode('');
    setKind(defaultKind);
    setSaving(false);
    setCreatedCode('');
    setCreatedName('');
  }, [open, defaultKind]);

  if (!open) return null;

  const handleCreate = async () => {
    const cleanName = name.trim();
    const cleanAddr = address.trim();
    if (!cleanName) {
      toast.error('Indica el nombre del PDV');
      return;
    }
    if (cleanAddr.length < 5) {
      toast.error('Indica una dirección (mín. 5 caracteres)');
      return;
    }
    if (!userId) {
      toast.error('Sesión no válida');
      return;
    }

    setSaving(true);
    try {
      const businessId = resolveBusinessScopeId(business);
      const wc = await createWorkCenter(userId, {
        name: cleanName,
        centerType: 'punto_de_venta',
        ownership: 'propiedad',
        active: true,
        address: cleanAddr,
        city: city.trim(),
        postalCode: postalCode.trim(),
        expectedStaffCount: 1,
        businessId: businessId || undefined,
        eventsPdvKind: kind,
      });

      let pdv = await ensureDeliveryPdvForWorkCenter(userId, wc, {
        business: business as { members?: { user_id?: string }[]; business_id?: string; id?: string } | null,
        pdvName: cleanName,
      });
      if (!pdv) {
        throw new Error('No se pudo crear el PDV de caja');
      }
      const [withTablet] = await ensureTabletCodesForPointsOfSale(userId, [pdv]);
      pdv = withTablet ?? pdv;
      const code = String(pdv.terminalCode || '').trim().toUpperCase();
      if (!code) {
        throw new Error('PDV creado, pero no se generó el código TPV');
      }

      setCreatedName(cleanName);
      setCreatedCode(code);
      notifyDeliveryWorkCentersChanged(businessId);
      onCreated?.(pdv);
      toast.success(kind === 'fixed' ? 'PDV fijo creado' : 'PDV temporal creado');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo crear el PDV');
    } finally {
      setSaving(false);
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(createdCode);
      toast.success('Código copiado');
    } catch {
      toast.error('No se pudo copiar');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="events-portable-pdv-title"
        className={`${VERTIAL_SURFACE} w-full sm:max-w-md max-h-[92vh] flex flex-col rounded-t-2xl sm:rounded-2xl shadow-xl`}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-stone-100 dark:border-stone-800 shrink-0">
          <div>
            <h2 id="events-portable-pdv-title" className="text-base font-bold text-stone-900 dark:text-stone-100">
              {createdCode ? 'PDV listo' : 'Crear PDV portátil'}
            </h2>
            <p className="text-xs text-stone-500 mt-0.5">
              {createdCode
                ? 'Usa este código en la tablet TPV'
                : 'Elige fijo o temporal. Al crear verás el código TPV.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
          {createdCode ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40">
                <Check className="w-6 h-6" strokeWidth={2.5} />
              </div>
              <div>
                <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">{createdName}</p>
                <p className="text-[11px] text-stone-500 mt-1">Código TPV de la tablet</p>
              </div>
              <p className="text-3xl font-bold tracking-[0.2em] tabular-nums text-[#2563EB]">
                {createdCode}
              </p>
              <button type="button" onClick={() => void copyCode()} className={`${VERTIAL_BTN_SECONDARY} w-full`}>
                <Copy className="w-4 h-4" />
                Copiar código
              </button>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <span className="text-xs font-medium text-stone-500">Tipo</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setKind('fixed')}
                    className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors ${
                      kind === 'fixed'
                        ? 'border-[#2563EB] bg-blue-50 text-[#2563EB] dark:bg-blue-950/40'
                        : 'border-stone-200 text-stone-600 dark:border-stone-700 dark:text-stone-300'
                    }`}
                  >
                    Evento fijo
                  </button>
                  <button
                    type="button"
                    onClick={() => setKind('temporary')}
                    className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors ${
                      kind === 'temporary'
                        ? 'border-[#2563EB] bg-blue-50 text-[#2563EB] dark:bg-blue-950/40'
                        : 'border-stone-200 text-stone-600 dark:border-stone-700 dark:text-stone-300'
                    }`}
                  >
                    Temporal
                  </button>
                </div>
              </div>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-stone-500">Nombre del PDV</span>
                <input
                  className={inputClass}
                  placeholder="Ej: Equipo móvil 1, Catering norte…"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-stone-500">Dirección</span>
                <input
                  className={inputClass}
                  placeholder="Calle, número…"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-stone-500">Ciudad</span>
                  <input
                    className={inputClass}
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-stone-500">CP</span>
                  <input
                    className={inputClass}
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                  />
                </label>
              </div>
            </>
          )}
        </div>

        <div className="shrink-0 flex gap-2 px-4 py-3 border-t border-stone-100 dark:border-stone-800">
          {createdCode ? (
            <button type="button" onClick={onClose} className={`${VERTIAL_BTN_PRIMARY} flex-1`}>
              Listo
            </button>
          ) : (
            <>
              <button type="button" onClick={onClose} className={`${VERTIAL_BTN_SECONDARY} flex-1`} disabled={saving}>
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleCreate()}
                className={`${VERTIAL_BTN_PRIMARY} flex-1`}
                disabled={saving}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Crear
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
