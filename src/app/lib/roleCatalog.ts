import type { AccountPermissionMatrix, AuthUser, RoleDefinition } from './authApi';
import { isRestaurantBusinessType } from './deliveryOpsTypes';
import { getRetailOpsUiCopy, RESTAURANT_DELIVERY_PERMISSION_LABELS } from './retailUiCopy';

/** Roles predefinidos (mismo criterio que Team.tsx / ROLE_TOKEN). */
const BUILTIN_ROLE_IDS = new Set(['Admin', 'Gerente', 'Comercial', 'Administración', 'Taller', 'Usuario', 'Gestor', 'Administrador', 'Encargado']);

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
  { key: 'butcher_purchases', label: 'Compras carnicería', description: 'Entradas de mercancía, lotes y costes' },
  { key: 'butcher_waste', label: 'Merma carnicería', description: 'Registrar y revisar mermas / caducados' },
] as const;

/**
 * Módulos de «Permisos de acceso» en ficha de trabajador.
 * Alineados con TEAM_PERMISSION_KEYS (couchdb) + sala (FE).
 * No incluir claves inventadas (dashboard, clockins, etc.): no están conectadas.
 */
export const VERTIAL_ACCESS_PERMISSION_MODULES = [
  { key: 'vehicles', label: 'Vehículos' },
  { key: 'clients', label: 'Clientes' },
  { key: 'sales', label: 'Ventas' },
  { key: 'reservations', label: 'Reservas' },
  { key: 'documents', label: 'Documentos' },
  { key: 'finance', label: 'Finanzas' },
  { key: 'ancove', label: 'ANCOVE' },
  { key: 'team', label: 'Equipo' },
  { key: 'fleet', label: 'Flota / Reparto' },
  { key: 'delivery', label: 'Delivery / Pedidos' },
  { key: 'sala', label: 'Sala / Mesas' },
  { key: 'cash_register', label: 'Caja / TPV' },
  { key: 'cleaning_materials', label: 'Materiales limpieza' },
  { key: 'acquisitions', label: 'Compras' },
  { key: 'butcher_purchases', label: 'Compras carnicería' },
  { key: 'butcher_waste', label: 'Merma carnicería' },
  { key: 'reports', label: 'Informes' },
  { key: 'scrapyard', label: 'Desguace' },
  { key: 'scrapyard_docs', label: 'Docs desguace' },
  { key: 'workshop', label: 'Taller' },
] as const;

export type VertialAccessPermissionKey = (typeof VERTIAL_ACCESS_PERMISSION_MODULES)[number]['key'];

/** Lista de módulos de acceso según vertical (clientes/finanzas siempre disponibles). */
export function getVertialAccessPermissionModules(businessType?: string | null) {
  const type = String(businessType || '');
  const isButcher = type === 'butcherShop';
  const isScrap = type === 'scrapyard';
  const isCleaning = type === 'cleaning';
  const isAuto = type === 'carDealership' || type === 'workshop' || type === 'spareParts';
  const isRestaurant = isRestaurantBusinessType(businessType);

  return VERTIAL_ACCESS_PERMISSION_MODULES.filter((module) => {
    if (module.key === 'butcher_purchases' || module.key === 'butcher_waste') return isButcher;
    if (module.key === 'scrapyard' || module.key === 'scrapyard_docs') return isScrap;
    if (module.key === 'cleaning_materials') return isCleaning;
    if (module.key === 'ancove' || module.key === 'vehicles' || module.key === 'workshop') {
      return isAuto || !type;
    }
    if (module.key === 'sala' || module.key === 'reservations') {
      return isRestaurant || !type;
    }
    // clients, finance, sales, documents, team, delivery, cash_register, reports, fleet, acquisitions…
    return true;
  });
}

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

export function getRolePermissionOptions(businessType?: string | null) {
  const copy = getRetailOpsUiCopy(businessType);
  const base = ROLE_PERMISSION_OPTIONS.map((option) =>
    option.key === 'delivery'
      ? {
          ...option,
          label: copy.roleDeliveryPermission,
          description: copy.roleDeliveryPermissionDescription,
        }
      : option,
  );
  if (String(businessType || '') !== 'butcherShop') {
    return base.filter((o) => o.key !== 'butcher_purchases' && o.key !== 'butcher_waste');
  }
  return base;
}

