import type { AccountPermissionMatrix, AuthUser, RoleDefinition } from './authApi';

/** Roles predefinidos (mismo criterio que Team.tsx / ROLE_TOKEN). */
const BUILTIN_ROLE_IDS = new Set(['Admin', 'Gerente', 'Comercial', 'Administración', 'Taller', 'Usuario']);

export const ROLE_PERMISSION_OPTIONS = [
  { key: 'vehicles', label: 'Vehiculos', description: 'Stock, fichas y ubicaciones' },
  { key: 'clients', label: 'Clientes', description: 'Clientes y leads' },
  { key: 'sales', label: 'Ventas', description: 'Operaciones y reservas' },
  { key: 'documents', label: 'Documentos', description: 'Plantillas y expedientes' },
  { key: 'finance', label: 'Finanzas', description: 'Cobros y control financiero' },
  { key: 'ancove', label: 'ANCOVE', description: 'Gestion de integraciones ANCOVE' },
  { key: 'team', label: 'Equipo', description: 'Usuarios, roles y permisos' },
  { key: 'delivery', label: 'Delivery', description: 'Pedidos omnicanal, cocina y reparto' },
  { key: 'sala', label: 'Sala', description: 'Gestión de mesas, comandas y cobro en sala' },
  { key: 'scrapyard', label: 'Desguace', description: 'Entrada de vehiculos, despiece y bajas' },
  { key: 'construction.collections', label: 'Cobros de obra', description: 'Ver y gestionar cobros de clientes en obras' },
] as const;

export const SCRAPYARD_PERMISSION_OPTIONS = [
  { key: 'scrapyard.entry.full', label: 'Entrada completa', description: 'Registrar, revisar y validar entradas' },
  { key: 'scrapyard.entry.basic', label: 'Entrada basica', description: 'Registrar entrada basica y fotos' },
  { key: 'scrapyard.entry.validate', label: 'Validar entradas', description: 'Aprobar/rechazar entradas registradas' },
  { key: 'scrapyard.docs.manage', label: 'Gestionar documentacion', description: 'Subir, editar y eliminar documentos' },
  { key: 'scrapyard.location.manage', label: 'Gestionar ubicaciones', description: 'Asignar y mover vehiculos' },
  { key: 'scrapyard.baja.manage', label: 'Gestionar bajas', description: 'Tramitar bajas de vehiculos' },
  { key: 'scrapyard.delete', label: 'Eliminar vehiculos', description: 'Eliminar registros de vehiculos' },
] as const;

export const DELIVERY_PERMISSION_OPTIONS = [
  { key: 'delivery.view', label: 'Ver pedidos', description: 'Ver listado de pedidos' },
  { key: 'delivery.create', label: 'Crear pedidos', description: 'Crear pedidos manualmente' },
  { key: 'delivery.edit', label: 'Editar pedidos', description: 'Editar datos de un pedido' },
  { key: 'delivery.cancel', label: 'Cancelar pedidos', description: 'Cancelar pedidos con motivo' },
  { key: 'delivery.reopen', label: 'Reabrir pedidos', description: 'Reabrir pedidos cancelados o entregados' },
  { key: 'delivery.operate', label: 'Operar pedidos', description: 'Avanzar estado del pedido' },
  { key: 'delivery.payment', label: 'Registrar cobros', description: 'Registrar cobros en pedidos' },
] as const;

export interface CreateRoleInput {
  id: string;
  description: string;
  permissions: string[];
}

export function getRoleCatalogStorageKey(scope = 'guest') {
  return `udar-custom-roles:${scope}`;
}

export function loadCustomRoles(scope = 'guest'): RoleDefinition[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = localStorage.getItem(getRoleCatalogStorageKey(scope));
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((role) => ({
        id: String(role.id || '').trim(),
        description: String(role.description || '').trim(),
        permissions: Array.isArray(role.permissions) ? role.permissions.map((permission) => String(permission)) : [],
        users: Number(role.users || 0),
      }))
      .filter((role) => role.id);
  } catch {
    return [];
  }
}

export function saveCustomRoles(scope = 'guest', roles: RoleDefinition[]) {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.setItem(getRoleCatalogStorageKey(scope), JSON.stringify(roles));
}

