import { useState, useEffect, useCallback } from 'react';
import { X, User, Building2, CreditCard, LogOut, Settings, UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { useModalClose } from '../../hooks/useModalClose';
import { InviteUserModal, type InviteUserPayload } from '../saas/InviteUserModal';
import { getInvitePermissionsForUser } from '../../lib/roleCatalog';
import type { RoleDefinition } from '../../lib/authApi';
import { isIosCustomerAccessOnlyApp } from '../../lib/appStoreCompliance';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function SAAS__ProfileModal({ isOpen, onClose }: Props) {
  const navigate = useNavigate();
  const { user } = useApp();
  const { inviteUser, listRoles } = useAuth();
  const { currentBusiness, businesses } = useBusiness();

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [roles, setRoles] = useState<RoleDefinition[]>([]);

  useModalClose(isOpen && !showInviteModal, onClose);

  const loadInviteData = useCallback(async () => {
    try {
      const rolesData = await listRoles();
      setRoles(rolesData);
    } catch {
      /* fallback to defaults inside InviteUserModal */
    }
  }, [listRoles]);

  useEffect(() => {
    if (showInviteModal && roles.length === 0) {
      void loadInviteData();
    }
  }, [showInviteModal, roles.length, loadInviteData]);

  if (!isOpen) return null;

  const handleNavigation = (path: string) => {
    onClose();
    navigate(path);
  };

  const handleLogout = () => {
    onClose();
    navigate('/');
  };

  const handleOpenInvite = () => {
    setShowInviteModal(true);
  };

  const handleInvite = async (payload: InviteUserPayload) => {
    const permissions = getInvitePermissionsForUser(payload.role, roles);
    const result = await inviteUser({
      name: payload.name,
      email: payload.email,
      role: payload.role,
      phone: payload.phone,
      permissions,
      businessId: payload.businessId || currentBusiness?.business_id,
      landingPage: payload.landingPage,
      position: payload.position,
      contractType: payload.contractType,
      grossMonthlySalary: payload.grossMonthlySalary,
      workCenterId: payload.workCenterId,
      scheduleTemplateId: payload.scheduleTemplateId,
    });
    if (!result.success) {
      throw new Error(result.error || 'No se pudo invitar al usuario.');
    }
    return {
      generatedPassword: result.generatedPassword,
      emailSent: result.emailSent,
    };
  };

  const menuItems = [
    {
      icon: User,
      label: 'Mi perfil',
      description: 'Datos personales y preferencias',
      action: () => handleNavigation('/saas/settings'),
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
    {
      icon: Building2,
      label: 'Empresa',
      description: 'Información y configuración de la empresa',
      action: () => handleNavigation('/saas/settings/empresas'),
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
    },
    {
      icon: CreditCard,
      label: 'Mi plan',
      description: isIosCustomerAccessOnlyApp()
        ? 'Consulta de plan (sin cobro en iOS)'
        : 'Plan actual y métodos de pago',
      action: () =>
        handleNavigation(
          isIosCustomerAccessOnlyApp() ? '/saas/settings' : '/saas/billing',
        ),
      color: 'text-green-600',
      bgColor: 'bg-green-100',
    },
    {
      icon: Settings,
      label: 'Configuración',
      description: 'Ajustes generales del sistema',
      action: () => handleNavigation('/saas/settings'),
      color: 'text-gray-600 dark:text-gray-400',
      bgColor: 'bg-gray-100 dark:bg-gray-700',
    },
    {
      icon: UserPlus,
      label: 'Invitar Trabajador',
      description: 'Invita a un compañero a tu equipo',
      action: handleOpenInvite,
      color: 'text-orange-600',
      bgColor: 'bg-orange-100',
    },
  ];

  if (showInviteModal) {
    return (
      <InviteUserModal
        onClose={() => setShowInviteModal(false)}
        onInvite={handleInvite}
        roles={roles}
        businesses={businesses}
        currentBusinessId={currentBusiness?.business_id}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Cuenta</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* User Info */}
        <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center text-white text-2xl font-bold">
              {user?.name?.charAt(0) || 'U'}
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {user?.name || 'Usuario'}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {user?.email || 'usuario@ejemplo.com'}
              </p>
              <div className="mt-1">
                <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-semibold rounded-full">
                  Plan Pro
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Menu Items */}
        <div className="p-4">
          <div className="space-y-2">
            {menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  onClick={item.action}
                  className="w-full flex items-start gap-4 p-4 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left group"
                >
                  <div className={`w-10 h-10 ${item.bgColor} rounded-xl flex items-center justify-center flex-shrink-0`}>
                    <Icon className={`w-5 h-5 ${item.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900 dark:text-gray-100 mb-1 group-hover:text-blue-600 transition-colors">
                      {item.label}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      {item.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Logout */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-4">
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-50 hover:bg-red-100 text-red-700 font-semibold rounded-xl transition-colors"
          >
            <LogOut className="w-5 h-5" />
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}
