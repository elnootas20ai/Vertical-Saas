import { useEffect, useMemo, useState } from 'react';
import { History, Package, Settings, UtensilsCrossed } from 'lucide-react';
import type { AuthUser } from '../../lib/authApi';
import type { CatalogItem } from '../../lib/deliveryApi';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { VERTIAL_SURFACE } from '../../lib/vertialUiTokens';
import { StaffConsumptionsTab } from './StaffConsumptionsTab';
import { StaffConsumptionSettingsTab } from './StaffConsumptionSettingsTab';
import { StaffConsumptionProductsTab } from './StaffConsumptionProductsTab';

type StaffSection = 'history' | 'products' | 'settings';

const SECTION_TABS: { id: StaffSection; label: string; icon: typeof History }[] = [
  { id: 'history', label: 'Historial', icon: History },
  { id: 'products', label: 'Productos', icon: Package },
  { id: 'settings', label: 'Configuración', icon: Settings },
];

interface StaffConsumptionTabPanelProps {
  userId: string;
  catalogItems: CatalogItem[];
  currentUser: AuthUser;
  onCatalogUpdated?: () => void;
}

export function StaffConsumptionTabPanel({
  userId,
  catalogItems,
  currentUser,
  onCatalogUpdated,
}: StaffConsumptionTabPanelProps) {
  const { listUsers } = useAuth();
  const { currentBusiness } = useBusiness();
  const [section, setSection] = useState<StaffSection>('products');
  const [members, setMembers] = useState<AuthUser[]>([]);

  useEffect(() => {
    if (!currentBusiness?.business_id) {
      setMembers([]);
      return;
    }
    void listUsers(currentBusiness.business_id)
      .then(setMembers)
      .catch(() => setMembers([]));
  }, [currentBusiness?.business_id, listUsers]);

  const orderedMembers = useMemo(() => {
    const seen = new Set<string>();
    return members
      .filter((member) => {
        const uid = String(member.user_id || member.id || '').trim();
        if (!uid || seen.has(uid)) return false;
        seen.add(uid);
        return true;
      })
      .sort((a, b) => {
        const aId = a.user_id || a.id;
        const bId = b.user_id || b.id;
        const selfId = currentUser.user_id || currentUser.id;
        if (aId === selfId) return -1;
        if (bId === selfId) return 1;
        return (a.fullName || a.email || '').localeCompare(b.fullName || b.email || '', 'es');
      });
  }, [members, currentUser]);

  const memberCount = orderedMembers.length;

  return (
    <div className="space-y-4">
      <div className={`${VERTIAL_SURFACE} overflow-hidden`}>
        <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#2563EB]/10">
              <UtensilsCrossed className="h-4 w-4 text-[#2563EB]" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100">
                  Consumos de equipo
                </h2>
                {memberCount > 0 ? (
                  <span className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                    {memberCount} en equipo
                  </span>
                ) : null}
              </div>
              <p className="truncate text-[11px] text-stone-500">
                Precio empleado en TPV · por organizador o producto
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto sm:justify-end">
            {SECTION_TABS.map(({ id, label, icon: Icon }) => {
              const active = section === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSection(id)}
                  className={`inline-flex min-h-9 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors shrink-0 ${
                    active
                      ? 'border-[#2563EB] bg-[#2563EB] text-white'
                      : 'border-stone-200 bg-white text-stone-700 hover:border-blue-200 hover:bg-blue-50/60 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {section === 'history' ? (
        <StaffConsumptionsTab members={orderedMembers} currentUser={currentUser} />
      ) : null}

      {section === 'products' ? (
        <StaffConsumptionProductsTab
          userId={userId}
          catalogItems={catalogItems}
          onCatalogUpdated={onCatalogUpdated}
        />
      ) : null}

      {section === 'settings' ? (
        <StaffConsumptionSettingsTab
          userId={userId}
          catalogItems={catalogItems}
          onCatalogUpdated={onCatalogUpdated}
        />
      ) : null}
    </div>
  );
}
