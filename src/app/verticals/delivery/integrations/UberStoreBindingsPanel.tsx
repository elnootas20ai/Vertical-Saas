import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDestroyModal } from '../../../components/saas/ConfirmDestroyModal';
import {
  VERTIAL_BTN_DANGER,
  VERTIAL_BTN_PRIMARY,
  VERTIAL_BTN_SECONDARY,
} from '../../../lib/vertialUiTokens';
import {
  activateUberEatsPosRequest,
  deleteUberBindingRequest,
  getUberBindingOptionsRequest,
  listUberBindingsRequest,
  pushUberEatsMenuRequest,
  saveUberBindingRequest,
  setUberEatsStoreStatusRequest,
  type DeliveryIntegrations,
  type UberEatsStoreOption,
  type UberBindingOption,
  type UberPdvBindingOption,
  type UberStoreBinding,
} from '../../../lib/webApi';

interface Props {
  businessId: string;
  stores: UberEatsStoreOption[];
  onIntegrations?: (integrations: DeliveryIntegrations) => void;
}

interface BindingDraft {
  brandId: string;
  salesPointId: string;
  defaultPrepMinutes: number;
}

export function UberStoreBindingsPanel({
  businessId,
  stores,
  onIntegrations,
}: Props) {
  const [bindings, setBindings] = useState<UberStoreBinding[]>([]);
  const [brands, setBrands] = useState<UberBindingOption[]>([]);
  const [pdvs, setPdvs] = useState<UberPdvBindingOption[]>([]);
  const [drafts, setDrafts] = useState<Record<string, BindingDraft>>({});
  const [newStoreId, setNewStoreId] = useState('');
  const [newBrandId, setNewBrandId] = useState('');
  const [newPdvId, setNewPdvId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [pendingDelete, setPendingDelete] = useState<UberStoreBinding | null>(null);

  const load = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const [bindingResult, optionResult] = await Promise.all([
        listUberBindingsRequest(businessId),
        getUberBindingOptionsRequest(businessId),
      ]);
      const nextBindings = bindingResult.bindings || [];
      const nextBrands = [...(optionResult.brands || [])];
      const nextPdvs = [...(optionResult.pdvs || [])];
      for (const binding of nextBindings) {
        if (binding.brandId && !nextBrands.some((brand) => brand.id === binding.brandId)) {
          nextBrands.push({
            id: binding.brandId,
            name: binding.brandName || 'Marca vinculada',
          });
        }
        if (binding.salesPointId && !nextPdvs.some((pdv) => pdv.id === binding.salesPointId)) {
          nextPdvs.push({
            id: binding.salesPointId,
            name: binding.salesPointName || 'PDV vinculado',
            code: '',
            workCenterId: binding.workCenterId || '',
          });
        }
      }
      setBindings(nextBindings);
      setBrands(nextBrands);
      setPdvs(nextPdvs);
      setDrafts(Object.fromEntries(nextBindings.map((binding) => [
        binding.storeId,
        {
          brandId: binding.brandId,
          salesPointId: binding.salesPointId,
          defaultPrepMinutes: binding.defaultPrepMinutes || 20,
        },
      ])));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudieron cargar las tiendas Uber');
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    void load();
  }, [load]);

  const availableStores = useMemo(
    () => stores.filter((store) => !bindings.some((binding) => binding.storeId === store.storeId)),
    [bindings, stores],
  );

  const save = async (storeId: string, storeName: string, draft: BindingDraft) => {
    if (!draft.brandId || !draft.salesPointId) {
      toast.error('Elige marca y PDV');
      return false;
    }
    setBusyId(storeId);
    try {
      const result = await saveUberBindingRequest(businessId, {
        storeId,
        storeName,
        brandId: draft.brandId,
        salesPointId: draft.salesPointId,
        defaultPrepMinutes: draft.defaultPrepMinutes,
      });
      if (result.integrations) onIntegrations?.(result.integrations);
      toast.success('Tienda Uber asociada');
      await load();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar la asociación');
      return false;
    } finally {
      setBusyId('');
    }
  };

  const remove = async (binding: UberStoreBinding) => {
    setBusyId(binding.storeId);
    try {
      const result = await deleteUberBindingRequest(businessId, binding.storeId);
      if (result.integrations) onIntegrations?.(result.integrations);
      setBindings(result.bindings || []);
      setPendingDelete(null);
      toast.success('Tienda desvinculada');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo desvincular');
    } finally {
      setBusyId('');
    }
  };

  const runStoreAction = async (
    binding: UberStoreBinding,
    action: 'pos' | 'menu' | 'status',
  ) => {
    setBusyId(binding.storeId);
    try {
      let result: { integrations?: DeliveryIntegrations };
      if (action === 'pos') {
        result = await activateUberEatsPosRequest(businessId, binding.storeId);
        toast.success('POS Uber activado');
      } else if (action === 'menu') {
        result = await pushUberEatsMenuRequest(businessId, binding.storeId);
        toast.success('Catálogo de la marca publicado');
      } else {
        const online = String(binding.lastStoreStatus || '').toUpperCase() === 'ONLINE';
        result = await setUberEatsStoreStatusRequest(
          businessId,
          online ? 'PAUSED' : 'ONLINE',
          { storeId: binding.storeId, reason: online ? 'Paused by Vertial' : 'Opened by Vertial' },
        );
        toast.success(online ? 'Tienda Uber pausada' : 'Tienda Uber online');
      }
      if (result.integrations) onIntegrations?.(result.integrations);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falló la acción en Uber');
    } finally {
      setBusyId('');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-xs text-stone-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando tiendas vinculadas…
      </div>
    );
  }

  return (
    <>
    <section className="space-y-3 rounded-xl border border-stone-200 bg-stone-50/70 p-3 dark:border-stone-800 dark:bg-stone-900/40">
      <div>
        <h3 className="text-xs font-bold text-stone-900 dark:text-stone-100">Tiendas, marcas y PDV</h3>
        <p className="mt-0.5 text-[10px] text-stone-500">
          Cada tienda Uber publica una marca y entrega sus pedidos a un PDV concreto.
        </p>
      </div>

      {availableStores.length > 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3 dark:border-blue-900 dark:bg-blue-950/20">
          <p className="text-xs font-bold text-blue-900 dark:text-blue-200">
            {bindings.length === 0 ? 'Vincular la primera tienda Uber' : 'Vincular otra tienda Uber'}
          </p>
          <p className="mt-0.5 text-[10px] text-blue-700 dark:text-blue-300">
            Elige los tres datos y guarda una sola vez.
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <label>
              <span className="mb-1 block text-[9px] font-bold uppercase text-stone-500">Tienda Uber</span>
              <select value={newStoreId} onChange={(event) => setNewStoreId(event.target.value)} className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-xs dark:border-blue-800 dark:bg-stone-950">
                <option value="">Selecciona tienda</option>
                {availableStores.map((store) => (
                  <option key={store.storeId} value={store.storeId}>
                    {store.name} · {store.storeId.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="mb-1 block text-[9px] font-bold uppercase text-stone-500">Marca Vertial</span>
              <select value={newBrandId} onChange={(event) => setNewBrandId(event.target.value)} className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-xs dark:border-blue-800 dark:bg-stone-950">
                <option value="">Selecciona marca</option>
                {brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
              </select>
            </label>
            <label>
              <span className="mb-1 block text-[9px] font-bold uppercase text-stone-500">PDV receptor</span>
              <select value={newPdvId} onChange={(event) => setNewPdvId(event.target.value)} className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-xs dark:border-blue-800 dark:bg-stone-950">
                <option value="">Selecciona PDV</option>
                {pdvs.map((pdv) => (
                  <option key={pdv.id} value={pdv.id}>
                    {pdv.name}{pdv.code ? ` · ${pdv.code}` : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            onClick={() => {
              const store = availableStores.find((entry) => entry.storeId === newStoreId);
              if (!store) {
                toast.error('Elige la tienda Uber');
                return;
              }
              void save(store.storeId, store.name, {
                brandId: newBrandId,
                salesPointId: newPdvId,
                defaultPrepMinutes: 20,
              }).then((saved) => {
                if (!saved) return;
                setNewStoreId('');
                setNewBrandId('');
                setNewPdvId('');
              });
            }}
            disabled={Boolean(busyId) || !newStoreId || !newBrandId || !newPdvId}
            className={`${VERTIAL_BTN_PRIMARY} mt-3 px-3 text-xs`}
          >
            <Plus className="h-3.5 w-3.5" /> Vincular tienda
          </button>
        </div>
      )}

      {bindings.length === 0 ? (
        <p className="rounded-lg border border-dashed border-stone-300 px-3 py-4 text-center text-[11px] text-stone-500 dark:border-stone-700">
          Todavía no hay tiendas Uber vinculadas.
        </p>
      ) : (
        <div className="space-y-2">
          {bindings.map((binding) => {
            const draft = drafts[binding.storeId] || {
              brandId: binding.brandId,
              salesPointId: binding.salesPointId,
              defaultPrepMinutes: binding.defaultPrepMinutes || 20,
            };
            const busy = busyId === binding.storeId;
            return (
              <div key={binding.storeId} className="rounded-xl border border-stone-200 bg-white p-2.5 dark:border-stone-800 dark:bg-stone-950">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-stone-900 dark:text-stone-100">
                      {binding.storeName || binding.storeId}
                    </p>
                    <p className="truncate font-mono text-[9px] text-stone-400">{binding.storeId}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {binding.primary && (
                      <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                        PRINCIPAL
                      </span>
                    )}
                    <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                      binding.posIntegrationEnabled
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                        : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                    }`}>
                      {binding.posIntegrationEnabled ? 'POS ACTIVO' : 'POS PENDIENTE'}
                    </span>
                  </div>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <label>
                    <span className="mb-1 block text-[9px] font-bold uppercase text-stone-500">Marca</span>
                    <select
                      value={draft.brandId}
                      onChange={(event) => setDrafts((current) => ({
                        ...current,
                        [binding.storeId]: { ...draft, brandId: event.target.value },
                      }))}
                      className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-xs dark:border-stone-700 dark:bg-stone-950"
                    >
                      <option value="">Selecciona marca</option>
                      {brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
                    </select>
                  </label>
                  <label>
                    <span className="mb-1 block text-[9px] font-bold uppercase text-stone-500">PDV</span>
                    <select
                      value={draft.salesPointId}
                      onChange={(event) => setDrafts((current) => ({
                        ...current,
                        [binding.storeId]: { ...draft, salesPointId: event.target.value },
                      }))}
                      className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-xs dark:border-stone-700 dark:bg-stone-950"
                    >
                      <option value="">Selecciona PDV</option>
                      {pdvs.map((pdv) => (
                        <option key={pdv.id} value={pdv.id}>
                          {pdv.name}{pdv.code ? ` · ${pdv.code}` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="mt-2 flex items-end justify-between gap-2">
                  <label className="w-32">
                    <span className="mb-1 block text-[9px] font-bold uppercase text-stone-500">Preparación</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={5}
                        max={180}
                        value={draft.defaultPrepMinutes}
                        onChange={(event) => setDrafts((current) => ({
                          ...current,
                          [binding.storeId]: {
                            ...draft,
                            defaultPrepMinutes: Number(event.target.value) || 20,
                          },
                        }))}
                        className="w-20 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-xs dark:border-stone-700 dark:bg-stone-950"
                      />
                      <span className="text-[10px] text-stone-500">min</span>
                    </div>
                  </label>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPendingDelete(binding)}
                      disabled={busy}
                      className={`${VERTIAL_BTN_DANGER} min-w-11 px-2`}
                      aria-label="Desvincular tienda"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void save(binding.storeId, binding.storeName, draft)}
                      disabled={busy}
                      className={`${VERTIAL_BTN_PRIMARY} px-3 text-xs`}
                    >
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      Guardar
                    </button>
                  </div>
                </div>
                {binding.brandId && binding.salesPointId && (
                  <div className="mt-2 flex flex-wrap gap-1.5 border-t border-stone-100 pt-2 dark:border-stone-800">
                    <button type="button" onClick={() => void runStoreAction(binding, 'pos')} disabled={busy} className={`${VERTIAL_BTN_PRIMARY} px-3 text-xs`}>
                      {binding.posIntegrationEnabled ? 'Verificar / reactivar POS' : 'Activar POS'}
                    </button>
                    <button type="button" onClick={() => void runStoreAction(binding, 'menu')} disabled={busy || !binding.posIntegrationEnabled} className={`${VERTIAL_BTN_SECONDARY} px-3 text-xs`}>
                      {binding.menuPushedAt ? 'Republicar catálogo' : 'Publicar catálogo'}
                    </button>
                    <button type="button" onClick={() => void runStoreAction(binding, 'status')} disabled={busy || !binding.posIntegrationEnabled} className={`px-3 text-xs ${
                      String(binding.lastStoreStatus || '').toUpperCase() === 'ONLINE'
                        ? VERTIAL_BTN_SECONDARY
                        : VERTIAL_BTN_PRIMARY
                    }`}>
                      {String(binding.lastStoreStatus || '').toUpperCase() === 'ONLINE' ? 'Pausar' : 'Poner online'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

    </section>
    <ConfirmDestroyModal
      isOpen={Boolean(pendingDelete)}
      onClose={() => {
        if (!busyId) setPendingDelete(null);
      }}
      onConfirm={async () => {
        if (pendingDelete) await remove(pendingDelete);
      }}
      title="Desvincular tienda Uber"
      description="Se elimina solo esta asociación de tienda, marca y PDV. La cuenta OAuth Uber continúa conectada."
      itemName="DESVINCULAR"
      confirmLabel="Escribe DESVINCULAR para confirmar"
      destructiveLabel="Desvincular tienda"
      isDeleting={Boolean(busyId)}
      caseInsensitive
    />
    </>
  );
}
