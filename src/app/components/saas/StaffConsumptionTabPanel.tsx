import { useEffect, useMemo, useState } from 'react';
import { History, Settings, UtensilsCrossed } from 'lucide-react';
import type { AuthUser } from '../../lib/authApi';
import type { CatalogItem } from '../../lib/deliveryApi';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { StaffConsumptionsTab } from './StaffConsumptionsTab';
import { StaffConsumptionSettingsTab } from './StaffConsumptionSettingsTab';

type StaffSection = 'history' | 'settings';

const SECTION_TABS: { id: StaffSection; label: string; icon: typeof History }[] = [
  { id: 'history', label: 'Historial', icon: History },
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
  const [section, setSection] = useState<StaffSection>('history');
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
    <div className="space-y-5">
      <div className="rounded-2xl border-2 border-violet-300 dark:border-violet-700 bg-gradient-to-br from-violet-100 via-violet-50/90 to-white dark:from-violet-950/60 dark:via-violet-950/35 dark:to-gray-900 shadow-md shadow-violet-200/40 dark:shadow-violet-950/30 overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-violet-200/80 dark:border-violet-800/80">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-violet-600 dark:bg-violet-500 flex items-center justify-center shrink-0 shadow-sm">
              <UtensilsCrossed className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Consumos de equipo</h2>
                {memberCount > 0 && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-violet-600/15 text-violet-800 dark:text-violet-200 border border-violet-300/60 dark:border-violet-600/50">
                    {memberCount} en equipo
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                Registro de lo que consume el personal desde el TPV (precio empleado).
                {memberCount > 0 ? ' Vinculado con los trabajadores del negocio.' : ' Activa el TPV en Configuración para empezar a registrar.'}
              </p>
            </div>
          </div>
        </div>

        <div className="px-4 sm:px-5 py-3 bg-violet-200/30 dark:bg-violet-950/40">
          <div className="flex gap-2 overflow-x-auto pb-0.5 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
            {SECTION_TABS.map(({ id, label, icon: Icon }) => {
              const active = section === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSection(id)}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl text-sm font-semibold border transition-all shrink-0 ${
                    active
                      ? 'bg-violet-700 dark:bg-violet-500 text-white border-violet-700 dark:border-violet-500 shadow-sm scale-[1.02]'
                      : 'bg-white/90 dark:bg-gray-900/80 border-violet-200 dark:border-violet-800 text-violet-900 dark:text-violet-100 hover:bg-white dark:hover:bg-gray-900 hover:border-violet-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {section === 'history' && (
        <StaffConsumptionsTab
          members={orderedMembers}
          currentUser={currentUser}
        />
      )}

      {section === 'settings' && (
        <StaffConsumptionSettingsTab
          userId={userId}
          catalogItems={catalogItems}
          onCatalogUpdated={onCatalogUpdated}
        />
      )}
    </div>
  );
}
