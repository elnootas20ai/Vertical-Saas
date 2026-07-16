type AuthUserLike = {
  role?: string;
  isOwner?: boolean;
  isAdmin?: boolean;
  accountType?: 'user' | 'company';
  invitedBy?: string;
  employment?: { role?: string };
} | null | undefined;

/** Evita importar authApi (side-effects localStorage) en tests/libs ligeros. */
function isInvitedWorkerLike(user: AuthUserLike): boolean {
  if (!user) return false;
  return user.accountType === 'user' || Boolean(String(user.invitedBy || '').trim());
}

export type RestaurantTpvPermissions = {
  canOpenTable: boolean;
  canAddToAccount: boolean;
  canSendKitchen: boolean;
  canPay: boolean;
  canDiscount: boolean;
  canVoidComanda: boolean;
  canMoveTable: boolean;
  canCloseRegister: boolean;
  canStaffConsumption: boolean;
  /** Validar cierres de caja: solo gerente / encargado / dueño. */
  canValidateClosings: boolean;
};

function isManagerLike(user: AuthUserLike): boolean {
  const role = String(user?.role || user?.employment?.role || '').toLowerCase();
  if (['owner', 'admin', 'manager', 'gerente', 'encargado'].includes(role)) return true;
  if (user?.isOwner || user?.isAdmin) return true;
  return false;
}

/**
 * ¿Puede validar/rechazar cierres de caja?
 * Trabajador de tienda: no. Gerente / dueño / equipo encargados: sí.
 */
export function canValidateRegisterClosings(user: AuthUserLike): boolean {
  if (isManagerLike(user)) return true;
  if (user && !isInvitedWorkerLike(user)) return true;
  return false;
}

/** Permisos TPV restaurante por rol (camarero vs encargado/gerente). */
export function resolveRestaurantTpvPermissions(user: AuthUserLike): RestaurantTpvPermissions {
  const manager = isManagerLike(user);
  const canValidateClosings = canValidateRegisterClosings(user);
  return {
    canOpenTable: true,
    canAddToAccount: true,
    canSendKitchen: true,
    canPay: true,
    canDiscount: manager,
    canVoidComanda: manager,
    canMoveTable: true,
    canCloseRegister: manager,
    canStaffConsumption: manager,
    canValidateClosings,
  };
}
