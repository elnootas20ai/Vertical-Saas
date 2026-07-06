import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  SAAS__CreateSaleModal,
  type SaleTeamMemberOption,
} from '../../../design-system/SAAS__CreateSaleModal';
import { useApp } from '../../../../context/AppContext';
import { useAuth } from '../../../../context/AuthContext';
import { createSaleInCouch } from '../../../../lib/salesApi';
import type { SaleStage } from '../../../../lib/salesTypes';
import {
  filterSalesForWorker,
  isWorkerAccount,
  loadCompraventaSales,
  mapSaleToVenta,
  updateSaleStage,
  vehicleExpensesTotal,
} from '../../../../lib/compraventaSalesFlow';
import { syncVehicleWithSale } from '../../../../lib/vehicleSaleSync';
import { VentasListPanel } from './VentasListPanel';
import { VentasDetailPanel } from './VentasDetailPanel';
import { VentasNewSaleButton } from './VentasDetailActionBar';
import type { VentaListItem } from './ventasListData';

export function VentasModuleShell() {
  const navigate = useNavigate();
  const { user, listUsers } = useAuth();
  const { vehicles, clients, addClient } = useApp();
  const userId = user?.user_id || user?.userId || user?._id || '';
  const userFullName = user?.fullName?.trim() || '';
  const isWorker = isWorkerAccount(user);

  const [teamMemberOptions, setTeamMemberOptions] = useState<SaleTeamMemberOption[]>([]);
  const [salesRecords, setSalesRecords] = useState<Awaited<ReturnType<typeof loadCompraventaSales>>>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const vehicleExpensesById = useMemo(() => {
    const map: Record<string, number> = {};
    for (const v of vehicles ?? []) {
      map[v.id] = vehicleExpensesTotal(v.associatedCosts);
    }
    return map;
  }, [vehicles]);

  useEffect(() => {
    listUsers()
      .then((users) => {
        const options = users
          .filter((u) => u.fullName)
          .map((u) => ({
            id: u.user_id || u.id || '',
            name: u.fullName,
          }))
          .filter((option) => option.id && option.name);
        if (options.length > 0) setTeamMemberOptions(options);
      })
      .catch(() => {});
  }, [listUsers]);

  const responsableOptions = useMemo(() => {
    if (teamMemberOptions.length === 0) {
      return userId && userFullName ? [{ id: userId, name: userFullName }] : [];
    }
    if (!userId || !userFullName) return teamMemberOptions;
    const currentIndex = teamMemberOptions.findIndex(
      (member) =>
        member.id === userId || member.name.trim().toLowerCase() === userFullName.toLowerCase(),
    );
    if (currentIndex <= 0) return teamMemberOptions;
    const current = teamMemberOptions[currentIndex];
    return [current, ...teamMemberOptions.filter((_, index) => index !== currentIndex)];
  }, [teamMemberOptions, userId, userFullName]);

  const visibleSalesRecords = useMemo(() => {
    if (!isWorker) return salesRecords;
    return filterSalesForWorker(salesRecords, userId, userFullName);
  }, [salesRecords, isWorker, userId, userFullName]);

  const sales: VentaListItem[] = useMemo(
    () =>
      visibleSalesRecords.map((sale) =>
        mapSaleToVenta(sale, vehicleExpensesById[sale.vehicleId] ?? 0),
      ),
    [visibleSalesRecords, vehicleExpensesById],
  );

  const selectedSale = useMemo(
    () => sales.find((s) => s.id === selectedId) ?? null,
    [sales, selectedId],
  );

  const selectedRecord = useMemo(
    () => visibleSalesRecords.find((s) => s.id === selectedId) ?? null,
    [visibleSalesRecords, selectedId],
  );

  const loadSales = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const rows = await loadCompraventaSales(userId);
      setSalesRecords(rows);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudieron cargar las ventas');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadSales();
  }, [loadSales]);

  const handleCreateSale = useCallback(
    async (formData: {
      vehicleId: string;
      clientId: string;
      clientName: string;
      clientEmail: string;
      clientPhone: string;
      stage: SaleStage;
      totalPrice: string;
      depositPaid: string;
      expectedDelivery: string;
      responsible: string;
      responsibleId?: string;
      paymentMethod: string;
      operationType: string;
      notes: string;
      workCenterId?: string;
      workCenterName?: string;
    }) => {
      const vehicle = vehicles?.find((item) => item.id === formData.vehicleId);
      const client = clients?.find((item) => item.id === formData.clientId);
      if (!vehicle) throw new Error('Selecciona un vehículo válido');

      const totalPrice = Number(formData.totalPrice || 0);
      const depositPaid = Number(formData.depositPaid || 0);
      const financingAmount =
        formData.paymentMethod === 'Financiación'
          ? Math.max(0, totalPrice - depositPaid)
          : 0;

      const responsibleId = formData.responsibleId || (isWorker ? userId : '');
      const responsibleName = formData.responsible || userFullName || 'Equipo comercial';

      const created = await createSaleInCouch(userId, {
        vehicleId: vehicle.id,
        vehicleName: `${vehicle.brand} ${vehicle.model}`.trim(),
        vehiclePlate: vehicle.registrationPlate,
        vehicleYear: vehicle.year,
        vehicleMileage: vehicle.mileage,
        vehicleFuel: vehicle.fuelType || '',
        purchasePrice: vehicle.purchasePrice,
        clientId: client?.id || formData.clientId,
        clientName: client?.name || formData.clientName,
        clientPhone: client?.phone || formData.clientPhone,
        clientEmail: client?.email || formData.clientEmail,
        stage: formData.stage,
        totalPrice,
        depositPaid,
        financingAmount,
        paymentMethod: formData.paymentMethod,
        operationType: formData.operationType,
        expectedDelivery: formData.expectedDelivery,
        responsible: responsibleName,
        responsibleId: responsibleId || undefined,
        notes: formData.notes,
        workCenterId: formData.workCenterId,
        workCenterName: formData.workCenterName,
      });

      await syncVehicleWithSale(userId, created).catch(() => undefined);
      setSalesRecords((prev) => [created, ...prev]);
      setSelectedId(created.id);
      toast.success('Venta registrada');
    },
    [userId, vehicles, clients, userFullName, isWorker],
  );

  const handleCreateClient = useCallback(
    async (payload: { name: string; email: string; phone: string }) =>
      addClient({
        ...payload,
        status: 'active',
        responsible: userFullName || 'Equipo comercial',
        notes: 'Creado desde módulo Ventas',
      }),
    [addClient, userFullName],
  );

  const handleAction = useCallback(
    async (actionId: 'edit' | 'reserve' | 'confirm' | 'deliver' | 'cancel') => {
      if (!selectedRecord || !userId) return;

      if (actionId === 'edit' || actionId === 'cancel') {
        navigate(`/saas/sales/${selectedRecord.id}`);
        return;
      }

      setActionLoading(true);
      try {
        if (actionId === 'reserve') {
          const saved = await updateSaleStage(userId, selectedRecord, 'reserved', 'Reserva desde módulo Ventas');
          setSalesRecords((prev) => prev.map((s) => (s.id === saved.id ? saved : s)));
          toast.success('Venta pasada a reserva');
          return;
        }
        if (actionId === 'confirm') {
          const saved = await updateSaleStage(userId, selectedRecord, 'sold', 'Venta confirmada desde módulo Ventas');
          setSalesRecords((prev) => prev.map((s) => (s.id === saved.id ? saved : s)));
          toast.success('Venta confirmada — vehículo marcado como vendido');
          return;
        }
        if (actionId === 'deliver') {
          navigate('/saas/vertical/compraventa/entregas');
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'No se pudo actualizar la venta');
      } finally {
        setActionLoading(false);
      }
    },
    [selectedRecord, userId, navigate],
  );

  return (
    <div className="flex min-h-[calc(100dvh-7.5rem)] flex-col overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-950 md:min-h-[calc(100dvh-6.5rem)]">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200/80 px-4 py-3 dark:border-gray-800 md:px-5">
        <div className="min-w-0">
          <h1 className="text-base font-semibold tracking-tight text-gray-900 dark:text-gray-100">
            Ventas
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Reservas, ventas y entregas de vehículos
          </p>
        </div>
        <VentasNewSaleButton disabled={loading || actionLoading} onClick={() => setModalOpen(true)} />
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)]">
        <VentasListPanel
          sales={sales}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        <VentasDetailPanel
          sale={selectedSale}
          actionsDisabled={actionLoading}
          onAction={handleAction}
        />
      </div>

      <SAAS__CreateSaleModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreate={handleCreateSale}
        onCreateClient={handleCreateClient}
        onAddVehicle={() => {
          setModalOpen(false);
          navigate('/saas/vehicles?quickAdd=1');
        }}
        vehicles={vehicles || []}
        clients={clients || []}
        teamMemberOptions={responsableOptions}
        existingSales={visibleSalesRecords}
      />
    </div>
  );
}
