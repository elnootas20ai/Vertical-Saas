import { useEffect, useMemo, useState } from 'react';
import { History, Package, Settings } from 'lucide-react';
import type { AuthUser } from '../../lib/authApi';
import type { CatalogItem } from '../../lib/deliveryApi';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { CatalogTabShell } from './CatalogTabShell';
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

  return (
    <CatalogTabShell
      dataUserId={userId}
      toolbarRight={
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
      }
    >
      <div className="space-y-3 p-3">
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
    </CatalogTabShell>
  );
}
