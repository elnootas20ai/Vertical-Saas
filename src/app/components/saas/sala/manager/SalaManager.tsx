import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { RefreshCw, Save, Eye, MonitorSmartphone, Check, Loader2, Store, ArrowRight, ExternalLink } from 'lucide-react';
import { Layout } from '../../Layout';
import { useAuth } from '../../../../context/AuthContext';
import { useBusiness } from '../../../../context/BusinessContext';
import { useActiveStoreScope } from '../../../../context/ActiveStoreScopeContext';
import { coerceSelectedPdvId } from '../../../../lib/deliveryOpsPdvSelection';
import { resolveBusinessDataUserId } from '../../../../lib/tenantUserId';
import { consumeSalaSetupPending, peekSalaSetupPending } from '../../../../lib/salaQuickSetup';
import { writeSalaTpvLaunch } from '../../../../lib/salaTpvLaunch';
import { useSalaManager } from './useSalaManager';
import { SalaQuickSetupWizard } from './SalaQuickSetupWizard';
import { SalaRoomListPanel } from './SalaRoomListPanel';
import { SalaRoomDetailPanel } from './SalaRoomDetailPanel';
import { SalaSummaryPanel } from './SalaSummaryPanel';
import { SalaCreateRoomModal } from './SalaCreateRoomModal';
import { SalaEditTableModal } from './SalaEditTableModal';
import { SalaManagerPreviewModal } from './SalaManagerPreviewModal';
import type { ExtendedDiningTable } from '../../../../lib/salaStudioTypes';
import type { SalaRoomType } from '../../../../lib/salaStudioTypes';
import { SALA_ROOM_TYPE_LABELS } from '../../../../lib/salaStudioTypes';

