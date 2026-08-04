import type { RoleDefinition } from './authApi';
import { isRestaurantBusinessType } from './deliveryOpsTypes';

/** Catálogo de funciones al invitar / Equipo, por vertical. IDs estables (permisos). */

export const RESTAURANT_FUNCTION_ROLES: RoleDefinition[] = [
  { id: 'Administrador', description: 'Responsable del bar o restaurante.', permissions: [], users: 0 },
  { id: 'Gestor', description: 'Gestiona equipo, altas y nóminas (RRHH).', permissions: [], users: 0 },
  { id: 'Encargado', description: 'Coordina el servicio del local (sala, barra y cocina).', permissions: [], users: 0 },
  {
    id: 'Mostrador / Atención',
    description: 'Camarero/a, barra y atención en sala.',
    permissions: [],
    users: 0,
  },
  { id: 'Cocina', description: 'Prepara comandas de sala y cocina.', permissions: [], users: 0 },
];

export const DELIVERY_FUNCTION_ROLES: RoleDefinition[] = [
  {
    id: 'Administrador',
    description: 'Responsable del negocio o del local. Supervisa equipo, caja y flujo de pedidos.',
    permissions: [],
    users: 0,
  },
  {
    id: 'Gestor',
    description: 'Gestiona equipo, altas, horarios y nóminas (RRHH).',
    permissions: [],
    users: 0,
  },
  {
    id: 'Encargado',
    description: 'Coordina el día: coger pedidos, cuidar al equipo, caja y que el local funcione.',
    permissions: [],
    users: 0,
  },
  {
    id: 'Mostrador / Atención',
    description: 'Atiende clientes, introduce pedidos en TPV y apoya en caja / recogidas.',
    permissions: [],
    users: 0,
  },
  {
    id: 'Cocina',
    description: 'Prepara y monta pedidos bien y a tiempo para mostrador o reparto.',
    permissions: [],
    users: 0,
  },
  {
    id: 'Reparto',
    description: 'Coge pedidos bien, cobra en ruta si toca y entrega a domicilio.',
    permissions: [],
    users: 0,
  },
];

export const EVENTS_FUNCTION_ROLES: RoleDefinition[] = [
  { id: 'Administrador', description: 'Gestiona equipo, permisos y operación del negocio.', permissions: [], users: 0 },
  { id: 'Gestor', description: 'Gestiona equipo, altas y nóminas (RRHH).', permissions: [], users: 0 },
  { id: 'Encargado', description: 'Coordina contrataciones, catering y logística.', permissions: [], users: 0 },
  { id: 'Comercial', description: 'Presupuestos, clientes y cierre de contratos.', permissions: [], users: 0 },
  { id: 'Operaciones', description: 'Planificación del día del evento e invitados.', permissions: [], users: 0 },
];

/** Carnicería — IDs estables; Reparto se usa si el negocio activa entregas a domicilio. */
export const BUTCHER_FUNCTION_ROLES: RoleDefinition[] = [
  {
    id: 'Administrador',
    description: 'Responsable de la carnicería. Supervisa equipo, caja, compras y trazabilidad.',
    permissions: [],
    users: 0,
  },
  {
    id: 'Gestor',
    description: 'Gestiona equipo, altas, horarios y nóminas (RRHH).',
    permissions: [],
    users: 0,
  },
  {
    id: 'Encargado',
    description: 'Coordina el día: mostrador, obrador, encargos, caja y stock.',
    permissions: [],
    users: 0,
  },
  {
    id: 'Mostrador / Atención',
    description: 'Atiende clientes, pesa y vende en TPV, gestiona encargos y recogidas.',
    permissions: [],
    users: 0,
  },
  {
    id: 'Obrador / Corte',
    description: 'Despiece, elaborados, control de lotes, merma y preparación de encargos.',
    permissions: [],
    users: 0,
  },
  {
    id: 'Reparto',
    description: 'Entrega encargos a domicilio y cobra en ruta si corresponde.',
    permissions: [],
    users: 0,
  },
];

