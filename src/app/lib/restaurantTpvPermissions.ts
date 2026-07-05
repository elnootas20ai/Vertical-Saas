type AuthUserLike = {
  role?: string;
  isOwner?: boolean;
  isAdmin?: boolean;
  employment?: { role?: string };
} | null | undefined;

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
};

function isManagerLike(user: AuthUserLike): boolean {
  const role = String(user?.role || user?.employment?.role || '').toLowerCase();
  if (['owner', 'admin', 'manager', 'gerente', 'encargado'].includes(role)) return true;
  if (user?.isOwner || user?.isAdmin) return true;
  return false;
}

/** Permisos TPV restaurante por rol (camarero vs encargado/gerente). */
export function resolveRestaurantTpvPermissions(user: AuthUserLike): RestaurantTpvPermissions {
  const manager = isManagerLike(user);
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
  };
}