export function SalaManager({ setupMode = false }: { setupMode?: boolean }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentBusiness, businesses } = useBusiness();
  const { activeSalesPointId, displayLabelForActive, setActiveSalesPoint, loading: storeLoading, refresh: refreshStore, allPointsOfSale, retailWorkCenters } =
    useActiveStoreScope();
  const userId = user?.user_id || '';
  const businessId = currentBusiness?.business_id || '';
  const dataUserId = resolveBusinessDataUserId(user, currentBusiness);
  const effectiveParentPdvId = useMemo(() => {
    const pdvs = allPointsOfSale.filter((p) => p.active !== false);
    if (pdvs.length === 0) return '';
    return coerceSelectedPdvId(pdvs, activeSalesPointId) || '';
  }, [allPointsOfSale, activeSalesPointId]);
  const parentPdvId = effectiveParentPdvId;
  const setupAppliedRef = useRef(false);
  const [awaitingSetupPdv, setAwaitingSetupPdv] = useState(
    () => setupMode && Boolean(peekSalaSetupPending(businessId)),
  );

  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [editTable, setEditTable] = useState<ExtendedDiningTable | null>(null);

  useEffect(() => {
    if (storeLoading || !businessId || !dataUserId) return;
    const pdvs = allPointsOfSale.filter((p) => p.active !== false);
    const pdvId = coerceSelectedPdvId(pdvs, activeSalesPointId);
    if (!pdvId || activeSalesPointId === pdvId) return;
    setActiveSalesPoint(pdvId);
  }, [storeLoading, businessId, dataUserId, allPointsOfSale, activeSalesPointId, setActiveSalesPoint]);

  useEffect(() => {
    if (!setupMode || setupAppliedRef.current) return;
    const pending = consumeSalaSetupPending(businessId);
    if (!pending) return;
    setupAppliedRef.current = true;
    setActiveSalesPoint(pending);
    setAwaitingSetupPdv(true);
    void refreshStore();
  }, [setupMode, businessId, setActiveSalesPoint, refreshStore]);

  useEffect(() => {
    if (awaitingSetupPdv && parentPdvId) {
      setAwaitingSetupPdv(false);
    }
  }, [awaitingSetupPdv, parentPdvId]);

  const mgr = useSalaManager(userId, businessId, parentPdvId, currentBusiness, businesses, {
    workCenters: retailWorkCenters,
    pointsOfSale: allPointsOfSale,
  });

  const openTpv = (tpv = mgr.activeRoomTpv) => {
    const pdvId = String(tpv?.pdvId || mgr.activeRoom?.pdvId || parentPdvId || '').trim();
    if (!pdvId) {
      toast.error('Selecciona un centro de trabajo en la barra superior');
      return;
    }
    const terminalId = String(tpv?.terminalId || '').trim();
    writeSalaTpvLaunch(terminalId, pdvId);
    navigate('/saas/caja/tpv');
  };

  const handleEditRoomName = () => {
    if (!mgr.activeRoom) return;
    const name = window.prompt('Nombre de la sala', mgr.activeRoom.name);
    if (name?.trim()) mgr.updateRoom(mgr.activeRoom.id, { name: name.trim() });
  };

  const handleEditRoomType = () => {
    if (!mgr.activeRoom) return;
    const options = Object.entries(SALA_ROOM_TYPE_LABELS).map(([k, v]) => `${k}: ${v}`).join('\n');
    const picked = window.prompt(`Tipo de sala:\n${options}`, mgr.activeRoom.roomType);
    if (picked && picked in SALA_ROOM_TYPE_LABELS) {
      mgr.updateRoom(mgr.activeRoom.id, { roomType: picked as SalaRoomType });
    }
  };

  const handleDeleteRoom = () => {
    if (!mgr.activeRoom) return;
    if (window.confirm(`¿Eliminar "${mgr.activeRoom.name}" y todas sus mesas?`)) {
      mgr.deleteRoomById(mgr.activeRoom.id);
    }
  };

  if (mgr.loading || (setupMode && (storeLoading || awaitingSetupPdv))) {
    return (
      <Layout title="Sala" noPadding>
        <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
          <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
          <span className="ml-3 text-gray-500">
            {setupMode ? 'Preparando configuración de sala…' : 'Cargando…'}
          </span>
        </div>
      </Layout>
    );
  }

  if (!mgr.pdvLinked) {
    return (
      <Layout title="Sala" noPadding>
        <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-gray-50/80 p-6 dark:bg-gray-950">
          <div className="w-full max-w-lg rounded-3xl border border-gray-200/80 bg-white p-8 text-center shadow-xl dark:border-gray-800 dark:bg-gray-950">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
              <Store className="h-7 w-7" />
            </div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-50">Primero crea tu centro</h1>
            <p className="mt-2 text-sm text-gray-500">
              Las salas y mesas se configuran después, enlazadas a un único TPV por tienda.
            </p>
            <button
              type="button"
              onClick={() => navigate('/saas/settings/tienda?action=new-pdv')}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white dark:bg-white dark:text-gray-900"
            >
              Crear centro de trabajo
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  if (mgr.needsQuickSetup) {
    return (
      <Layout title="Sala" noPadding>
        <SalaQuickSetupWizard
          storeLabel={displayLabelForActive || currentBusiness?.name}
          saving={mgr.saving}
          onSubmit={mgr.applyQuickSetup}
        />
      </Layout>
    );
  }

  return (
    <Layout title="Sala" noPadding>
      <div className="relative flex h-[calc(100vh-4rem)] flex-col overflow-hidden bg-white dark:bg-gray-950">
        {/* Top bar */}
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-gray-200/80 px-5 py-3 dark:border-gray-800">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-gray-900 dark:text-gray-50">Sala</h1>
            <p className="text-xs text-gray-500">Configura mesas para el TPV</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {mgr.dirty ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200 dark:bg-amber-900/20 dark:text-amber-300">
                Cambios sin guardar
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
                <Check className="h-3 w-3" aria-hidden />
                Guardado
              </span>
            )}

            <TopBtn icon={Eye} label="Vista previa" onClick={() => setShowPreview(true)} />
            <button
              type="button"
              onClick={mgr.persist}
              disabled={mgr.saving || !mgr.dirty}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 disabled:opacity-40 dark:border-gray-700 dark:text-gray-300"
            >
              {mgr.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Guardar
            </button>
            <button
              type="button"
              onClick={() => openTpv()}
              className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-black dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
            >
              <MonitorSmartphone className="h-4 w-4" />
              Abrir TPV
              <ExternalLink className="h-3.5 w-3.5 opacity-70" />
            </button>
          </div>
        </header>

        {/* 3 columns */}
        <div className="flex min-h-0 flex-1">
          <SalaRoomListPanel
            rooms={mgr.rooms}
            activeRoomId={mgr.activeRoomId}
            statsForRoom={mgr.roomStatsFor}
            onSelect={mgr.setActiveRoomId}
            onNewRoom={() => setShowCreateRoom(true)}
          />

          <SalaRoomDetailPanel
            room={mgr.activeRoom}
            tables={mgr.activeRoomTables}
            tpv={mgr.activeRoomTpv}
            onOpenTpv={() => openTpv()}
            onEditName={handleEditRoomName}
            onEditType={handleEditRoomType}
            onDuplicate={() => mgr.activeRoom && mgr.duplicateRoomById(mgr.activeRoom.id)}
            onDelete={handleDeleteRoom}
            onTableCountChange={(count) => mgr.activeRoom && mgr.setRoomTableCount(mgr.activeRoom.id, count)}
            onEditTable={setEditTable}
            onTableSizeChange={(tableId, sizePreset) => mgr.updateTable(tableId, { sizePreset })}
            onTableCapacityChange={(tableId, capacity) => mgr.updateTable(tableId, { capacity })}
            onTableActiveChange={(tableId, active) => mgr.updateTable(tableId, { visible: active })}
            onDeleteTable={mgr.deleteTable}
            onAddTable={() => mgr.activeRoom && mgr.addTableToRoom(mgr.activeRoom.id)}
          />

          <SalaSummaryPanel
            summary={mgr.summary}
            lastModified={mgr.lastModified}
            storeTpv={mgr.storeTpv}
          />
        </div>
      </div>

      <SalaCreateRoomModal
        open={showCreateRoom}
        onClose={() => setShowCreateRoom(false)}
        onCreate={mgr.createRoomWithTables}
      />

      <SalaEditTableModal
        open={Boolean(editTable)}
        table={editTable}
        onClose={() => setEditTable(null)}
        onSave={mgr.updateTable}
        onDelete={mgr.deleteTable}
        onDuplicate={mgr.duplicateTable}
      />

      <SalaManagerPreviewModal
        open={showPreview}
        onClose={() => setShowPreview(false)}
        rooms={mgr.rooms}
        tables={mgr.tables}
      />
    </Layout>
  );
}

function TopBtn({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: typeof Save;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 disabled:opacity-40 dark:border-gray-700 dark:text-gray-300"
    >
      <Icon className="h-4 w-4" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
