import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useModalClose } from '../../hooks/useModalClose';
import {
  Building2,
  Plus,
  Trash2,
  Edit3,
  ChevronRight,
  Users,
  BarChart3,
  MapPin,
  TrendingUp,
  Package,
  Euro,
  RefreshCw,
  X,
  Check,
  AlertTriangle,
  Network,
  Store,
  UserCheck,
} from 'lucide-react';
import { Layout } from '../../components/saas/Layout';
import { useGroup } from '../../context/GroupContext';
import { useBusiness } from '../../context/BusinessContext';
import { useAuth } from '../../context/AuthContext';
import { isWorkerAccount } from '../../lib/authApi';
import type { BusinessGroup } from '../../lib/groupApi';
import type { Branch, Business } from '../../lib/businessApi';
import { toast } from 'sonner';

import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';
// ─── Tab type ─────────────────────────────────────────────────────────────────

type Tab = 'kpis' | 'businesses' | 'branches' | 'admins';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString('es-ES', { maximumFractionDigits: 0 });
}

function fmtEur(n: number) {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  icon,
  sub,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  sub?: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 p-4 flex items-start gap-3">
      <div className="rounded-lg bg-blue-50 dark:bg-blue-900/30 p-2 text-blue-600 dark:text-blue-400 shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">{label}</p>
        <p className="text-xl font-bold text-neutral-900 dark:text-white mt-0.5">{value}</p>
        {sub && <p className="text-xs text-neutral-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Create Group Modal ───────────────────────────────────────────────────────

function CreateGroupModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const { createGroup } = useGroup();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useModalClose(true, onClose);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError('');
    const result = await createGroup({ name, description });
    setSaving(false);
    if (result.success) {
      onCreated();
      onClose();
    } else {
      setError(result.error || 'Error al crear el grupo');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 dark:bg-neutral-900 rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-neutral-200 dark:border-neutral-700">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">Nuevo grupo empresarial</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Nombre del grupo <span className="text-red-500">*</span>
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Holding Coches Premium S.L."
              className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-gray-800 dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Descripción
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Descripción del grupo o holding..."
              className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-gray-800 dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
              <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
            </p>
          )}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Creando...' : 'Crear grupo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Create Branch Modal ──────────────────────────────────────────────────────

function CreateBranchModal({
  businessId,
  onClose,
  onCreated,
}: {
  businessId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { addBranch } = useGroup();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useModalClose(true, onClose);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError('');
    const result = await addBranch(businessId, { name, address, city, phone });
    setSaving(false);
    if (result.success) {
      onCreated();
      onClose();
    } else {
      setError(result.error || 'Error al crear la sede');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 dark:bg-neutral-900 rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-neutral-200 dark:border-neutral-700">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">Nueva sede</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Nombre de la sede <span className="text-red-500">*</span>
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Delegación Norte"
              className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-gray-800 dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Ciudad</label>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Madrid"
                className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-gray-800 dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Teléfono</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="91 000 0000"
                className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-gray-800 dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Dirección</label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Calle Principal 1"
              className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-gray-800 dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
              <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
            </p>
          )}
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800">
              Cancelar
            </button>
            <button type="submit" disabled={saving || !name.trim()} className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Guardando...' : 'Crear sede'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Group Detail Panel ───────────────────────────────────────────────────────

function GroupDetailPanel({ group }: { group: BusinessGroup }) {
  const {
    loadGroupKpis, groupKpis, isLoadingKpis,
    addBusinessToGroup, removeBusinessFromGroup, deleteBranch, reloadGroups,
  } = useGroup();
  const { businesses, reloadBusinesses } = useBusiness();
  const [tab, setTab] = useState<Tab>('kpis');
  const [showAddBusiness, setShowAddBusiness] = useState(false);
  const [showCreateBranch, setShowCreateBranch] = useState<string | null>(null);
  const [addingBusinessId, setAddingBusinessId] = useState('');
  const [busyBusiness, setBusyBusiness] = useState<string | null>(null);

  useEffect(() => {
    void loadGroupKpis(group.group_id);
  }, [group.group_id, loadGroupKpis]);

  const groupBusinesses = businesses.filter((b) =>
    group.business_ids.includes(b.business_id),
  );
  const availableBusinesses = businesses.filter(
    (b) => !group.business_ids.includes(b.business_id),
  );

  async function handleAddBusiness() {
    if (!addingBusinessId) return;
    setBusyBusiness(addingBusinessId);
    await addBusinessToGroup(group.group_id, addingBusinessId);
    setBusyBusiness(null);
    setShowAddBusiness(false);
    setAddingBusinessId('');
    await reloadGroups();
  }

  async function handleRemoveBusiness(businessId: string) {
    setBusyBusiness(businessId);
    await removeBusinessFromGroup(group.group_id, businessId);
    setBusyBusiness(null);
    await reloadGroups();
  }

  async function handleDeleteBranch(businessId: string, branchId: string) {
    await deleteBranch(businessId, branchId);
    await reloadBusinesses();
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'kpis', label: 'KPIs consolidados', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'businesses', label: `Empresas (${group.business_ids.length})`, icon: <Building2 className="w-4 h-4" /> },
    { id: 'branches', label: 'Sedes', icon: <Store className="w-4 h-4" /> },
    { id: 'admins', label: `Admins (${group.admins.length})`, icon: <UserCheck className="w-4 h-4" /> },
  ];

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      {/* Header */}
      <div className="px-6 py-5 border-b border-neutral-200 dark:border-neutral-700 flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-xl shrink-0">
          {group.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-neutral-900 dark:text-white truncate">{group.name}</h2>
          {group.description && (
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5 line-clamp-2">{group.description}</p>
          )}
          <div className="flex items-center gap-3 mt-1.5 text-xs text-neutral-400">
            <span className="flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5" />
              {group.business_ids.length} empresa{group.business_ids.length !== 1 ? 's' : ''}
            </span>
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />
              {group.admins.length} admin{group.admins.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-neutral-200 dark:border-neutral-700 px-6 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-3 text-sm font-medium border-b-2 shrink-0 transition-colors ${
              tab === t.id
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-6">

        {/* ── KPIs consolidados ─────────────────────────── */}
        {tab === 'kpis' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-neutral-900 dark:text-white">Rendimiento del grupo</h3>
              <button
                onClick={() => loadGroupKpis(group.group_id)}
                disabled={isLoadingKpis}
                className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingKpis ? 'animate-spin' : ''}`} />
                Actualizar
              </button>
            </div>

            {isLoadingKpis && (
              <div className="flex items-center justify-center py-12 text-neutral-400">
                <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                Cargando KPIs...
              </div>
            )}

            {!isLoadingKpis && groupKpis && (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                  <KpiCard label="Stock disponible" value={fmt(groupKpis.kpis.stockCount)} icon={<Package className="w-4 h-4" />} sub={`${fmt(groupKpis.kpis.totalVehicles)} total`} />
                  <KpiCard label="Ventas este mes" value={fmt(groupKpis.kpis.soldThisMonthCount)} icon={<TrendingUp className="w-4 h-4" />} />
                  <KpiCard label="Volumen de ventas" value={fmtEur(groupKpis.kpis.salesVolume)} icon={<Euro className="w-4 h-4" />} />
                  <KpiCard label="Margen total" value={fmtEur(groupKpis.kpis.marginTotal)} icon={<BarChart3 className="w-4 h-4" />} sub={`${groupKpis.kpis.marginPct}% del volumen`} />
                  <KpiCard label="Oportunidades CRM" value={fmt(groupKpis.kpis.oportunidades)} icon={<Users className="w-4 h-4" />} />
                  <KpiCard label="Cobros pendientes" value={fmtEur(groupKpis.kpis.cobrosPendientes)} icon={<Euro className="w-4 h-4" />} sub={`${fmt(groupKpis.kpis.cobrosCount)} operaciones`} />
                </div>

                {/* KPIs por empresa */}
                {groupKpis.kpisByBusiness.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-3">Desglose por empresa</h4>
                    <div className="space-y-2">
                      {groupKpis.kpisByBusiness.map((bk) => {
                        const biz = businesses.find((b) => b.business_id === bk.business_id);
                        return (
                          <div key={bk.business_id} className="bg-neutral-50 dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 p-4">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium text-sm text-neutral-900 dark:text-white">
                                {biz?.name || bk.business_id}
                              </span>
                              {biz?.city && (
                                <span className="text-xs text-neutral-400 flex items-center gap-1">
                                  <MapPin className="w-3 h-3" />
                                  {biz.city}
                                </span>
                              )}
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-center">
                              <div>
                                <p className="text-xs text-neutral-400">Stock</p>
                                <p className="text-base font-bold text-neutral-900 dark:text-white">{fmt(bk.stockCount)}</p>
                              </div>
                              <div>
                                <p className="text-xs text-neutral-400">Ventas mes</p>
                                <p className="text-base font-bold text-neutral-900 dark:text-white">{fmt(bk.soldThisMonthCount)}</p>
                              </div>
                              <div>
                                <p className="text-xs text-neutral-400">Margen</p>
                                <p className="text-base font-bold text-green-600 dark:text-green-400">{fmtEur(bk.marginTotal)}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <p className="text-xs text-neutral-400 text-right">
                  Actualizado: {new Date(groupKpis.updatedAt).toLocaleString('es-ES')}
                </p>
              </>
            )}

            {!isLoadingKpis && !groupKpis && (
              <div className="flex flex-col items-center justify-center py-12 text-neutral-400">
                <BarChart3 className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-sm">Sin datos. Añade empresas al grupo para ver KPIs consolidados.</p>
              </div>
            )}
          </div>
        )}

        {/* ── Empresas ─────────────────────────────────── */}
        {tab === 'businesses' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-neutral-900 dark:text-white">Empresas del grupo</h3>
              <AddButtonDropdown
                label="Nuevo grupo"
                onQuickAdd={() => setShowAddBusiness(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de grupo"
              />
            </div>

            {showAddBusiness && (
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800 p-4 space-y-3">
                <p className="text-sm font-medium text-blue-800 dark:text-blue-300">Vincular empresa existente</p>
                <select
                  value={addingBusinessId}
                  onChange={(e) => setAddingBusinessId(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-gray-800 dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Selecciona una empresa...</option>
                  {availableBusinesses.map((b) => (
                    <option key={b.business_id} value={b.business_id}>{b.name}</option>
                  ))}
                </select>
                {availableBusinesses.length === 0 && (
                  <p className="text-xs text-neutral-500">No hay empresas disponibles para añadir.</p>
                )}
                <div className="flex gap-2">
                  <button onClick={() => { setShowAddBusiness(false); setAddingBusinessId(''); }} className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-600 px-3 py-1.5 text-sm text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800">
                    Cancelar
                  </button>
                  <button onClick={handleAddBusiness} disabled={!addingBusinessId || !!busyBusiness} className="flex-1 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                    Vincular
                  </button>
                </div>
              </div>
            )}

            {groupBusinesses.length === 0 && !showAddBusiness && (
              <div className="flex flex-col items-center justify-center py-12 text-neutral-400">
                <Building2 className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-sm">Sin empresas. Añade la primera empresa al grupo.</p>
              </div>
            )}

            <div className="space-y-2">
              {groupBusinesses.map((b) => (
                <div key={b.business_id} className="flex items-center justify-between bg-neutral-50 dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-sm shrink-0">
                      {b.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-neutral-900 dark:text-white truncate">{b.name}</p>
                      <p className="text-xs text-neutral-400 truncate">{b.city || b.taxId || '—'}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveBusiness(b.business_id)}
                    disabled={busyBusiness === b.business_id}
                    className="ml-4 shrink-0 text-neutral-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                    title="Desvincular del grupo"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Sedes / Branches ─────────────────────────── */}
        {tab === 'branches' && (
          <div className="space-y-6">
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Las sedes son delegaciones dentro de una empresa. Cada comercial puede estar asignado a una sede específica — los jefes de grupo y administradores ven todas.
            </p>

            {groupBusinesses.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-neutral-400">
                <Store className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-sm">Añade empresas al grupo para gestionar sus sedes.</p>
              </div>
            )}

            {groupBusinesses.map((b) => (
              <div key={b.business_id} className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-neutral-400" />
                    {b.name}
                    <span className="text-xs font-normal text-neutral-400">({(b.branches || []).length} sede{(b.branches || []).length !== 1 ? 's' : ''})</span>
                  </h4>
                  <button
                    onClick={() => setShowCreateBranch(b.business_id)}
                    className="flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    <Plus className="w-3.5 h-3.5" /> Nueva sede
                  </button>
                </div>

                {showCreateBranch === b.business_id && (
                  <CreateBranchModal
                    businessId={b.business_id}
                    onClose={() => setShowCreateBranch(null)}
                    onCreated={() => void reloadBusinesses()}
                  />
                )}

                {(b.branches || []).length === 0 && (
                  <p className="text-xs text-neutral-400 pl-6">Sin sedes configuradas.</p>
                )}

                <div className="space-y-2">
                  {(b.branches || []).map((branch: Branch) => (
                    <div key={branch.branch_id} className="flex items-center justify-between bg-neutral-50 dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <MapPin className="w-4 h-4 text-neutral-400 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-neutral-900 dark:text-white">{branch.name}</p>
                          <p className="text-xs text-neutral-400">
                            {[branch.city, branch.address].filter(Boolean).join(' · ') || '—'}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteBranch(b.business_id, branch.branch_id)}
                        className="ml-4 shrink-0 text-neutral-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                        title="Eliminar sede"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Admins ───────────────────────────────────── */}
        {tab === 'admins' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-neutral-900 dark:text-white">Administradores del grupo</h3>
            </div>
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800 p-4 text-sm text-amber-800 dark:text-amber-300 flex gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Los <strong>Gerentes de Grupo</strong> pueden ver los KPIs consolidados de todas las empresas del holding, pero no pueden editar datos de empresas individuales a menos que también sean miembros de ellas.</span>
            </div>
            <div className="space-y-2">
              {group.admins.map((admin) => (
                <div key={admin.user_id} className="flex items-center gap-3 bg-neutral-50 dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 px-4 py-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                    {(admin.fullName || admin.email || 'A').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-neutral-900 dark:text-white truncate">
                      {admin.fullName || admin.email || admin.user_id}
                    </p>
                    <p className="text-xs text-neutral-400 flex items-center gap-1">
                      <UserCheck className="w-3 h-3" />
                      {admin.role}
                    </p>
                  </div>
                  {admin.user_id === group.owner_user_id && (
                    <span className="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full font-medium">
                      Propietario
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function Groups() {
  const { groups, currentGroup, switchGroup, deleteGroup, isLoading, reloadGroups } = useGroup();
  const { user } = useAuth();
  const isTenantOwner = !isWorkerAccount(user);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
    async function handleDelete(groupId: string) {
    if (!confirm('¿Eliminar este grupo empresarial? Las empresas vinculadas no se eliminarán.')) return;
    setDeletingId(groupId);
    await deleteGroup(groupId);
    setDeletingId(null);
  }

  return (
    <Layout>
      <div className="flex flex-col h-full">
        {/* Page header */}
        <div className="px-6 py-5 border-b border-neutral-200 dark:border-neutral-700 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white">
              <Network className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-neutral-900 dark:text-white">Grupos empresariales</h1>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">Gestiona holdings, sedes y KPIs consolidados</p>
            </div>
          </div>
          {isTenantOwner ? (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
          >
            <Plus className="w-4 h-4" /> Nuevo grupo
          </button>
          ) : (
            <span className="text-xs text-neutral-500 max-w-[14rem] text-right">
              Solo el creador de la cuenta puede crear grupos.
            </span>
          )}
        </div>

        {/* Content */}
        <div className="flex flex-1 min-h-0">
          {/* Sidebar — lista de grupos */}
          <div className="w-72 shrink-0 border-r border-neutral-200 dark:border-neutral-700 overflow-y-auto bg-neutral-50 dark:bg-neutral-900">
            {isLoading && (
              <div className="flex items-center justify-center py-12 text-neutral-400">
                <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                Cargando...
              </div>
            )}

            {!isLoading && groups.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center text-neutral-400">
                <Network className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Sin grupos creados</p>
                <p className="text-xs mt-1">Crea tu primer grupo empresarial o holding para consolidar KPIs de múltiples marcas.</p>
              </div>
            )}

            <div className="p-2 space-y-1">
              {groups.map((group) => (
                <div
                  key={group.group_id}
                  onClick={() => switchGroup(group.group_id)}
                  className={`group flex items-center gap-3 rounded-xl px-3 py-3 cursor-pointer transition-colors ${
                    currentGroup?.group_id === group.group_id
                      ? 'bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800'
                      : 'hover:bg-neutral-100 dark:hover:bg-neutral-800 border border-transparent'
                  }`}
                >
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-base shrink-0">
                    {group.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${
                      currentGroup?.group_id === group.group_id
                        ? 'text-blue-700 dark:text-blue-300'
                        : 'text-neutral-900 dark:text-white'
                    }`}>
                      {group.name}
                    </p>
                    <p className="text-xs text-neutral-400 flex items-center gap-1">
                      <Building2 className="w-3 h-3" />
                      {group.business_ids.length} empresa{group.business_ids.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(group.group_id); }}
                    disabled={deletingId === group.group_id}
                    className="opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-red-500 transition-all p-1 rounded shrink-0"
                    title="Eliminar grupo"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Detail */}
          {currentGroup ? (
            <GroupDetailPanel key={currentGroup.group_id} group={currentGroup} />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-neutral-400 gap-3">
              <Network className="w-12 h-12 opacity-20" />
              <p className="text-sm">Selecciona un grupo para ver sus detalles</p>
            </div>
          )}
        </div>
      </div>

      {showCreateModal && (
        <CreateGroupModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => void reloadGroups()}
        />
      )}
    </Layout>
  );
}
