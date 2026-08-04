import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../../../../context/AuthContext';
import { downloadDeliveryActa } from '../../../../lib/deliveryActaPdfGenerator';
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
import { CompraventaSplitModuleShell } from '../CompraventaSplitModuleShell';
import type { EntregaChecklistKey, EntregaListItem } from './entregasListData';

export function EntregasModuleShell() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
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

  // Deep-link desde Ventas: ?saleId=
  useEffect(() => {
    const saleId = searchParams.get('saleId');
    if (!saleId || entregas.length === 0) return;
    if (entregas.some((e) => e.id === saleId)) {
      setSelectedId(saleId);
    }
    const next = new URLSearchParams(searchParams);
    next.delete('saleId');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, entregas]);

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
        try {
          downloadDeliveryActa(selectedRecord);
          toast.success('Acta de entrega descargada');
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'No se pudo generar el acta');
        }
        return;
      }

      if (actionId === 'deliver') {
        const checklist = selectedEntrega?.checklist || {};
        const required: EntregaChecklistKey[] = [
          'documentationReady',
          'keysDelivered',
          'clientSignature',
        ];
        const missing = required.filter((key) => !checklist[key]);
        if (missing.length > 0) {
          toast.error(
            'Completa el checklist mínimo (documentación, llaves y firma) antes de marcar entregado',
          );
          return;
        }
        setActionLoading(true);
        try {
          const saved = await markSaleDelivered(userId, selectedRecord);
          setSalesRecords((prev) => prev.map((s) => (s.id === saved.id ? saved : s)));
          try {
            downloadDeliveryActa(saved);
          } catch {
            /* acta opcional si falla PDF */
          }
          toast.success('Entrega registrada — operación cerrada');
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'No se pudo marcar como entregado');
        } finally {
          setActionLoading(false);
        }
      }
    },
    [selectedRecord, selectedEntrega, userId, navigate],
  );

  return (
    <CompraventaSplitModuleShell
      title="Entregas"
      subtitle="Último paso del ciclo: entrega del vehículo al cliente"
      headerBelow={
        selectedEntrega ? (
          <EntregasDetailActionBar
            showActions
            disabled={actionLoading || loading}
            onAction={handleAction}
          />
        ) : null
      }
      listPanel={(
        <EntregasListPanel
          entregas={entregas}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      )}
      detailPanel={(
        <EntregasDetailPanel
          entrega={selectedEntrega}
          checklistDisabled={actionLoading || loading}
          onToggleChecklist={handleToggleChecklist}
        />
      )}
    />
  );
}