export function getDeliveryPermissionOptions(businessType?: string | null) {
  if (!isRestaurantBusinessType(businessType)) {
    return DELIVERY_PERMISSION_OPTIONS;
  }
  return DELIVERY_PERMISSION_OPTIONS.map((option) => {
    const override = RESTAURANT_DELIVERY_PERMISSION_LABELS[option.key];
    return override ? { ...option, ...override } : option;
  });
}

export interface CreateRoleInput {
  id: string;
  description: string;
  permissions: string[];
}

export function getRoleCatalogStorageKey(scope = 'guest') {
  return `vertial-custom-roles:${scope}`;
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

export function formatRolePermissions(permissions: string[], businessType?: string | null) {
  if (!permissions.length) {
    return 'Sin permisos base';
  }

  if (permissions.includes('all')) {
    return 'Acceso completo';
  }

  const options = getRolePermissionOptions(businessType);
  return permissions
    .map((permission) => options.find((option) => option.key === permission)?.label || permission)
    .join(', ');
}

/**
 * Texto de permisos para la card de Equipo → Roles.
 * Usa la matriz real del rol (aunque `role.permissions` venga vacío en el catálogo).
 */
export function formatRoleAccessSummary(
  roleId: string,
  roleDefinitions: RoleDefinition[] = [],
  businessType?: string | null,
): string {
  const custom = roleDefinitions.find((r) => r.id === roleId);
  if (custom?.permissions?.length) {
    return formatRolePermissions(custom.permissions, businessType);
  }

  const matrix = buildRolePermissionsMatrix(roleId, roleDefinitions);
  const options = getRolePermissionOptions(businessType);
  const labelByKey = (key: string) => options.find((o) => o.key === key)?.label || key;
  const active = Object.keys(matrix).filter((k) => matrix[k]?.view || matrix[k]?.edit);
  if (!active.length) return 'Sin permisos base';
  if (
    roleId === 'Admin'
    || roleId === 'Gerente'
    || roleId === 'GerenteGrupo'
    || roleId === 'Administrador'
    || roleId === 'Encargado'
    || roleId === 'Gestor'
    || roleId === 'Superadmin'
  ) {
    return 'Acceso completo al negocio';
  }
  if (active.length >= 8) return 'Acceso amplio al negocio';
  return active.map(labelByKey).join(', ');
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

/** Matriz de permisos por rol (alineada con buildDefaultPermissionMatrix en couchdb.js). */
export function buildRolePermissionsMatrix(role = 'Usuario', roleDefinitions: RoleDefinition[] = []): AccountPermissionMatrix {
  const customRole = roleDefinitions.find((definition) => definition.id === role);
  if (customRole && !BUILTIN_ROLE_IDS.has(role)) {
    return buildCustomRolePermissionMatrix(customRole.permissions);
  }

  const allEnabled =
    role === 'Admin'
    || role === 'Gerente'
    || role === 'GerenteGrupo'
    || role === 'Administrador'
    || role === 'Encargado'
    || role === 'Gestor'
    || role === 'Superadmin';

  const base = Object.fromEntries(
    ROLE_PERMISSION_OPTIONS.map((option) => [option.key, { view: allEnabled, edit: allEnabled }]),
  ) as AccountPermissionMatrix;

  if (allEnabled) {
    return base;
  }

  const presets: Record<string, string[]> = {
    Comercial: ['vehicles', 'clients', 'sales', 'documents'],
    Administración: ['clients', 'documents', 'finance', 'ancove'],
    Taller: ['workshop', 'vehicles'],
    Usuario: ['vehicles', 'clients', 'sales', 'delivery', 'sala', 'cash_register'],
    'Mostrador / Atención': ['clients', 'sales', 'delivery', 'sala', 'cash_register', 'documents', 'reservations', 'butcher_waste'],
    'Obrador / Corte': ['sales', 'documents', 'butcher_waste', 'butcher_purchases'],
    Cocina: ['delivery', 'sala', 'documents'],
    Reparto: ['delivery', 'fleet', 'sales'],
    Operaciones: ['clients', 'documents', 'sales'],
  };

  const readWriteModules = presets[role] || [];
  for (const key of readWriteModules) {
    if (base[key]) {
      base[key] = { view: true, edit: true };
    }
  }

  if (role === 'Usuario') {
    base.clients = { view: true, edit: false };
  }

  return base;
}

/** Permisos explícitos para inviteUser (siempre enviar matriz coherente con el rol). */
export function getInvitePermissionsForUser(
  role: string,
  roleDefinitions: RoleDefinition[],
): AccountPermissionMatrix {
  return buildRolePermissionsMatrix(role, roleDefinitions);
}
