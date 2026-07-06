import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../../../../context/AuthContext';
import {
  filterSalesForWorker,
  isWorkerAccount,
  isSaleEligibleForEntrega,
  loadCompraventaSales,
  mapSaleToEntrega,
  markSaleDelivered,
  toggleEntregaChecklistItem,
} from '../../../../lib/compraventaSalesFlow';
import type { SaleRecord } from '../../../../lib/salesTypes';
import { EntregasListPanel } from './EntregasListPanel';
import { EntregasDetailPanel } from './EntregasDetailPanel';
import { EntregasDetailActionBar, type EntregaActionId } from './EntregasDetailActionBar';
import type { EntregaChecklistKey, EntregaListItem } from './entregasListData';

export function EntregasModuleShell() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.user_id || user?.userId || user?._id || '';
  const userFullName = user?.fullName?.trim() || '';
  const isWorker = isWorkerAccount(user);

  const [salesRecords, setSalesRecords] = useState<SaleRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const visibleSalesRecords = useMemo(() => {
    if (!isWorker) return salesRecords;
    return filterSalesForWorker(salesRecords, userId, userFullName);
  }, [salesRecords, isWorker, userId, userFullName]);

  const entregas: EntregaListItem[] = useMemo(() => {
    return visibleSalesRecords
      .filter(isSaleEligibleForEntrega)
      .map(mapSaleToEntrega)
      .sort((a, b) => String(a.expectedDate).localeCompare(String(b.expectedDate)));
  }, [visibleSalesRecords]);

  const selectedEntrega = useMemo(
    () => entregas.find((e) => e.id === selectedId) ?? null,
    [entregas, selectedId],
  );

  const selectedRecord = useMemo(
    () => visibleSalesRecords.find((s) => s.id === selectedId) ?? null,
    [visibleSalesRecords, selectedId],
  );

  const loadEntregas = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const rows = await loadCompraventaSales(userId);
      setSalesRecords(rows);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudieron cargar las entregas');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadEntregas();
  }, [loadEntregas]);

  const handleToggleChecklist = useCallback(
    async (key: EntregaChecklistKey, checked: boolean) => {
      if (!userId || !selectedRecord) return;
      setActionLoading(true);
      try {
        const saved = await toggleEntregaChecklistItem(userId, selectedRecord, key, checked);
        setSalesRecords((prev) => prev.map((s) => (s.id === saved.id ? saved : s)));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'No se pudo actualizar el checklist');
      } finally {
        setActionLoading(false);
      }
    },
    [userId, selectedRecord],
  );

  const handleAction = useCallback(
    async (actionId: EntregaActionId) => {
      if (!selectedRecord || !userId) return;

      if (actionId === 'edit' || actionId === 'prepare') {
        navigate(`/saas/sales/${selectedRecord.id}`);
        return;
      }

      if (actionId === 'print') {
        navigate(`/saas/documents?vehicleId=${encodeURIComponent(selectedRecord.vehicleId)}`);
        return;
      }

      if (actionId === 'deliver') {
        setActionLoading(true);
        try {
          const saved = await markSaleDelivered(userId, selectedRecord);
          setSalesRecords((prev) => prev.map((s) => (s.id === saved.id ? saved : s)));
          toast.success('Entrega registrada — operación cerrada');
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'No se pudo marcar como entregado');
        } finally {
          setActionLoading(false);
        }
      }
    },
    [selectedRecord, userId, navigate],
  );

  return (
    <div className="flex min-h-[calc(100dvh-7.5rem)] flex-col overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-950 md:min-h-[calc(100dvh-6.5rem)]">
      <div className="shrink-0 border-b border-gray-200/80 dark:border-gray-800">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-5">
          <div className="min-w-0">
            <h1 className="text-base font-semibold tracking-tight text-gray-900 dark:text-gray-100">
              Entregas
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Último paso del ciclo: entrega del vehículo al cliente
            </p>
          </div>
        </div>
        {selectedEntrega ? (
          <EntregasDetailActionBar
            showActions
            disabled={actionLoading || loading}
            onAction={handleAction}
          />
        ) : null}
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)]">
        <EntregasListPanel
          entregas={entregas}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        <EntregasDetailPanel
          entrega={selectedEntrega}
          checklistDisabled={actionLoading || loading}
          onToggleChecklist={handleToggleChecklist}
        />
      </div>
    </div>
  );
}