export function upsertCustomRole(scope: string, input: CreateRoleInput) {
  const currentRoles = loadCustomRoles(scope);
  const nextRole: RoleDefinition = {
    id: input.id.trim(),
    description: input.description.trim(),
    permissions: [...new Set(input.permissions)],
    users: 0,
  };

  const filtered = currentRoles.filter((role) => role.id.toLowerCase() !== nextRole.id.toLowerCase());
  const nextRoles = [...filtered, nextRole].sort((a, b) => a.id.localeCompare(b.id, 'es'));
  saveCustomRoles(scope, nextRoles);
  return nextRoles;
}

export function mergeRoleCatalog(
  baseRoles: RoleDefinition[],
  customRoles: RoleDefinition[],
  users: Pick<AuthUser, 'role'>[] = [],
) {
  const counts = users.reduce<Record<string, number>>((acc, user) => {
    const role = String(user.role || 'Usuario').trim() || 'Usuario';
    acc[role] = (acc[role] || 0) + 1;
    return acc;
  }, {});

  const merged = new Map<string, RoleDefinition>();

  [...baseRoles, ...customRoles].forEach((role) => {
    merged.set(role.id, {
      ...role,
      users: counts[role.id] || 0,
    });
  });

  Object.keys(counts).forEach((roleId) => {
    if (!merged.has(roleId)) {
      merged.set(roleId, {
        id: roleId,
        description: 'Rol personalizado disponible en el equipo.',
        permissions: [],
        users: counts[roleId],
      });
    }
  });

  return [...merged.values()].sort((a, b) => a.id.localeCompare(b.id, 'es'));
}

export function formatRolePermissions(permissions: string[]) {
  if (!permissions.length) {
    return 'Sin permisos base';
  }

  if (permissions.includes('all')) {
    return 'Acceso completo';
  }

  return permissions
    .map((permission) => ROLE_PERMISSION_OPTIONS.find((option) => option.key === permission)?.label || permission)
    .join(', ');
}

export function buildCustomRolePermissionMatrix(permissions: string[]): AccountPermissionMatrix {
  const matrix = Object.fromEntries(
    ROLE_PERMISSION_OPTIONS.map((option) => [option.key, { view: false, edit: false }]),
  ) as AccountPermissionMatrix;

  if (permissions.includes('all')) {
    ROLE_PERMISSION_OPTIONS.forEach((option) => {
      matrix[option.key] = { view: true, edit: true };
    });
    return matrix;
  }

  permissions.forEach((permission) => {
    if (!matrix[permission]) {
      return;
    }

    matrix[permission] = { view: true, edit: true };
  });

  return matrix;
}

/** Matriz de permisos por rol (equivalente a buildRolePermissions en Team.tsx). */
export function buildRolePermissionsMatrix(role = 'Usuario', roleDefinitions: RoleDefinition[] = []): AccountPermissionMatrix {
  const customRole = roleDefinitions.find((definition) => definition.id === role);
  if (customRole && !BUILTIN_ROLE_IDS.has(role)) {
    return buildCustomRolePermissionMatrix(customRole.permissions);
  }

  const fullAccess = role === 'Admin' || role === 'Gerente';
  const base = Object.fromEntries(
    ROLE_PERMISSION_OPTIONS.map((option) => [option.key, { view: fullAccess, edit: fullAccess }]),
  ) as AccountPermissionMatrix;

  if (fullAccess) {
    return base;
  }

  if (role === 'Comercial') {
    ['vehicles', 'clients', 'sales', 'documents'].forEach((key) => {
      base[key] = { view: true, edit: true };
    });
  }

  if (role === 'Administración') {
    ['clients', 'documents', 'finance', 'ancove'].forEach((key) => {
      base[key] = { view: true, edit: true };
    });
  }

  if (role === 'Taller') {
    base.vehicles = { view: true, edit: true };
  }

  if (role === 'Usuario') {
    base.vehicles = { view: true, edit: false };
    base.clients = { view: true, edit: false };
  }

  return base;
}

/** Permisos para inviteUser: undefined en roles predefinidos (el backend normaliza). */
export function getInvitePermissionsForUser(
  role: string,
  roleDefinitions: RoleDefinition[],
): AccountPermissionMatrix | undefined {
  if (BUILTIN_ROLE_IDS.has(role)) {
    return undefined;
  }
  return buildRolePermissionsMatrix(role, roleDefinitions);
}