/** Etiqueta visible en UI (el id interno no cambia: permisos / datos). */
const RESTAURANT_ROLE_LABELS: Record<string, string> = {
  Administrador: 'Administrador',
  Gestor: 'Gestor',
  Encargado: 'Encargado',
  'Mostrador / Atención': 'Sala / barra',
  Cocina: 'Cocina',
};

const BUTCHER_ROLE_LABELS: Record<string, string> = {
  Administrador: 'Administrador',
  Gestor: 'Gestor',
  Encargado: 'Encargado',
  'Mostrador / Atención': 'Mostrador',
  'Obrador / Corte': 'Obrador / Corte',
  Reparto: 'Reparto',
};

export function isButcherBusinessType(businessType?: string | null): boolean {
  return String(businessType || '').trim() === 'butcherShop';
}

export function getFunctionRolesForBusiness(
  businessType?: string | null,
  opts?: { ownDeliveryEnabled?: boolean },
): RoleDefinition[] {
  if (businessType === 'events') return EVENTS_FUNCTION_ROLES;
  if (isRestaurantBusinessType(businessType)) return RESTAURANT_FUNCTION_ROLES;
  if (isButcherBusinessType(businessType)) {
    if (opts?.ownDeliveryEnabled) return BUTCHER_FUNCTION_ROLES;
    return BUTCHER_FUNCTION_ROLES.filter((r) => r.id !== 'Reparto');
  }
  return DELIVERY_FUNCTION_ROLES;
}

export function getInviteRoleDisplayLabel(
  roleId: string | null | undefined,
  businessType?: string | null,
): string {
  const id = String(roleId || '').trim();
  if (!id) return '';
  if (isRestaurantBusinessType(businessType)) {
    return RESTAURANT_ROLE_LABELS[id] || id;
  }
  if (isButcherBusinessType(businessType)) {
    return BUTCHER_ROLE_LABELS[id] || id;
  }
  return id;
}

/** Sugerencias de cargo RRHH (texto libre `position`) al invitar. */
export function getInvitePositionSuggestions(businessType?: string | null): string[] {
  if (isRestaurantBusinessType(businessType)) {
    return [
      'Camarero/a',
      'Barista',
      'Ayudante de sala',
      'Runner / pasaplatos',
      'Encargado de sala',
      'Cocinero/a',
      'Ayudante de cocina',
      'Jefe de cocina',
    ];
  }
  if (businessType === 'events') {
    return ['Comercial', 'Coordinación', 'Operaciones', 'Montaje'];
  }
  if (isButcherBusinessType(businessType)) {
    return [
      'Mostrador',
      'Carnicero/a',
      'Ayudante de obrador',
      'Encargado/a de obrador',
      'Encargado/a',
      'Repartidor/a',
      'Cajero/a',
    ];
  }
  return [
    'Mostrador',
    'Cocinero/a',
    'Repartidor/a',
    'Encargado/a',
    'Ayudante',
  ];
}

export function suggestPositionForInviteRole(
  roleId: string | null | undefined,
  businessType?: string | null,
): string {
  const role = String(roleId || '').trim();
  if (isButcherBusinessType(businessType)) {
    if (role === 'Reparto') return 'Repartidor/a';
    if (role === 'Obrador / Corte') return 'Carnicero/a';
    if (role === 'Mostrador / Atención') return 'Mostrador';
    if (role === 'Encargado') return 'Encargado/a';
    if (role === 'Gestor') return 'Gestor RRHH';
    if (role === 'Administrador') return 'Administrador';
    return '';
  }
  if (!isRestaurantBusinessType(businessType)) {
    if (role === 'Reparto') return 'Repartidor/a';
    if (role === 'Cocina') return 'Cocinero/a';
    if (role === 'Mostrador / Atención') return 'Mostrador';
    if (role === 'Encargado') return 'Encargado/a';
    return '';
  }
  if (role === 'Cocina') return 'Cocinero/a';
  if (role === 'Mostrador / Atención') return 'Camarero/a';
  if (role === 'Encargado') return 'Encargado de sala';
  if (role === 'Gestor') return 'Gestor RRHH';
  if (role === 'Administrador') return 'Administrador';
  return '';
}
